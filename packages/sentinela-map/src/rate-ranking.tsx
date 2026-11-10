"use client";

import { useMemo, useState } from "react";
import { formatCount, formatPercent, formatRate } from "./format";
import { lethality } from "./insights";

export type RankingItem = {
  id: string;
  name: string;
  detail: string;
  rate: number | null;
  total: number;
  population: number;
  deaths: number;
  typical: number;
  commute: number;
  disease: number;
};

type RankSort = "rate" | "total" | "lethality" | "commute";

const SORTS: { id: RankSort; label: string }[] = [
  { id: "rate", label: "Taxa" },
  { id: "total", label: "Volume" },
  { id: "lethality", label: "Óbitos" },
  { id: "commute", label: "Trajeto" },
];

function sortScore(item: RankingItem, sort: RankSort) {
  if (sort === "total") {
    return item.total;
  }
  if (sort === "lethality") {
    return lethality(item.deaths, item.total) ?? -1;
  }
  if (sort === "commute") {
    return item.total > 0 ? (item.commute / item.total) * 100 : -1;
  }
  return item.rate ?? -1;
}

function sortReadout(item: RankingItem, sort: RankSort) {
  if (sort === "total") {
    return { value: formatCount(item.total), detail: "CAT" };
  }
  if (sort === "lethality") {
    return { value: formatPercent(lethality(item.deaths, item.total)), detail: "com óbito" };
  }
  if (sort === "commute") {
    return {
      value: formatPercent(item.total > 0 ? (item.commute / item.total) * 100 : null),
      detail: "trajeto",
    };
  }
  return { value: formatRate(item.rate), detail: item.detail || "por 100 mil" };
}

type RateRankingProps = {
  scopeLabel: string;
  loading: boolean;
  items: RankingItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function RateRanking({ scopeLabel, loading, items, activeId, onSelect }: RateRankingProps) {
  const [sort, setSort] = useState<RankSort>("rate");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const ranked = useMemo(() => {
    const visible = normalizedQuery
      ? items.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
      : items;
    return [...visible].sort((left, right) => sortScore(right, sort) - sortScore(left, sort));
  }, [items, normalizedQuery, sort]);
  const maxScore = ranked.reduce((max, item) => Math.max(max, sortScore(item, sort)), 0);
  const example =
    ranked.find((item) => item.id === activeId && item.rate != null && item.population > 0) ??
    ranked.find((item) => item.rate != null && item.population > 0);

  return (
    <aside className="sentinela-rate-panel">
      <header className="sentinela-rate-header">
        <p className="sentinela-map-kicker">Ranking</p>
        <h3>{scopeLabel}</h3>
        <div className="sentinela-rank-sort" role="group" aria-label="Ordenar ranking">
          {SORTS.map((option) => (
            <button
              aria-pressed={sort === option.id}
              key={option.id}
              type="button"
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          className="sentinela-rank-search"
          type="search"
          value={query}
          placeholder="Buscar lugar"
          aria-label="Buscar lugar no ranking"
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      {example ? (
        <div className="sentinela-rate-formula">
          <p className="sentinela-rate-formula-kicker">Como a taxa é calculada</p>
          <p className="sentinela-rate-formula-place">{example.name}</p>
          <div
            className="sentinela-rate-formula-eq"
            aria-label={`${formatCount(example.total)} CAT dividido por ${formatCount(example.population)} habitantes, vezes 100 mil, igual a ${formatRate(example.rate)} por 100 mil`}
          >
            <div className="sentinela-rate-fraction">
              <strong>{formatCount(example.total)}</strong>
              <small>CAT</small>
              <span className="sentinela-rate-fraction-line" />
              <strong>{formatCount(example.population)}</strong>
              <small>habitantes</small>
            </div>
            <span className="sentinela-rate-op" aria-hidden="true">
              ×
            </span>
            <div className="sentinela-rate-factor">
              <strong>100 mil</strong>
            </div>
            <span className="sentinela-rate-op" aria-hidden="true">
              =
            </span>
            <div className="sentinela-rate-result-chip">
              <strong>{formatRate(example.rate)}</strong>
              <small>por 100 mil</small>
            </div>
          </div>
          <p className="sentinela-rate-formula-note">jun/2023–jun/2025 · população IBGE 2024</p>
        </div>
      ) : null}

      {loading ? (
        <p className="sentinela-rate-empty">Calculando as taxas…</p>
      ) : ranked.length === 0 ? (
        <p className="sentinela-rate-empty">Nenhuma localidade com taxa neste recorte.</p>
      ) : (
        <ol className="sentinela-rate-list">
          {ranked.map((item, index) => {
            const readout = sortReadout(item, sort);
            return (
              <li key={item.id}>
                <button
                  className={item.id === activeId ? "is-active" : undefined}
                  type="button"
                  onClick={() => onSelect(item.id)}
                >
                  <span
                    className="sentinela-rate-bar-fill"
                    style={{ width: `${maxScore > 0 ? (Math.max(0, sortScore(item, sort)) / maxScore) * 100 : 0}%` }}
                  />
                  <span className="sentinela-rate-pos">{String(index + 1).padStart(2, "0")}</span>
                  <span className="sentinela-rate-copy">
                    <strong>{item.name}</strong>
                    <small>
                      {formatCount(item.total)} CAT · {formatCount(item.population)} hab.
                    </small>
                  </span>
                  <span className="sentinela-rate-value">
                    {readout.value}
                    <small>{readout.detail}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
