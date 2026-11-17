from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

from app.db import get_cat_collection
from app.geo import (
    STATE_META,
    Municipality,
    fold_text,
    lookup_municipality,
    municipality_indexes,
    population_by_uf,
    population_for_ibge,
    sigla_from_uf_name,
)


FIELD_UF = "UF Munic_ Empregador"
FIELD_MUNICIPALITY = "Munic Empr"
FIELD_DATE = "Data Acidente"
FIELD_DEATH = "Indica Óbito Acidente"
FIELD_TYPE = "Tipo do Acidente"
FIELD_CNAE = "CNAE2_0 Empregador_1"
FIELD_AGENT = "Agente  Causador  Acidente"

EXAMPLES = (
    "Quantos acidentes aconteceram em Santa Catarina em 2025?",
    "Qual município possui mais acidentes fatais?",
    "Qual cidade de Santa Catarina tem a maior taxa?",
    "Quais são os CNAEs com maior incidência?",
    "Qual foi a evolução dos acidentes de trajeto?",
    "Compare Chapecó com Ita.",
    "Quais agentes causadores aparecem com maior frequência?",
)

COMPARE_RE = re.compile(r"\b(?:compar\w*|compate|versus|vs|contra)\b")
PLACE_STOPWORDS = {
    "acidente",
    "acidentes",
    "agente",
    "agentes",
    "as",
    "cat",
    "cats",
    "cidade",
    "cidades",
    "com",
    "comunicacao",
    "comunicacoes",
    "contra",
    "das",
    "de",
    "do",
    "dos",
    "em",
    "entre",
    "estado",
    "estados",
    "fatais",
    "fatal",
    "maior",
    "mais",
    "menor",
    "municipio",
    "municipios",
    "na",
    "nas",
    "no",
    "nos",
    "obito",
    "obitos",
    "os",
    "para",
    "por",
    "qual",
    "quais",
    "que",
    "taxa",
    "taxas",
    "tem",
    "uma",
    "uns",
}


def ask_question(question: str) -> dict[str, Any]:
    plan = interpret(question)
    if plan["intent"] == "help":
        return _help(plan["answer"])
    try:
        return _execute(plan)
    except Exception as exc:
        return _help(_database_message(exc))


def interpret(question: str) -> dict[str, Any]:
    raw = " ".join(question.split())
    folded = fold_text(raw)
    if not folded:
        return {"intent": "help", "answer": "Escreva uma pergunta sobre as CATs importadas."}

    years = [int(year) for year in re.findall(r"\b20\d{2}\b", raw)]
    states = _find_states(folded)
    municipalities = _find_municipalities(folded, states)
    comparison = _comparison(folded, states, municipalities)
    asks_place = any(token in folded for token in ("cidade", "municip", "localidade"))
    asks_rate = any(token in folded for token in ("taxa", "100 mil", "por habitante"))
    asks_rank = any(token in folded for token in ("maior", "mais alt", "lider", "topo"))
    asks_volume = any(token in folded for token in ("mais acidente", "mais caso", "mais comunic", "maior volume", "mais cat"))

    if comparison:
        return comparison
    if asks_place and asks_rate and asks_rank:
        return {"intent": "top_rate", "sigla": states[0] if states else None}
    if any(token in folded for token in ("fata", "obito", "morte")) and any(token in folded for token in ("municip", "cidade")):
        return {"intent": "fatal_municipality", "sigla": states[0] if states else None}
    if asks_place and asks_volume and not asks_rate:
        return {"intent": "top_volume", "sigla": states[0] if states else None}
    if "cnae" in folded:
        return {"intent": "cnae"}
    if "agente" in folded:
        return {"intent": "agents"}
    if "trajeto" in folded:
        return {"intent": "commute"}
    if states and years:
        return {"intent": "count", "sigla": states[0], "year": years[0]}
    if states:
        return {"intent": "count", "sigla": states[0], "year": None}
    if years and any(token in folded for token in ("quantos", "quantidade", "total", "numero")):
        return {"intent": "count", "sigla": None, "year": years[0]}
    if folded in {"oi", "ola", "bom dia", "boa tarde", "boa noite"}:
        return {"intent": "help", "answer": "Pode perguntar sobre estados, municípios, óbitos, CNAE, trajeto e agentes causadores."}
    return {
        "intent": "help",
        "answer": "Não consegui encaixar essa pergunta. Tente uma consulta de estado, município, CNAE, trajeto, óbito ou agente.",
    }


