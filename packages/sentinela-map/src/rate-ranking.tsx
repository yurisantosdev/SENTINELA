"use client";

import { formatCount, formatRate } from "./format";

export type RankingItem = {
  id: string;
  name: string;
  detail: string;
  rate: number | null;
  total: number;
  population: number;
};

type RateRankingProps = {
  scopeLabel: string;
  loading: boolean;
  items: RankingItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function RateRanking({ scopeLabel, loading, items, activeId, onSelect }: RateRankingProps) {
  const ranked = [...items].sort((left, right) => {
    if (left.rate == null && right.rate == null) {
      return right.total - left.total;
    }
    if (left.rate == null) {
      return 1;
    }
    if (right.rate == null) {
      return -1;
    }
    return right.rate - left.rate;
  });
  const chart = ranked.filter((item) => item.rate != null).slice(0, 8);
  const maxRate = chart[0]?.rate ?? 0;

  return (
    <aside className="sentinela-rate-panel">
      <header className="sentinela-rate-header">
        <p className="sentinela-map-kicker">Ranking</p>
        <h3>{scopeLabel}</h3>
        <p>CAT por 100 mil habitantes no período jun/2023–jun/2025, com população do IBGE 2024.</p>
      </header>

      {loading ? (
        <p className="sentinela-rate-empty">Calculando as taxas…</p>
      ) : ranked.length === 0 ? (
        <p className="sentinela-rate-empty">Nenhuma localidade com taxa neste recorte.</p>
      ) : (
        <>
          <div className="sentinela-rate-chart">
            {chart.map((item, index) => (
              <button
                key={item.id}
                className="sentinela-rate-bar"
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <span className="sentinela-rate-bar-label">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.name}</strong>
                  <em>{formatRate(item.rate)}</em>
                </span>
                <span className="sentinela-rate-bar-track">
                  <span
                    className="sentinela-rate-bar-fill"
                    style={{ width: `${maxRate ? ((item.rate ?? 0) / maxRate) * 100 : 0}%` }}
                  />
                </span>
              </button>
            ))}
          </div>

          <ol className="sentinela-rate-list">
            {ranked.map((item, index) => (
              <li key={item.id}>
                <button
                  className={item.id === activeId ? "is-active" : undefined}
                  type="button"
                  onClick={() => onSelect(item.id)}
                >
                  <span className="sentinela-rate-pos">{String(index + 1).padStart(2, "0")}</span>
                  <span className="sentinela-rate-copy">
                    <strong>{item.name}</strong>
                    <small>
                      {formatCount(item.total)} CAT · {formatCount(item.population)} hab.
                    </small>
                  </span>
                  <span className="sentinela-rate-value">
                    {formatRate(item.rate)}
                    <small>{item.detail}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
