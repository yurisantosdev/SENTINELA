from __future__ import annotations

import time
from threading import Lock
from typing import Any

from pymongo.collection import Collection

from app.db import get_cat_collection
from app.geo import (
    STATE_CENTROIDS,
    STATE_META,
    lookup_municipality,
    parse_munic_label,
    population_by_uf,
    population_for_ibge,
    sigla_from_uf_name,
)

FIELD_UF_EMPLOYER = "UF Munic_ Empregador"
FIELD_MUNICIPALITY = "Munic Empr"
FIELD_DEATH = "Indica Óbito Acidente"
FIELD_TYPE = "Tipo do Acidente"
CACHE_TTL_SECONDS = 1800

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = Lock()
_uf_raw_values: dict[str, list[str]] = {}


def _count_if_prefix(field: str, prefix: str) -> dict[str, Any]:
    return {
        "$sum": {
            "$cond": [
                {
                    "$eq": [
                        {
                            "$substrCP": [
                                {"$trim": {"input": {"$ifNull": [f"$dados.{field}", ""]}}},
                                0,
                                len(prefix),
                            ]
                        },
                        prefix,
                    ]
                },
                1,
                0,
            ]
        }
    }


GROUP_METRICS = {
    "total": {"$sum": 1},
    "deaths": _count_if_prefix(FIELD_DEATH, "Sim"),
    "typical": _count_if_prefix(FIELD_TYPE, "Típico"),
    "commute": _count_if_prefix(FIELD_TYPE, "Trajeto"),
    "disease": _count_if_prefix(FIELD_TYPE, "Doença"),
}


def ensure_indexes(collection: Collection | None = None) -> None:
    target = collection if collection is not None else get_cat_collection()
    target.create_index(f"dados.{FIELD_UF_EMPLOYER}")
    target.create_index(f"dados.{FIELD_MUNICIPALITY}")


def _cache_get(key: str) -> Any | None:
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        stored_at, value = entry
        if time.monotonic() - stored_at > CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        return value


def _cache_set(key: str, value: Any) -> Any:
    with _cache_lock:
        _cache[key] = (time.monotonic(), value)
    return value


def _empty_metrics() -> dict[str, int]:
    return {"total": 0, "deaths": 0, "typical": 0, "commute": 0, "disease": 0}


def rate_per_100k(total: int, population: int) -> float | None:
    if population <= 0:
        return None
    return round(total * 100_000 / population, 1)


def _with_rate(metrics: dict[str, int], population: int) -> dict[str, Any]:
    return {
        **metrics,
        "population": population,
        "rate": rate_per_100k(metrics["total"], population),
    }


def _sort_by_rate(items: list[dict[str, Any]]) -> None:
    items.sort(key=lambda item: (item.get("rate") is not None, item.get("rate") or 0), reverse=True)


def _add_metrics(target: dict[str, int], source: dict[str, Any]) -> None:
    for key in target:
        target[key] += int(source.get(key) or 0)


def summarize_ufs() -> dict[str, Any]:
    cached = _cache_get("ufs")
    if cached is not None:
        return cached

    collection = get_cat_collection()
    ensure_indexes(collection)

    grouped = list(
        collection.aggregate(
            [{"$group": {"_id": f"$dados.{FIELD_UF_EMPLOYER}", **GROUP_METRICS}}],
            allowDiskUse=True,
        )
    )

    by_sigla: dict[str, dict[str, int]] = {sigla: _empty_metrics() for sigla in STATE_META}
    unknown = _empty_metrics()
    raw_values: dict[str, list[str]] = {sigla: [] for sigla in STATE_META}

    for row in grouped:
        raw_name = str(row.get("_id") or "")
        sigla = sigla_from_uf_name(raw_name)
        bucket = by_sigla.get(sigla) if sigla else unknown
        if bucket is None:
            bucket = unknown
        _add_metrics(bucket, row)
        if sigla and raw_name:
            raw_values[sigla].append(row.get("_id"))

    with _cache_lock:
        _uf_raw_values.clear()
        _uf_raw_values.update(raw_values)

    populations = population_by_uf()
    ufs = []
    for sigla, meta in STATE_META.items():
        metrics = by_sigla[sigla]
        lat, lng = STATE_CENTROIDS[sigla]
        ufs.append(
            {
                "sigla": sigla,
                "nome": meta["nome"],
                "lat": lat,
                "lng": lng,
                **_with_rate(metrics, populations.get(sigla, 0)),
            }
        )

    _sort_by_rate(ufs)
    located_total = sum(item["total"] for item in ufs)
    population = sum(populations.values())
    payload = {
        **_with_rate(
            {
                "total": located_total + unknown["total"],
                "deaths": sum(item["deaths"] for item in ufs) + unknown["deaths"],
                "typical": sum(item["typical"] for item in ufs) + unknown["typical"],
                "commute": sum(item["commute"] for item in ufs) + unknown["commute"],
                "disease": sum(item["disease"] for item in ufs) + unknown["disease"],
            },
            population,
        ),
        "unknown": unknown["total"],
        "ufs": ufs,
    }
    return _cache_set("ufs", payload)


def municipalities_for_uf(sigla: str) -> dict[str, Any]:
    code = sigla.upper()
    if code not in STATE_META:
        raise KeyError(code)

    cache_key = f"munic:{code}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    collection = get_cat_collection()
    ensure_indexes(collection)
    uf_id = int(STATE_META[code]["id"])

    if not _uf_raw_values.get(code):
        summarize_ufs()

    raw_values = [value for value in _uf_raw_values.get(code, []) if value]
    if not raw_values:
        raw_values = [STATE_META[code]["nome"]]

    grouped = list(
        collection.aggregate(
            [
                {"$match": {f"dados.{FIELD_UF_EMPLOYER}": {"$in": raw_values}}},
                {
                    "$group": {
                        "_id": f"$dados.{FIELD_MUNICIPALITY}",
                        **GROUP_METRICS,
                    }
                },
            ],
            allowDiskUse=True,
        )
    )

    points = []
    unlocated = _empty_metrics()
    for row in grouped:
        municipality = lookup_municipality(str(row.get("_id") or ""))
        if municipality is None or municipality.uf_id != uf_id:
            _add_metrics(unlocated, row)
            continue

        metrics = {
            "total": int(row.get("total") or 0),
            "deaths": int(row.get("deaths") or 0),
            "typical": int(row.get("typical") or 0),
            "commute": int(row.get("commute") or 0),
            "disease": int(row.get("disease") or 0),
        }
        points.append(
            {
                "id": municipality.ibge,
                "ibge": municipality.ibge,
                "name": municipality.name or parse_munic_label(str(row.get("_id") or "")),
                "uf": code,
                "lat": municipality.lat,
                "lng": municipality.lng,
                **_with_rate(metrics, population_for_ibge(municipality.ibge)),
            }
        )

    _sort_by_rate(points)
    payload = {
        "uf": code,
        "nome": STATE_META[code]["nome"],
        "total": sum(item["total"] for item in points) + unlocated["total"],
        "unlocated": unlocated["total"],
        "points": points,
    }
    return _cache_set(cache_key, payload)


def warmup_map_cache() -> None:
    summarize_ufs()
