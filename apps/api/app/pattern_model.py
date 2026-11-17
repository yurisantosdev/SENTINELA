from __future__ import annotations

import re
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.cat_map import summarize_ufs
from app.db import get_cat_collection
from app.geo import lookup_municipality, population_for_ibge


CACHE_TTL_SECONDS = 1800
MIN_PREVIOUS = 80
MIN_RECENT = 50
ANOMALY_PERCENT = 20
MONTH_NAMES = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
WEEKDAY_LABELS = ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")
REGIONS = {
    "Norte": (["AC", "AM", "AP", "PA", "RO", "RR", "TO"], "#0d9488"),
    "Nordeste": (["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"], "#ea580c"),
    "Centro-Oeste": (["DF", "GO", "MT", "MS"], "#ca8a04"),
    "Sudeste": (["ES", "MG", "RJ", "SP"], "#2563eb"),
    "Sul": (["PR", "RS", "SC"], "#009c3b"),
}
SECTOR_LABELS = {
    "agro": "Agropecuária",
    "industria": "Indústria",
    "construcao": "Construção",
    "comercio": "Comércio",
    "transporte": "Transporte",
    "saude": "Saúde",
    "outros": "Demais setores",
}

_cache: dict[str, Any] | None = None
_cache_at: float | None = None
_lock = Lock()


def pattern_report(force: bool = False) -> dict[str, Any]:
    global _cache, _cache_at

    now = datetime.now(timezone.utc).timestamp()
    with _lock:
        if not force and _cache is not None and _cache_at is not None and now - _cache_at < CACHE_TTL_SECONDS:
            return _cache
        try:
            facts = _load_facts()
            ufs = summarize_ufs().get("ufs") or []
        except Exception as exc:
            return _unavailable(_database_message(exc))

        report = build_pattern_report(facts, ufs)
        if report["status"] == "ready":
            _cache = report
            _cache_at = now
        return report


