from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from threading import Lock
from typing import Any

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from app.db import get_cat_collection


SAMPLE_SIZE = 50_000
MIN_ROWS = 400
MIN_CLASS = 40
CACHE_TTL_SECONDS = 1800

QUESTION = "Quais características da CAT se associam a uma comunicação com óbito?"
ALGORITHM = "Regressão logística"
FAMILY = "Classificador supervisionado interpretável"
REFERENCE = (
    "As razões de chances comparam cada fator com acidente típico, sexo masculino, "
    "30 a 49 anos, parte do corpo não destacada e demais setores econômicos."
)

FEATURES = (
    "tipo_trajeto",
    "tipo_doenca",
    "tipo_outro",
    "sexo_feminino",
    "sexo_ignorado",
    "idade_ate_29",
    "idade_50_64",
    "idade_65_mais",
    "idade_desconhecida",
    "corpo_cabeca",
    "corpo_tronco",
    "corpo_membros",
    "corpo_multiplas",
    "setor_agro",
    "setor_industria",
    "setor_construcao",
    "setor_transporte",
    "setor_saude",
)

LABELS = {
    "tipo_trajeto": "Acidente de trajeto",
    "tipo_doenca": "Doença relacionada ao trabalho",
    "tipo_outro": "Tipo de acidente não classificado",
    "sexo_feminino": "Sexo feminino",
    "sexo_ignorado": "Sexo não informado",
    "idade_ate_29": "Idade até 29 anos",
    "idade_50_64": "Idade de 50 a 64 anos",
    "idade_65_mais": "Idade de 65 anos ou mais",
    "idade_desconhecida": "Idade desconhecida",
    "corpo_cabeca": "Lesão na cabeça",
    "corpo_tronco": "Lesão no tronco",
    "corpo_membros": "Lesão em membros",
    "corpo_multiplas": "Lesão em múltiplas partes",
    "setor_agro": "Setor de agropecuária",
    "setor_industria": "Setor industrial",
    "setor_construcao": "Setor de construção",
    "setor_transporte": "Setor de transporte",
    "setor_saude": "Setor de saúde",
}

_cache: dict[str, Any] | None = None
_cache_at: float | None = None
_lock = Lock()


def risk_report(force: bool = False) -> dict[str, Any]:
    global _cache, _cache_at

    now = datetime.now(timezone.utc).timestamp()
    with _lock:
        if (
            not force
            and _cache is not None
            and _cache_at is not None
            and now - _cache_at < CACHE_TTL_SECONDS
            and _cache.get("status") == "ready"
        ):
            return _cache

        try:
            records = _load_sample()
        except Exception as exc:
            return _unavailable(_database_message(exc))

        report = fit_risk_model(records)
        if report["status"] == "ready":
            _cache = report
            _cache_at = now
        return report