def _execute(plan: dict[str, Any]) -> dict[str, Any]:
    intent = plan["intent"]
    if intent == "count":
        return _count(plan.get("sigla"), plan.get("year"))
    if intent == "fatal_municipality":
        return _fatal_municipalities(plan.get("sigla"))
    if intent == "top_rate":
        return _rank_municipalities(plan.get("sigla"), "rate")
    if intent == "top_volume":
        return _rank_municipalities(plan.get("sigla"), "volume")
    if intent == "cnae":
        return _top_values(FIELD_CNAE, "CNAEs com mais comunicações", "O CNAE com mais comunicações é")
    if intent == "agents":
        return _top_values(FIELD_AGENT, "Agentes causadores mais frequentes", "O agente mais frequente é")
    if intent == "commute":
        return _commute_evolution()
    if intent == "compare":
        return _compare(plan["municipalities"], plan.get("hint"), plan.get("alternatives"))
    return _help("Não consegui consultar essa pergunta.")


def _count(sigla: str | None, year: int | None) -> dict[str, Any]:
    match: dict[str, Any] = {}
    place = "o Brasil"
    if sigla:
        place = str(STATE_META[sigla]["nome"])
        match[f"dados.{FIELD_UF}"] = {"$regex": f"^\\s*{re.escape(place)}", "$options": "i"}
    if year:
        match[f"dados.{FIELD_DATE}"] = {"$regex": f"/{year}\\s*$"}
    metrics = _metrics(match)
    total = metrics["total"]
    when = f" em {year}" if year else ""
    if total == 0:
        answer = f"Não há comunicações de {place}{when} na base importada."
    else:
        answer = (
            f"{place}{when} tem {_fmt(total)} comunicações de acidente de trabalho. "
            f"{_fmt(metrics['deaths'])} indicam óbito, {_fmt(metrics['typical'])} são acidentes típicos, "
            f"{_fmt(metrics['commute'])} são de trajeto e {_fmt(metrics['disease'])} são doenças do trabalho."
        )
    indicators = [
        {"label": "Comunicações", "value": _fmt(total)},
        {"label": "Óbitos", "value": _fmt(metrics["deaths"])},
        {"label": "Trajeto", "value": _fmt(metrics["commute"])},
    ]
    if sigla and year is None:
        population = population_by_uf().get(sigla, 0)
        if population and total:
            indicators.append({"label": "Por 100 mil hab.", "value": _fmt_decimal(total * 100_000 / population)})
    rows = [
        {"label": "Típico", "value": _fmt(metrics["typical"])},
        {"label": "Trajeto", "value": _fmt(metrics["commute"])},
        {"label": "Doença", "value": _fmt(metrics["disease"])},
        {"label": "Óbito", "value": _fmt(metrics["deaths"])},
    ]
    return _payload(answer, "bar", indicators, rows)


