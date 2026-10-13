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
  const maxRate = ranked.find((item) => item.rate != null)?.rate ?? 0;
  const example =
    ranked.find((item) => item.id === activeId && item.rate != null && item.population > 0) ??
    ranked.find((item) => item.rate != null && item.population > 0);

  return (
    <aside className="sentinela-rate-panel">
      <header className="sentinela-rate-header">
        <p className="sentinela-map-kicker">Ranking</p>
        <h3>{scopeLabel}</h3>
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
          {ranked.map((item, index) => (
            <li key={item.id}>
              <button
                className={item.id === activeId ? "is-active" : undefined}
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <span
                  className="sentinela-rate-bar-fill"
                  style={{ width: `${maxRate ? ((item.rate ?? 0) / maxRate) * 100 : 0}%` }}
                />
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
      )}
    </aside>
  );
}