def fit_risk_model(records: list[dict[str, Any]]) -> dict[str, Any]:
    rows = [encoded for encoded in (_encode(record) for record in records) if encoded is not None]
    if len(rows) < MIN_ROWS:
        return _insufficient(
            len(rows),
            "Ainda não há CATs suficientes com indicação de óbito preenchida. "
            f"São necessárias pelo menos {MIN_ROWS} comunicações rotuladas.",
        )

    frame = pd.DataFrame(rows)
    deaths = int(frame["obito"].sum())
    survivors = int(len(frame) - deaths)
    if deaths < MIN_CLASS or survivors < MIN_CLASS:
        return _insufficient(
            len(frame),
            "A amostra não tem óbitos e não óbitos suficientes para separar treino e teste.",
        )

    usable = [feature for feature in FEATURES if frame[feature].nunique() > 1]
    if not usable:
        return _insufficient(len(frame), "As comunicações importadas não variam nos fatores usados pelo modelo.")

    x_train, x_test, y_train, y_test = train_test_split(
        frame[usable],
        frame["obito"],
        test_size=0.2,
        random_state=7,
        stratify=frame["obito"],
    )
    model = LogisticRegression(class_weight="balanced", max_iter=1000, solver="lbfgs")
    model.fit(x_train, y_train)
    probabilities = model.predict_proba(x_test)[:, 1]
    auc = float(roc_auc_score(y_test, probabilities))

    factors = []
    for feature, coefficient in zip(usable, model.coef_[0]):
        coefficient = float(coefficient)
        factors.append(
            {
                "code": feature,
                "label": LABELS[feature],
                "coefficient": round(coefficient, 4),
                "odds_ratio": round(math.exp(coefficient), 3),
                "effect": "aumenta" if coefficient > 0 else "reduz",
            }
        )
    factors.sort(key=lambda factor: abs(factor["coefficient"]), reverse=True)

    death_rate = deaths / len(frame)
    return {
        "status": "ready",
        "algorithm": ALGORITHM,
        "family": FAMILY,
        "question": QUESTION,
        "message": _reading(factors, death_rate),
        "sample_size": int(len(frame)),
        "deaths": deaths,
        "death_rate": round(death_rate, 4),
        "holdout_size": int(len(y_test)),
        "auc": round(auc, 3),
        "factors": factors,
        "reference": REFERENCE,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def _load_sample() -> list[dict[str, Any]]:
    collection = get_cat_collection()
    cursor = collection.aggregate(
        [
            {"$sample": {"size": SAMPLE_SIZE}},
            {"$project": {"_id": 0, "dados": 1}},
        ],
        allowDiskUse=True,
    )
    return [document.get("dados") or {} for document in cursor]


def _encode(dados: dict[str, Any]) -> dict[str, int] | None:
    if not isinstance(dados, dict):
        return None

    death = _death_flag(_text(dados, "indica obito acidente", "indica óbito acidente"))
    if death is None:
        return None

    accident_type = _fold(_text(dados, "tipo do acidente"))
    sex = _fold(_text(dados, "sexo"))
    body = _body_group(_text(dados, "parte corpo atingida"))
    sector = _sector(_text(dados, "cnae2_0 empregador", "cnae2 0 empregador", "cnae"))
    age_band = _age_band(
        _text(dados, "data nascimento"),
        _text(dados, "data acidente"),
    )

    return {
        "obito": death,
        "tipo_trajeto": int(accident_type.startswith("trajeto")),
        "tipo_doenca": int(accident_type.startswith("doenca")),
        "tipo_outro": int(
            not accident_type.startswith("tipico")
            and not accident_type.startswith("trajeto")
            and not accident_type.startswith("doenca")
        ),
        "sexo_feminino": int(sex.startswith("fem")),
        "sexo_ignorado": int(not sex.startswith("masc") and not sex.startswith("fem")),
        "idade_ate_29": int(age_band == "ate_29"),
        "idade_50_64": int(age_band == "50_64"),
        "idade_65_mais": int(age_band == "65_mais"),
        "idade_desconhecida": int(age_band == "desconhecida"),
        "corpo_cabeca": int(body == "cabeca"),
        "corpo_tronco": int(body == "tronco"),
        "corpo_membros": int(body == "membros"),
        "corpo_multiplas": int(body == "multiplas"),
        "setor_agro": int(sector == "agro"),
        "setor_industria": int(sector == "industria"),
        "setor_construcao": int(sector == "construcao"),
        "setor_transporte": int(sector == "transporte"),
        "setor_saude": int(sector == "saude"),
    }


def _death_flag(value: str) -> int | None:
    folded = _fold(value)
    if folded.startswith("sim") or folded in {"s", "1"}:
        return 1
    if folded.startswith("nao") or folded in {"n", "0"}:
        return 0
    return None


def _age_band(birth: str, accident: str) -> str:
    birth_date = _parse_date(birth)
    accident_date = _parse_date(accident)
    if birth_date is None or accident_date is None:
        return "desconhecida"
    age = accident_date.year - birth_date.year - (
        (accident_date.month, accident_date.day) < (birth_date.month, birth_date.day)
    )
    if age < 14 or age > 100:
        return "desconhecida"
    if age <= 29:
        return "ate_29"
    if age <= 49:
        return "30_49"
    if age <= 64:
        return "50_64"
    return "65_mais"


def _sector(cnae: str) -> str:
    digits = re.sub(r"\D", "", cnae)
    if len(digits) < 2:
        return "outros"
    division = int(digits[:2])
    if division <= 3:
        return "agro"
    if division <= 33:
        return "industria"
    if 41 <= division <= 43:
        return "construcao"
    if 49 <= division <= 53:
        return "transporte"
    if division == 86:
        return "saude"
    return "outros"


def _body_group(value: str) -> str:
    folded = _fold(value)
    tokens = set(folded.split())
    if "multipl" in folded:
        return "multiplas"
    if any(token in folded for token in ("cabeca", "cranio", "face", "olho", "ouvido", "boca", "nariz")):
        return "cabeca"
    if any(token in folded for token in ("torax", "dorso", "abdom", "pescoco", "quadril")):
        return "tronco"
    if tokens.intersection({"pe", "pes", "mao", "dedo"}) or any(
        token in folded for token in ("braco", "antebraco", "perna", "joelho", "punho", "cotovelo")
    ):
        return "membros"
    return "outros"


def _text(dados: dict[str, Any], *needles: str) -> str:
    normalized = {_fold(str(key)): value for key, value in dados.items()}
    for needle in needles:
        folded_needle = _fold(needle)
        for key, value in normalized.items():
            if folded_needle in key and value is not None:
                return str(value).strip()
    return ""


def _parse_date(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    for fmt, size in (("%Y-%m-%d", 10), ("%d/%m/%Y", 10), ("%Y-%m-%d %H:%M:%S", 19)):
        try:
            return datetime.strptime(text[:size], fmt)
        except ValueError:
            continue
    parsed = pd.to_datetime(text, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.to_pydatetime()


def _fold(value: str) -> str:
    table = str.maketrans(
        {
            "á": "a",
            "à": "a",
            "â": "a",
            "ã": "a",
            "é": "e",
            "ê": "e",
            "í": "i",
            "ó": "o",
            "ô": "o",
            "õ": "o",
            "ú": "u",
            "ç": "c",
            ".": " ",
            "_": " ",
        }
    )
    return " ".join(value.lower().translate(table).split())


def _reading(factors: list[dict[str, Any]], death_rate: float) -> str:
    increasing = [factor["label"].lower() for factor in factors if factor["coefficient"] > 0][:2]
    decreasing = [factor["label"].lower() for factor in factors if factor["coefficient"] < 0][:1]
    parts: list[str] = []
    if increasing:
        parts.append(
            f"Na amostra, {' e '.join(increasing)} se associam a uma chance maior de a CAT indicar óbito."
        )
    if decreasing:
        parts.append(f"{decreasing[0][:1].upper()}{decreasing[0][1:]} se associa a uma chance menor.")
    parts.append(
        f"A taxa de óbito na amostra de treino foi de {death_rate * 100:.1f}%. "
        "Os números descrevem associação estatística, não causa."
    )
    return " ".join(parts)


def _insufficient(sample_size: int, message: str) -> dict[str, Any]:
    return {
        "status": "insufficient",
        "algorithm": ALGORITHM,
        "family": FAMILY,
        "question": QUESTION,
        "message": message,
        "sample_size": sample_size,
        "deaths": 0,
        "death_rate": None,
        "holdout_size": 0,
        "auc": None,
        "factors": [],
        "reference": REFERENCE,
        "trained_at": None,
    }


def _database_message(exc: Exception) -> str:
    text = str(exc)
    if "Connection refused" in text or "ServerSelectionTimeout" in text or "timed out" in text.lower():
        return (
            "O MongoDB local não está acessível. Inicie o banco, importe as CATs e atualize esta leitura."
        )
    return "Não foi possível ler as CATs importadas para treinar a regressão logística."


def _unavailable(message: str) -> dict[str, Any]:
    report = _insufficient(0, message)
    report["status"] = "unavailable"
    return report