def _fatal_municipalities(sigla: str | None = None) -> dict[str, Any]:
    match: dict[str, Any] = {f"dados.{FIELD_DEATH}": {"$regex": r"^\s*Sim", "$options": "i"}}
    if sigla:
        match[f"dados.{FIELD_UF}"] = {"$regex": rf"^\s*{re.escape(str(STATE_META[sigla]['nome']))}", "$options": "i"}
    rows = list(
        get_cat_collection().aggregate(
            [
                {"$match": match},
                {"$group": {"_id": f"$dados.{FIELD_MUNICIPALITY}", "total": {"$sum": 1}}},
                {"$sort": {"total": -1}},
                {"$limit": 8},
            ],
            allowDiskUse=True,
        )
    )
    ranked = []
    for row in rows:
        place = lookup_municipality(str(row.get("_id") or ""))
        label = f"{place.name} · {place.sigla}" if place else " ".join(str(row.get("_id") or "").split())
        if not label:
            continue
        ranked.append({"label": label, "value": _fmt(int(row.get("total") or 0)), "count": int(row.get("total") or 0)})
    if not ranked:
        return _help("Não há óbitos indicados nas CATs importadas.")
    leader = ranked[0]
    answer = f"{leader['label']} é o município com mais acidentes fatais: {leader['value']} comunicações com óbito."
    return _payload(
        answer,
        "bar",
        [{"label": "Município", "value": leader["label"]}, {"label": "Óbitos", "value": leader["value"]}],
        [{"label": item["label"], "value": item["value"]} for item in ranked],
    )


def _top_values(field: str, title: str, lead: str) -> dict[str, Any]:
    rows = list(
        get_cat_collection().aggregate(
            [
                {"$group": {"_id": {"$trim": {"input": {"$ifNull": [f"$dados.{field}", ""]}}}, "total": {"$sum": 1}}},
                {"$match": {"_id": {"$nin": ["", "{ñ class}", "{ñ class.}"]}}},
                {"$sort": {"total": -1}},
                {"$limit": 8},
            ],
            allowDiskUse=True,
        )
    )
    ranked = [{"label": " ".join(str(row.get("_id") or "").split()), "value": _fmt(int(row.get("total") or 0))} for row in rows]
    ranked = [item for item in ranked if item["label"]]
    if not ranked:
        return _help(f"Não encontrei valores para {title.lower()}.")
    answer = f"{lead} {ranked[0]['label']}, com {ranked[0]['value']} comunicações. {title}."
    return _payload(answer, "bar", [{"label": "Maior volume", "value": ranked[0]["value"]}], ranked)


def _commute_evolution() -> dict[str, Any]:
    rows = list(
        get_cat_collection().aggregate(
            [
                {"$match": {f"dados.{FIELD_TYPE}": {"$regex": r"^\s*Trajeto", "$options": "i"}}},
                {
                    "$group": {
                        "_id": {
                            "$substrCP": [
                                {"$trim": {"input": {"$ifNull": [f"$dados.{FIELD_DATE}", ""]}}},
                                6,
                                4,
                            ]
                        },
                        "total": {"$sum": 1},
                    }
                },
                {"$sort": {"_id": 1}},
            ],
            allowDiskUse=True,
        )
    )
    series = []
    for row in rows:
        year = str(row.get("_id") or "")
        if not re.fullmatch(r"20\d{2}", year):
            continue
        series.append({"label": year, "value": _fmt(int(row.get("total") or 0)), "count": int(row.get("total") or 0)})
    if not series:
        return _help("Não há acidentes de trajeto com ano identificado.")
    peak = max(series, key=lambda item: item["count"])
    answer = (
        f"Os acidentes de trajeto vão de {series[0]['label']} a {series[-1]['label']}. "
        f"O ano com mais comunicações desse tipo é {peak['label']}, com {peak['value']} registros. "
        f"No último ano da série, {series[-1]['label']}, são {series[-1]['value']}."
    )
    return _payload(
        answer,
        "line",
        [{"label": "Pico", "value": f"{peak['label']} · {peak['value']}"}, {"label": "Último ano", "value": series[-1]["value"]}],
        [{"label": item["label"], "value": item["value"]} for item in series],
    )


