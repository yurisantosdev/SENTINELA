from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

MUNICIPIOS_PATH = Path(__file__).parent / "data" / "municipios.json"
MUNIC_RE = re.compile(r"^\s*(\d{6,7})\s*-?\s*(.*?)\s*$")

STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "AC": (-9.0238, -70.812),
    "AL": (-9.5713, -36.782),
    "AP": (1.414, -51.77),
    "AM": (-3.4168, -65.8561),
    "BA": (-13.29, -41.7108),
    "CE": (-5.4984, -39.3206),
    "DF": (-15.7998, -47.8645),
    "ES": (-19.1834, -40.3089),
    "GO": (-15.827, -49.8362),
    "MA": (-5.42, -45.44),
    "MT": (-12.6819, -56.9211),
    "MS": (-20.7722, -54.7852),
    "MG": (-18.5122, -44.555),
    "PA": (-3.79, -52.48),
    "PB": (-7.24, -36.782),
    "PR": (-24.89, -51.55),
    "PE": (-8.38, -37.86),
    "PI": (-7.7183, -42.7289),
    "RJ": (-22.25, -42.66),
    "RN": (-5.4026, -36.9541),
    "RS": (-30.17, -53.5),
    "RO": (-10.83, -62.9),
    "RR": (2.7376, -62.0751),
    "SC": (-27.45, -50.95),
    "SP": (-22.19, -48.79),
    "SE": (-10.5741, -37.3857),
    "TO": (-10.1753, -48.2982),
}

STATE_META: dict[str, dict[str, str | int]] = {
    "AC": {"id": 12, "nome": "Acre"},
    "AL": {"id": 27, "nome": "Alagoas"},
    "AP": {"id": 16, "nome": "Amapá"},
    "AM": {"id": 13, "nome": "Amazonas"},
    "BA": {"id": 29, "nome": "Bahia"},
    "CE": {"id": 23, "nome": "Ceará"},
    "DF": {"id": 53, "nome": "Distrito Federal"},
    "ES": {"id": 32, "nome": "Espírito Santo"},
    "GO": {"id": 52, "nome": "Goiás"},
    "MA": {"id": 21, "nome": "Maranhão"},
    "MT": {"id": 51, "nome": "Mato Grosso"},
    "MS": {"id": 50, "nome": "Mato Grosso do Sul"},
    "MG": {"id": 31, "nome": "Minas Gerais"},
    "PA": {"id": 15, "nome": "Pará"},
    "PB": {"id": 25, "nome": "Paraíba"},
    "PR": {"id": 41, "nome": "Paraná"},
    "PE": {"id": 26, "nome": "Pernambuco"},
    "PI": {"id": 22, "nome": "Piauí"},
    "RJ": {"id": 33, "nome": "Rio de Janeiro"},
    "RN": {"id": 24, "nome": "Rio Grande do Norte"},
    "RS": {"id": 43, "nome": "Rio Grande do Sul"},
    "RO": {"id": 11, "nome": "Rondônia"},
    "RR": {"id": 14, "nome": "Roraima"},
    "SC": {"id": 42, "nome": "Santa Catarina"},
    "SP": {"id": 35, "nome": "São Paulo"},
    "SE": {"id": 28, "nome": "Sergipe"},
    "TO": {"id": 17, "nome": "Tocantins"},
}

_NAME_ALIASES = {
    "rio grande norte": "RN",
    "rondonia": "RO",
    "rondonia ": "RO",
}


def fold_text(value: str | None) -> str:
    text = unicodedata.normalize("NFD", str(value or "").strip().lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return " ".join(text.split())


def _build_name_to_sigla() -> dict[str, str]:
    mapping = dict(_NAME_ALIASES)
    for sigla, meta in STATE_META.items():
        mapping[fold_text(str(meta["nome"]))] = sigla
        mapping[sigla.lower()] = sigla
    return mapping


NAME_TO_SIGLA = _build_name_to_sigla()


def sigla_from_uf_name(value: str | None) -> str | None:
    folded = fold_text(value)
    if not folded or folded in {"zerado", "null", "none"} or "class" in folded:
        return None
    return NAME_TO_SIGLA.get(folded)


@dataclass(frozen=True)
class Municipality:
    ibge: str
    name: str
    lat: float
    lng: float
    uf_id: int
    sigla: str


def _sigla_from_uf_id(uf_id: int) -> str:
    for sigla, meta in STATE_META.items():
        if int(meta["id"]) == uf_id:
            return sigla
    return ""


@lru_cache
def municipality_indexes() -> tuple[dict[str, Municipality], dict[str, Municipality]]:
    by_code: dict[str, Municipality] = {}
    by_prefix: dict[str, Municipality] = {}

    payload = json.loads(MUNICIPIOS_PATH.read_text(encoding="utf-8"))
    for item in payload:
        code = str(item["c"])
        sigla = _sigla_from_uf_id(int(item["uf"]))
        municipality = Municipality(
            ibge=code,
            name=str(item["n"]),
            lat=float(item["lat"]),
            lng=float(item["lng"]),
            uf_id=int(item["uf"]),
            sigla=sigla,
        )
        by_code[code] = municipality
        prefix = code[:6]
        by_prefix.setdefault(prefix, municipality)

    return by_code, by_prefix


def lookup_municipality(raw_value: str | None) -> Municipality | None:
    match = MUNIC_RE.match(str(raw_value or ""))
    if not match:
        return None

    code = match.group(1)
    by_code, by_prefix = municipality_indexes()
    if len(code) == 7:
        return by_code.get(code)
    return by_prefix.get(code)


def parse_munic_label(raw_value: str | None) -> str:
    match = MUNIC_RE.match(str(raw_value or ""))
    if not match:
        return str(raw_value or "").strip()
    return (match.group(2) or "").strip()
