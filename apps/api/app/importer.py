from __future__ import annotations

import hashlib
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Any, Iterable

import pandas as pd
import requests
from pymongo import MongoClient, UpdateOne
from pymongo.collection import Collection
from pymongo.errors import ServerSelectionTimeoutError

from app.ckan import Resource, discover_resources
from app.config import Settings
from app.job_state import JobState


class CatImporter:
    def __init__(self, settings: Settings, state: JobState) -> None:
        self._settings = settings
        self._state = state

    def run(self, dataset_url: str, resource_ids: list[str]) -> None:
        self._state.start(dataset_url)

        try:
            with requests.Session() as session:
                session.headers.update({"User-Agent": "SentinelaBot/1.0"})
                resources = discover_resources(
                    session,
                    dataset_url,
                    resource_ids,
                    tag=self._settings.sentinela_tag,
                )

                if not resources:
                    raise RuntimeError("Nenhum recurso CSV/XLS/XLSX/ZIP foi encontrado para importação.")

                self._state.set_resources_total(len(resources))

                self._state.log(f"Conectando ao MongoDB em {self._settings.mongo_uri}.")
                client = MongoClient(self._settings.mongo_uri, serverSelectionTimeoutMS=5000)
                try:
                    client.admin.command("ping")
                except ServerSelectionTimeoutError as exc:
                    raise RuntimeError(
                        "MongoDB local não está acessível. Inicie com `docker compose up -d mongo` "
                        "ou rode `npm run dev` pela raiz do projeto."
                    ) from exc

                collection = client[self._settings.mongo_database][self._settings.mongo_collection]
                self._prepare_collection(collection)
                deleted = collection.delete_many({}).deleted_count
                self._state.log(f"Dados anteriores apagados: {deleted} documentos removidos.")
                self._state.log(
                    f"MongoDB conectado: {self._settings.mongo_database}.{self._settings.mongo_collection}."
                )

                for resource in resources:
                    self._import_resource(session, collection, resource)

            self._state.finish()
        except Exception as exc:
            self._state.fail(str(exc))

    def _prepare_collection(self, collection: Collection) -> None:
        collection.create_index("row_hash", unique=True)
        collection.create_index("resource.id")
        collection.create_index("imported_at")

    def _import_resource(
        self,
        session: requests.Session,
        collection: Collection,
        resource: Resource,
    ) -> None:
        self._state.set_current_resource(resource.name)

        try:
            for frame in _read_resource_frames(session, resource):
                inserted = _upsert_frame(collection, resource, frame)
                self._state.add_rows(len(frame), inserted)

            self._state.complete_resource()
            self._state.log(f"Recurso concluído: {resource.name}")
        except Exception as exc:
            self._state.complete_resource()
            self._state.add_error(f"Falha no recurso {resource.name}: {exc}")


def _read_resource_frames(
    session: requests.Session,
    resource: Resource,
) -> Iterable[pd.DataFrame]:
    temp_path = _download_to_temp_file(session, resource)
    try:
        with open(temp_path, "rb") as downloaded_file:
            payload = io.BytesIO(downloaded_file.read())

        if _is_zip_resource(resource, payload):
            yield from _read_zip_frames(payload)
            return

        file_format = _guess_format(resource.url) or resource.format.upper()

        if file_format == "CSV":
            yield from _read_csv_frames(payload)
            return

        if file_format in {"XLS", "XLSX"}:
            yield from _read_excel_frames(payload)
            return

        raise RuntimeError(f"Formato não suportado: {resource.format or resource.url}")
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass


def _download_to_temp_file(session: requests.Session, resource: Resource) -> str:
    suffix = f".{_guess_format(resource.url).lower()}" if _guess_format(resource.url) else ".download"
    response = session.get(resource.url, timeout=180, stream=True)
    response.raise_for_status()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                temp_file.write(chunk)
        return temp_file.name


def _read_zip_frames(payload: io.BytesIO) -> Iterable[pd.DataFrame]:
    payload.seek(0)
    found_supported_file = False

    with zipfile.ZipFile(payload) as archive:
        for file_info in archive.infolist():
            if file_info.is_dir():
                continue

            inner_format = _guess_format(file_info.filename)
            if inner_format not in {"CSV", "XLS", "XLSX"}:
                continue

            found_supported_file = True
            with archive.open(file_info) as inner_file:
                inner_payload = io.BytesIO(inner_file.read())
                if inner_format == "CSV":
                    yield from _read_csv_frames(inner_payload)
                else:
                    yield from _read_excel_frames(inner_payload)

    if not found_supported_file:
        raise RuntimeError("ZIP não contém arquivos CSV, XLS ou XLSX.")


def _read_csv_frames(payload: io.BytesIO) -> Iterable[pd.DataFrame]:
    last_error: Exception | None = None

    for encoding in ("utf-8-sig", "latin1"):
        payload.seek(0)
        try:
            reader = pd.read_csv(
                payload,
                chunksize=5000,
                dtype=object,
                encoding=encoding,
                engine="python",
                sep=None,
            )
            for frame in reader:
                yield _normalize_columns(frame)
            return
        except UnicodeDecodeError as exc:
            last_error = exc

    if last_error:
        raise last_error


def _read_excel_frames(payload: io.BytesIO) -> Iterable[pd.DataFrame]:
    payload.seek(0)
    sheets = pd.read_excel(payload, dtype=object, sheet_name=None)

    for sheet_name, frame in sheets.items():
        if len(sheets) > 1:
            frame = frame.copy()
            frame["_planilha"] = sheet_name
        yield _normalize_columns(frame)


def _normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame.columns = [_clean_key(str(column)) for column in frame.columns]
    return frame


def _upsert_frame(collection: Collection, resource: Resource, frame: pd.DataFrame) -> int:
    operations: list[UpdateOne] = []
    imported_at = datetime.now(timezone.utc)

    for row in frame.to_dict(orient="records"):
        data = {_clean_key(str(key)): _clean_value(value) for key, value in row.items()}
        row_hash = _row_hash(resource.id, data)
        document = {
            "row_hash": row_hash,
            "resource": {
                "id": resource.id,
                "name": resource.name,
                "format": resource.format,
                "url": resource.url,
                "package_name": resource.package_name,
                "package_title": resource.package_title,
                "mimetype": resource.mimetype,
            },
            "dados": data,
            "imported_at": imported_at,
        }
        operations.append(
            UpdateOne(
                {"row_hash": row_hash},
                {"$setOnInsert": document},
                upsert=True,
            )
        )

    if not operations:
        return 0

    result = collection.bulk_write(operations, ordered=False)
    return result.upserted_count


def _row_hash(resource_id: str, data: dict[str, Any]) -> str:
    payload = json.dumps({"resource_id": resource_id, "data": data}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _clean_key(key: str) -> str:
    cleaned = key.strip().replace(".", "_")
    return cleaned.lstrip("$") or "campo_sem_nome"


def _clean_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    if hasattr(value, "item"):
        return value.item()
    return value


def _is_zip_resource(resource: Resource, payload: io.BytesIO) -> bool:
    payload.seek(0)
    is_zip = (
        resource.url.lower().endswith(".zip")
        or resource.format.upper() == "ZIP"
        or "zip" in resource.mimetype.lower()
        or zipfile.is_zipfile(payload)
    )
    payload.seek(0)
    return is_zip


def _guess_format(path: str) -> str:
    lower_path = path.lower()
    if lower_path.endswith(".csv"):
        return "CSV"
    if lower_path.endswith(".xlsx"):
        return "XLSX"
    if lower_path.endswith(".xls"):
        return "XLS"
    return ""