def _rank_municipalities(sigla: str | None, mode: str) -> dict[str, Any]:
    scope = str(STATE_META[sigla]["nome"]) if sigla else "Brasil"
    match: dict[str, Any] = {}
    if sigla:
        match[f"dados.{FIELD_UF}"] = {"$regex": rf"^\s*{re.escape(scope)}", "$options": "i"}
    pipeline: list[dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append(
        {
            "$group": {
                "_id": f"$dados.{FIELD_MUNICIPALITY}",
                "total": {"$sum": 1},
                "deaths": {"$sum": {"$cond": [_prefixed(FIELD_DEATH, "Sim"), 1, 0]}},
            }
        }
    )
    ranked = []
    for row in get_cat_collection().aggregate(pipeline, allowDiskUse=True):
        place = lookup_municipality(str(row.get("_id") or ""))
        if place is None or (sigla and place.sigla != sigla):
            continue
        total = int(row.get("total") or 0)
        population = population_for_ibge(place.ibge)
        rate = _rate(total, population)
        if mode == "rate" and (rate is None or total < 30):
            continue
        ranked.append(
            {
                "place": place,
                "total": total,
                "deaths": int(row.get("deaths") or 0),
                "population": population,
                "rate": rate or 0,
            }
        )
    ranked.sort(key=lambda item: item["rate" if mode == "rate" else "total"], reverse=True)
    ranked = ranked[:8]
    if not ranked:
        return _help(f"Não encontrei municípios com taxa calculável em {scope}.")
    leader = ranked[0]
    if mode == "rate":
        answer = (
            f"Em {scope}, {leader['place'].name} tem a maior taxa: {_fmt_decimal(leader['rate'])} CAT por 100 mil habitantes, "
            f"em {_fmt(leader['total'])} comunicações e {_fmt(leader['population'])} habitantes. "
            "A conta considera municípios com pelo menos 30 comunicações."
        )
        indicators = [
            {"label": "Município", "value": f"{leader['place'].name} · {leader['place'].sigla}"},
            {"label": "Por 100 mil hab.", "value": _fmt_decimal(leader["rate"])},
            {"label": "Comunicações", "value": _fmt(leader["total"])},
        ]
        rows = [{"label": f"{item['place'].name} · {item['place'].sigla}", "value": _fmt_decimal(item["rate"])} for item in ranked]
    else:
        answer = (
            f"Em {scope}, {leader['place'].name} tem o maior volume: {_fmt(leader['total'])} comunicações, "
            f"com {_fmt(leader['deaths'])} óbitos."
        )
        indicators = [
            {"label": "Município", "value": f"{leader['place'].name} · {leader['place'].sigla}"},
            {"label": "Comunicações", "value": _fmt(leader["total"])},
            {"label": "Óbitos", "value": _fmt(leader["deaths"])},
        ]
        rows = [{"label": f"{item['place'].name} · {item['place'].sigla}", "value": _fmt(item["total"])} for item in ranked]
    return _payload(answer, "bar", indicators, rows)


def _compare(municipalities: list[Municipality], hint: str | None = None, alternatives: list[Municipality] | None = None) -> dict[str, Any]:
    left, right = municipalities
    alternatives = alternatives or []
    left_metrics = _metrics({f"dados.{FIELD_MUNICIPALITY}": {"$regex": f"^{left.ibge[:6]}"}})
    right_metrics = _metrics({f"dados.{FIELD_MUNICIPALITY}": {"$regex": f"^{right.ibge[:6]}"}})
    left_rate = _rate(left_metrics["total"], population_for_ibge(left.ibge))
    right_rate = _rate(right_metrics["total"], population_for_ibge(right.ibge))
    more = left if left_metrics["total"] >= right_metrics["total"] else right
    more_total = left_metrics["total"] if more is left else right_metrics["total"]
    answer = (
        f"{left.name} tem {_fmt(left_metrics['total'])} comunicações e {right.name} tem {_fmt(right_metrics['total'])}. "
        f"{more.name} concentra mais casos ({_fmt(more_total)}). "
        f"Os óbitos são {_fmt(left_metrics['deaths'])} em {left.name} e {_fmt(right_metrics['deaths'])} em {right.name}."
    )
    rows = [
        {"label": f"{left.name} · comunicações", "value": _fmt(left_metrics["total"])},
        {"label": f"{right.name} · comunicações", "value": _fmt(right_metrics["total"])},
        {"label": f"{left.name} · óbitos", "value": _fmt(left_metrics["deaths"])},
        {"label": f"{right.name} · óbitos", "value": _fmt(right_metrics["deaths"])},
        {"label": f"{left.name} · trajeto", "value": _fmt(left_metrics["commute"])},
        {"label": f"{right.name} · trajeto", "value": _fmt(right_metrics["commute"])},
    ]
    indicators = [
        {"label": left.name, "value": _fmt(left_metrics["total"])},
        {"label": right.name, "value": _fmt(right_metrics["total"])},
    ]
    if left_rate is not None and right_rate is not None:
        higher = left if left_rate >= right_rate else right
        higher_rate = left_rate if higher is left else right_rate
        answer += f" Na taxa, {higher.name} fica na frente, com {_fmt_decimal(higher_rate)} CAT por 100 mil habitantes."
        indicators.append({"label": "Por 100 mil hab.", "value": f"{_fmt_decimal(left_rate)} · {_fmt_decimal(right_rate)}"})
    if hint and alternatives:
        names = ", ".join(place.name for place in alternatives[:4])
        answer += f" Li “{hint}” como {right.name}. Se for outro município, também há {names}."
        rows.extend({"label": f"Compare {left.name} com {place.name}.", "value": ""} for place in alternatives[:4])
    return _payload(answer, "bar", indicators, rows)


def _metrics(match: dict[str, Any]) -> dict[str, int]:
    pipeline: list[dict[str, Any]] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append(
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "deaths": {"$sum": {"$cond": [_prefixed(FIELD_DEATH, "Sim"), 1, 0]}},
                "typical": {"$sum": {"$cond": [_prefixed(FIELD_TYPE, "Típico"), 1, 0]}},
                "commute": {"$sum": {"$cond": [_prefixed(FIELD_TYPE, "Trajeto"), 1, 0]}},
                "disease": {"$sum": {"$cond": [_prefixed(FIELD_TYPE, "Doença"), 1, 0]}},
            }
        }
    )
    row = next(get_cat_collection().aggregate(pipeline, allowDiskUse=True), None)
    if row is None:
        return {"total": 0, "deaths": 0, "typical": 0, "commute": 0, "disease": 0}
    return {key: int(row.get(key) or 0) for key in ("total", "deaths", "typical", "commute", "disease")}