def build_pattern_report(facts: dict[str, Any], ufs: list[dict[str, Any]]) -> dict[str, Any]:
    monthly = _monthly_series(facts.get("monthly") or [])
    if len(monthly) < 6:
        return _insufficient("Ainda não há meses suficientes nas CATs para comparar períodos.")

    usable_months = _complete_months({row["month"]: row["total"] for row in monthly})
    if len(usable_months) < 6:
        return _insufficient("Os meses mais recentes ainda não fecharam volume suficiente para a comparação.")

    recent_months = usable_months[-3:]
    previous_months = usable_months[-6:-3]
    sector_rows = [_with_sector(row) for row in facts.get("sector_month") or []]
    machine_rows = [_with_sector(row) for row in facts.get("machine_month") or []]
    anomalies = _anomalies(machine_rows, recent_months, previous_months, "maquina")
    anomalies.extend(_anomalies(sector_rows, recent_months, previous_months, "setor"))
    headline, headline_change = _headline(anomalies, recent_months, previous_months)
    stability, stability_note = _stability(anomalies, sector_rows, recent_months, previous_months)
    associations = _associations(facts.get("pairs") or [], facts.get("agents") or [], facts.get("lesions") or [])
    clusters = _cluster_states(ufs)
    regions = _regions(ufs)
    municipalities = _municipalities(facts.get("municipalities") or [])
    activities = _activities(facts.get("activities") or [])
    heatmap, peak = _heatmap(facts.get("weekday_month") or [], usable_months[-12:])

    return {
        "status": "ready",
        "message": (
            "A leitura percorre as comunicações e aponta padrão regional, atividade com mais casos, "
            "aumento fora do ritmo dos três meses anteriores, relação entre agente e lesão, "
            "e os dias e meses de maior ocorrência. A base aberta não informa a hora do acidente."
        ),
        "headline": headline,
        "headline_change": headline_change,
        "period_label": _period_label(recent_months, previous_months),
        "stability": stability,
        "stability_note": stability_note,
        "series": [row for row in monthly if row["month"] in set(usable_months[-18:])],
        "heatmap": heatmap,
        "peak": peak,
        "activities": activities,
        "regions": regions,
        "municipalities": municipalities,
        "anomalies": anomalies[:6],
        "associations": associations,
        "clusters": clusters,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def _load_facts() -> dict[str, Any]:
    collection = get_cat_collection()
    payload = next(
        collection.aggregate(_pipeline(), allowDiskUse=True),
        {},
    )
    return {
        "monthly": payload.get("monthly") or [],
        "sector_month": payload.get("sector_month") or [],
        "machine_month": payload.get("machine_month") or [],
        "weekday_month": payload.get("weekday_month") or [],
        "pairs": payload.get("pairs") or [],
        "agents": payload.get("agents") or [],
        "lesions": payload.get("lesions") or [],
        "activities": payload.get("activities") or [],
        "municipalities": payload.get("municipalities") or [],
    }


def _pipeline() -> list[dict[str, Any]]:
    data = {"$trim": {"input": {"$ifNull": ["$dados.Data Acidente", ""]}}}
    agent = {"$trim": {"input": {"$ifNull": ["$dados.Agente  Causador  Acidente", ""]}}}
    lesion = {"$trim": {"input": {"$ifNull": ["$dados.Natureza da Lesão", ""]}}}
    cbo = {"$trim": {"input": {"$ifNull": ["$dados.CBO_1", ""]}}}
    cnae = {"$trim": {"input": {"$ifNull": ["$dados.CNAE2_0 Empregador", ""]}}}
    activity = {"$trim": {"input": {"$ifNull": ["$dados.CNAE2_0 Empregador_1", ""]}}}
    accident_type = {"$trim": {"input": {"$ifNull": ["$dados.Tipo do Acidente", ""]}}}
    parsed = {
        "$dateFromString": {
            "dateString": data,
            "format": "%d/%m/%Y",
            "onError": None,
            "onNull": None,
        }
    }
    return [
        {
            "$project": {
                "dt": parsed,
                "agent": agent,
                "lesion": lesion,
                "cnae2": {"$substrCP": [cnae, 0, 2]},
                "activity": activity,
                "munic": {"$trim": {"input": {"$ifNull": ["$dados.Munic Empr", ""]}}},
                "tipo": accident_type,
                "machine_text": {"$concat": [agent, " ", cbo]},
            }
        },
        {
            "$addFields": {
                "month": {
                    "$cond": [
                        {"$eq": ["$dt", None]},
                        None,
                        {"$dateToString": {"format": "%Y-%m", "date": "$dt"}},
                    ]
                },
                "weekday": {"$cond": [{"$eq": ["$dt", None]}, None, {"$dayOfWeek": "$dt"}]},
                "machine": {
                    "$regexMatch": {
                        "input": "$machine_text",
                        "regex": r"m[aá]quina|prensa|empilhadeira|serra",
                        "options": "i",
                    }
                },
            }
        },
        {
            "$facet": {
                "monthly": [
                    {"$match": {"month": {"$ne": None}}},
                    {
                        "$group": {
                            "_id": "$month",
                            "total": {"$sum": 1},
                            "typical": _type_sum("Típico"),
                            "commute": _type_sum("Trajeto"),
                            "disease": _type_sum("Doença"),
                        }
                    },
                    {"$sort": {"_id": 1}},
                ],
                "sector_month": [
                    {"$match": {"month": {"$ne": None}, "cnae2": {"$ne": ""}}},
                    {"$group": {"_id": {"month": "$month", "cnae2": "$cnae2"}, "total": {"$sum": 1}}},
                ],
                "machine_month": [
                    {"$match": {"month": {"$ne": None}, "machine": True, "cnae2": {"$ne": ""}}},
                    {"$group": {"_id": {"month": "$month", "cnae2": "$cnae2"}, "total": {"$sum": 1}}},
                ],
                "weekday_month": [
                    {"$match": {"month": {"$ne": None}, "weekday": {"$ne": None}}},
                    {"$group": {"_id": {"month": "$month", "weekday": "$weekday"}, "total": {"$sum": 1}}},
                ],
                "agents": [
                    {"$match": {"agent": {"$ne": ""}, "lesion": {"$ne": ""}}},
                    {"$group": {"_id": "$agent", "total": {"$sum": 1}}},
                ],
                "lesions": [
                    {"$match": {"agent": {"$ne": ""}, "lesion": {"$ne": ""}}},
                    {"$group": {"_id": "$lesion", "total": {"$sum": 1}}},
                ],
                "pairs": [
                    {"$match": {"agent": {"$ne": ""}, "lesion": {"$ne": ""}}},
                    {"$group": {"_id": {"agent": "$agent", "lesion": "$lesion"}, "total": {"$sum": 1}}},
                    {"$match": {"total": {"$gte": 25}}},
                    {"$sort": {"total": -1}},
                    {"$limit": 300},
                ],
                "activities": [
                    {"$match": {"activity": {"$nin": ["", "{ñ class}", "{ñ class.}"]}}},
                    {"$group": {"_id": "$activity", "total": {"$sum": 1}}},
                    {"$sort": {"total": -1}},
                    {"$limit": 8},
                ],
                "municipalities": [
                    {"$match": {"munic": {"$ne": ""}}},
                    {"$group": {"_id": "$munic", "total": {"$sum": 1}}},
                    {"$sort": {"total": -1}},
                    {"$limit": 40},
                ],
            }
        },
    ]


def _type_sum(prefix: str) -> dict[str, Any]:
    return {
        "$sum": {
            "$cond": [
                {"$eq": [{"$substrCP": ["$tipo", 0, len(prefix)]}, prefix]},
                1,
                0,
            ]
        }
    }


def _monthly_series(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    series = []
    for row in rows:
        month = str(row.get("_id") or "")
        if not month:
            continue
        typical = int(row.get("typical") or 0)
        commute = int(row.get("commute") or 0)
        disease = int(row.get("disease") or 0)
        series.append(
            {
                "month": month,
                "label": _month_label(month),
                "total": int(row.get("total") or 0),
                "typical": typical,
                "commute": commute,
                "disease": disease,
            }
        )
    series.sort(key=lambda item: item["month"])
    return series


def _complete_months(totals: dict[str, int]) -> list[str]:
    months = sorted(month for month, total in totals.items() if total > 0)
    if len(months) >= 2 and totals[months[-1]] < 0.6 * totals[months[-2]]:
        months = months[:-1]
    return months


def _with_sector(row: dict[str, Any]) -> dict[str, Any]:
    identifier = row.get("_id") or {}
    return {
        "month": str(identifier.get("month") or ""),
        "sector": _sector_code(str(identifier.get("cnae2") or "")),
        "total": int(row.get("total") or 0),
    }


def _sector_code(cnae2: str) -> str:
    digits = re.sub(r"\D", "", cnae2)
    if len(digits) < 2:
        return "outros"
    division = int(digits[:2])
    if division <= 3:
        return "agro"
    if division <= 33:
        return "industria"
    if 41 <= division <= 43:
        return "construcao"
    if 45 <= division <= 47:
        return "comercio"
    if 49 <= division <= 53:
        return "transporte"
    if division == 86:
        return "saude"
    return "outros"


def _window_totals(rows: list[dict[str, Any]], months: list[str]) -> dict[str, int]:
    chosen = set(months)
    totals: dict[str, int] = {}
    for row in rows:
        if row["month"] not in chosen:
            continue
        totals[row["sector"]] = totals.get(row["sector"], 0) + row["total"]
    return totals


def _anomalies(rows: list[dict[str, Any]], recent: list[str], previous: list[str], kind: str) -> list[dict[str, Any]]:
    recent_totals = _window_totals(rows, recent)
    previous_totals = _window_totals(rows, previous)
    before_sum = sum(previous_totals.values())
    after_sum = sum(recent_totals.values())
    global_change = ((after_sum - before_sum) / before_sum * 100) if before_sum else 0
    found = []
    compared = [sector for sector, before in previous_totals.items() if before >= MIN_PREVIOUS]
    for sector in compared:
        before = previous_totals[sector]
        after = recent_totals.get(sector, 0)
        if after < MIN_RECENT:
            continue
        change = (after - before) / before * 100
        excess = change - global_change
        stands_out = excess >= 15 if len(compared) > 1 else change >= ANOMALY_PERCENT
        if change < ANOMALY_PERCENT or not stands_out:
            continue
        label = SECTOR_LABELS.get(sector, "Demais setores")
        found.append(
            {
                "sector": sector,
                "label": label,
                "kind": kind,
                "change": round(change, 1),
                "recent": after,
                "previous": before,
                "sentence": _anomaly_sentence(label, change, kind, excess if len(compared) > 1 else 0),
            }
        )
    found.sort(key=lambda item: item["change"], reverse=True)
    return found


def _anomaly_sentence(label: str, change: float, kind: str, excess: float) -> str:
    percent = _percent(change)
    subject = label[0].lower() + label[1:] if label else label
    if kind == "maquina":
        sentence = (
            f"A leitura identifica que {subject} apresentou aumento de {percent} "
            "nos acidentes envolvendo máquinas nos últimos três meses"
        )
    else:
        sentence = (
            f"A leitura identifica que {subject} apresentou aumento de {percent} "
            "nas comunicações dos últimos três meses"
        )
    if excess >= 15:
        sentence += f", {_percent(excess)} acima do ritmo geral"
    return sentence + "."


def _headline(anomalies: list[dict[str, Any]], recent: list[str], previous: list[str]) -> tuple[str, float | None]:
    machines = [item for item in anomalies if item["kind"] == "maquina"]
    chosen = machines[0] if machines else (anomalies[0] if anomalies else None)
    if chosen is None:
        return (
            f"Nenhum setor com volume relevante passou de {ANOMALY_PERCENT}% "
            f"entre {_period_label(recent, previous)}.",
            None,
        )
    return chosen["sentence"], chosen["change"]


def _stability(
    anomalies: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    recent: list[str],
    previous: list[str],
) -> tuple[int | None, str]:
    previous_totals = _window_totals(rows, previous)
    eligible = [sector for sector, before in previous_totals.items() if before >= MIN_PREVIOUS]
    if not eligible:
        return None, "Ainda não há setores com volume bastante nos dois trimestres."
    flagged = {item["sector"] for item in anomalies}
    alerts = sum(1 for sector in eligible if sector in flagged)
    score = round(100 * (1 - alerts / len(eligible)))
    return score, (
        f"{len(eligible) - alerts} de {len(eligible)} setores comparados ficaram sem aumento anormal "
        "nos últimos três meses."
    )


def _associations(
    rows: list[dict[str, Any]],
    agent_rows: list[dict[str, Any]],
    lesion_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    agent_totals = {
        " ".join(str(row.get("_id") or "").split()): int(row.get("total") or 0)
        for row in agent_rows
        if str(row.get("_id") or "").strip()
    }
    lesion_totals = {
        " ".join(str(row.get("_id") or "").split()): int(row.get("total") or 0)
        for row in lesion_rows
        if str(row.get("_id") or "").strip()
    }
    total = sum(agent_totals.values())
    pairs = []
    for row in rows:
        identifier = row.get("_id") or {}
        agent = " ".join(str(identifier.get("agent") or "").split())
        lesion = " ".join(str(identifier.get("lesion") or "").split())
        count = int(row.get("total") or 0)
        if agent and lesion and count > 0:
            pairs.append((agent, lesion, count))
    if total == 0:
        return []

    scored = []
    for agent, lesion, count in pairs:
        if count < 40:
            continue
        expected = agent_totals.get(agent, 0) * lesion_totals.get(lesion, 0) / total
        if expected <= 0:
            continue
        lift = count / expected
        if lift < 1.35:
            continue
        scored.append(
            {
                "agent": agent,
                "injury": lesion,
                "count": count,
                "lift": round(lift, 2),
            }
        )
    scored.sort(key=lambda item: item["lift"], reverse=True)
    return scored[:6]


def _cluster_states(ufs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    usable = [uf for uf in ufs if int(uf.get("total") or 0) >= 50 and uf.get("rate") is not None]
    if len(usable) < 6:
        return []

    matrix = []
    for uf in usable:
        total = max(int(uf["total"]), 1)
        matrix.append(
            [
                float(uf["rate"]),
                100 * int(uf.get("deaths") or 0) / total,
                100 * int(uf.get("typical") or 0) / total,
                100 * int(uf.get("commute") or 0) / total,
                100 * int(uf.get("disease") or 0) / total,
            ]
        )
    labels = KMeans(n_clusters=3, random_state=7, n_init=10).fit_predict(StandardScaler().fit_transform(matrix))
    grouped: dict[int, list[dict[str, Any]]] = {0: [], 1: [], 2: []}
    for uf, label in zip(usable, labels):
        total = max(int(uf["total"]), 1)
        grouped[int(label)].append(
            {
                "sigla": uf["sigla"],
                "nome": uf["nome"],
                "rate": float(uf["rate"]),
                "lethality": 100 * int(uf.get("deaths") or 0) / total,
            }
        )

    profiles = []
    for items in grouped.values():
        if not items:
            continue
        profiles.append(
            {
                "rate": sum(item["rate"] for item in items) / len(items),
                "lethality": sum(item["lethality"] for item in items) / len(items),
                "states": items,
            }
        )
    by_rate = sorted(profiles, key=lambda item: item["rate"], reverse=True)
    names = ["Mais acidentes por habitante", "Perfil intermediário", "Menos acidentes por habitante"]
    if len(by_rate) >= 2:
        lethality_leader = max(by_rate, key=lambda item: item["lethality"])
        if lethality_leader is not by_rate[0] and lethality_leader["lethality"] >= by_rate[0]["lethality"] * 1.25:
            names[by_rate.index(lethality_leader)] = "Mais óbitos entre as comunicações"

    clusters = []
    for profile, name in zip(by_rate, names):
        states = sorted(profile["states"], key=lambda item: item["rate"], reverse=True)
        siglas = ", ".join(state["sigla"] for state in states[:4])
        extra = len(states) - 4
        listed = f"{siglas} e mais {extra}" if extra > 0 else siglas
        clusters.append(
            {
                "name": name,
                "summary": f"{listed}. Taxa média de {profile['rate']:.0f} CAT por 100 mil habitantes.",
                "states": [{"sigla": state["sigla"], "nome": state["nome"], "rate": round(state["rate"], 1)} for state in states],
            }
        )
    return clusters


def _regions(ufs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_sigla = {uf["sigla"]: uf for uf in ufs}
    regions = []
    for name, (siglas, color) in REGIONS.items():
        members = [by_sigla[sigla] for sigla in siglas if sigla in by_sigla]
        total = sum(int(item.get("total") or 0) for item in members)
        population = sum(int(item.get("population") or 0) for item in members)
        rate = round(total * 100_000 / population, 1) if population else None
        regions.append({"name": name, "total": total, "rate": rate, "color": color})
    regions.sort(key=lambda item: item["rate"] or 0, reverse=True)
    return regions


def _municipalities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = []
    for row in rows:
        raw = str(row.get("_id") or "")
        total = int(row.get("total") or 0)
        place = lookup_municipality(raw)
        if place is None or total < 80:
            continue
        population = population_for_ibge(place.ibge)
        if population <= 0:
            continue
        ranked.append(
            {
                "name": place.name,
                "uf": place.sigla,
                "total": total,
                "rate": round(total * 100_000 / population, 1),
            }
        )
    ranked.sort(key=lambda item: item["rate"], reverse=True)
    deduped = []
    seen = set()
    for item in ranked:
        key = (item["name"], item["uf"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped[:5]


def _activities(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for row in rows:
        label = " ".join(str(row.get("_id") or "").split())
        total = int(row.get("total") or 0)
        if not label or total <= 0:
            continue
        cleaned.append({"label": label, "total": total})
    overall = sum(item["total"] for item in cleaned) or 1
    return [
        {"label": item["label"], "total": item["total"], "share": round(item["total"] / overall, 3)}
        for item in cleaned[:6]
    ]


def _heatmap(rows: list[dict[str, Any]], months: list[str]) -> tuple[list[dict[str, Any]], str]:
    chosen = set(months)
    grid = {month: [0, 0, 0, 0, 0, 0, 0] for month in months}
    weekday_totals = [0, 0, 0, 0, 0, 0, 0]
    for row in rows:
        identifier = row.get("_id") or {}
        month = str(identifier.get("month") or "")
        weekday = identifier.get("weekday")
        if month not in chosen or not isinstance(weekday, int):
            continue
        index = _weekday_index(weekday)
        if index is None:
            continue
        count = int(row.get("total") or 0)
        grid[month][index] += count
        weekday_totals[index] += count

    heatmap = [
        {"month": month, "label": _month_label(month), "days": grid[month]}
        for month in months
    ]
    if not any(weekday_totals):
        return heatmap, "Ainda não há datas suficientes para apontar o dia de maior ocorrência."
    peak_index = max(range(7), key=lambda index: weekday_totals[index])
    peak_month = max(heatmap, key=lambda item: sum(item["days"])) if heatmap else None
    names = ("segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo")
    sentence = f"{names[peak_index].capitalize()} concentra o maior número de comunicações"
    if peak_month is not None:
        sentence += f"; o mês mais carregado neste recorte foi {peak_month['label']}."
    else:
        sentence += "."
    return heatmap, sentence


def _weekday_index(mongo_day: int) -> int | None:
    if mongo_day == 1:
        return 6
    if 2 <= mongo_day <= 7:
        return mongo_day - 2
    return None


def _month_label(month: str) -> str:
    year, number = month.split("-")
    return f"{MONTH_NAMES[int(number) - 1]}/{year[2:]}"


def _period_label(recent: list[str], previous: list[str]) -> str:
    return f"{_month_label(recent[0])}–{_month_label(recent[-1])} frente a {_month_label(previous[0])}–{_month_label(previous[-1])}"


def _percent(value: float) -> str:
    rounded = round(value)
    if abs(value - rounded) < 0.05:
        return f"{rounded}%"
    return f"{value:.1f}%".replace(".", ",")


def _insufficient(message: str) -> dict[str, Any]:
    return {
        "status": "insufficient",
        "message": message,
        "headline": message,
        "headline_change": None,
        "period_label": "",
        "stability": None,
        "stability_note": "",
        "series": [],
        "heatmap": [],
        "peak": "",
        "activities": [],
        "regions": [],
        "municipalities": [],
        "anomalies": [],
        "associations": [],
        "clusters": [],
        "trained_at": None,
    }


def _unavailable(message: str) -> dict[str, Any]:
    report = _insufficient(message)
    report["status"] = "unavailable"
    return report


def _database_message(exc: Exception) -> str:
    text = str(exc)
    if "Connection refused" in text or "ServerSelectionTimeout" in text or "timed out" in text.lower():
        return "O MongoDB local não está acessível. Inicie o banco e importe as CATs para gerar esta leitura."
    return "Não foi possível ler as CATs para montar os padrões."