def _prefixed(field: str, prefix: str) -> dict[str, Any]:
    return {
        "$regexMatch": {
            "input": {"$trim": {"input": {"$ifNull": [f"$dados.{field}", ""]}}},
            "regex": f"^{prefix}",
            "options": "i",
        }
    }


def _comparison(folded: str, states: list[str], municipalities: list[Municipality]) -> dict[str, Any] | None:
    if not COMPARE_RE.search(folded):
        return None
    chosen = list(municipalities)
    prefer = states[0] if len(states) == 1 else chosen[0].sigla if chosen else None
    hint = None
    alternatives: list[Municipality] = []
    if len(chosen) < 2:
        taken = {fold_text(place.name) for place in chosen}
        for token in _place_tokens(folded):
            if _token_already_used(token, taken):
                continue
            chosen_ids = {place.ibge for place in chosen}
            candidates = [place for place in _prefix_candidates(token, prefer) if place.ibge not in chosen_ids]
            if not candidates:
                continue
            chosen.append(candidates[0])
            taken.add(fold_text(candidates[0].name))
            if len(candidates) > 1:
                hint = token
                alternatives = candidates[1:5]
            prefer = prefer or candidates[0].sigla
            if len(chosen) == 2:
                break
    if len(chosen) < 2:
        return None
    return {"intent": "compare", "municipalities": chosen[:2], "hint": hint, "alternatives": alternatives}


def _token_already_used(token: str, taken: set[str]) -> bool:
    return any(name == token or (name.startswith(token) and len(name) - len(token) <= 2) for name in taken)


def _place_tokens(folded: str) -> list[str]:
    text = COMPARE_RE.sub(" ", folded)
    return [token for token in re.findall(r"[a-z0-9]+", text) if len(token) >= 3 and token not in PLACE_STOPWORDS]


def _prefix_candidates(token: str, prefer_sigla: str | None) -> list[Municipality]:
    found: list[Municipality] = []
    seen: set[str] = set()
    for name, options in _municipalities_by_name():
        if not name.startswith(token):
            continue
        pool = options
        if prefer_sigla:
            scoped = tuple(item for item in options if item.sigla == prefer_sigla)
            if not scoped:
                continue
            pool = scoped
        chosen = _choose_municipality(pool, prefer_sigla)
        if chosen.ibge in seen:
            continue
        seen.add(chosen.ibge)
        found.append(chosen)
    found.sort(key=lambda item: (population_for_ibge(item.ibge), -len(item.name)), reverse=True)
    return found


def _find_states(folded: str) -> list[str]:
    found: list[tuple[int, str]] = []
    names = sorted(((fold_text(str(meta["nome"])), sigla) for sigla, meta in STATE_META.items()), key=lambda item: len(item[0]), reverse=True)
    occupied = [False] * len(folded)
    for name, sigla in names:
        for match in _phrases(folded, name):
            if any(occupied[match.start() : match.end()]):
                continue
            for index in range(match.start(), match.end()):
                occupied[index] = True
            found.append((match.start(), sigla))
    for match in re.finditer(r"\b([a-z]{2})\b", folded):
        sigla = sigla_from_uf_name(match.group(1))
        if sigla and not any(occupied[match.start() : match.end()]):
            found.append((match.start(), sigla))
    found.sort()
    unique = []
    for _, sigla in found:
        if sigla not in unique:
            unique.append(sigla)
    return unique


def _find_municipalities(folded: str, states: list[str]) -> list[Municipality]:
    occupied = [False] * len(folded)
    for sigla in states:
        name = fold_text(str(STATE_META[sigla]["nome"]))
        for match in _phrases(folded, name):
            for index in range(match.start(), match.end()):
                occupied[index] = True
    chosen_state = states[0] if len(states) == 1 else None
    found: list[tuple[int, Municipality]] = []
    for name, options in _municipalities_by_name():
        if len(name) < 4:
            continue
        for match in _phrases(folded, name):
            if any(occupied[match.start() : match.end()]):
                continue
            for index in range(match.start(), match.end()):
                occupied[index] = True
            found.append((match.start(), _choose_municipality(options, chosen_state)))
    found.sort(key=lambda item: item[0])
    return [municipality for _, municipality in found]


@lru_cache
def _municipalities_by_name() -> tuple[tuple[str, tuple[Municipality, ...]], ...]:
    grouped: dict[str, list[Municipality]] = {}
    for municipality in municipality_indexes()[0].values():
        grouped.setdefault(fold_text(municipality.name), []).append(municipality)
    items = [(name, tuple(options)) for name, options in grouped.items()]
    items.sort(key=lambda item: len(item[0]), reverse=True)
    return tuple(items)


def _choose_municipality(options: tuple[Municipality, ...], sigla: str | None) -> Municipality:
    if sigla:
        scoped = [item for item in options if item.sigla == sigla]
        if scoped:
            options = tuple(scoped)
    return max(options, key=lambda item: population_for_ibge(item.ibge))


def _phrases(text: str, phrase: str):
    if not phrase:
        return []
    return list(re.finditer(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", text))


def _payload(answer: str, chart: str, indicators: list[dict[str, str]], rows: list[dict[str, str]]) -> dict[str, Any]:
    return {"answer": answer, "chart": chart, "indicators": indicators, "rows": rows}


def _help(answer: str) -> dict[str, Any]:
    return _payload(answer, "none", [], [{"label": example, "value": ""} for example in EXAMPLES])


def _rate(total: int, population: int) -> float | None:
    if population <= 0 or total <= 0:
        return None
    return total * 100_000 / population


def _fmt(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def _fmt_decimal(value: float) -> str:
    return f"{value:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _database_message(exc: Exception) -> str:
    text = str(exc)
    if "Connection refused" in text or "ServerSelectionTimeout" in text or "timed out" in text.lower():
        return "O MongoDB local não está acessível. Inicie o banco e importe as CATs para conversar com os dados."
    return "Não foi possível consultar as CATs agora."
