"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCount, formatPercent, formatRate } from "./format";
import {
  buildStories,
  compositionOf,
  expectedCats,
  lethality,
  pluralPlace,
  topByTotal,
  type InsightPlace,
} from "./insights";
import type { CatMetrics } from "./types";

type RegionGroup = {
  name: string;
  color: string;
  metrics: CatMetrics;
};

type MapInsightsProps = {
  scopeName: string;
  scope: CatMetrics;
  baselineName: string;
  baseline: CatMetrics | null;
  contextName?: string | null;
  contextRate?: number | null;
  places: InsightPlace[];
  placeNoun: "estado" | "município";
  groups?: RegionGroup[];
  activeId: string | null;
  loadingPlaces?: boolean;
  onSelect: (id: string) => void;
};

export function MapInsights({
  scopeName,
  scope,
  baselineName,
  baseline,
  contextName,
  contextRate,
  places,
  placeNoun,
  groups,
  activeId,
  loadingPlaces,
  onSelect,
}: MapInsightsProps) {
  const slices = compositionOf(scope);
  const stories = useMemo(
    () =>
      buildStories({
        scopeName,
        scope,
        baselineName,
        baseline,
        places,
        placeNoun,
        groups,
      }),
    [baseline, baselineName, groups, placeNoun, places, scope, scopeName],
  );
  const concentration = topByTotal(places, 3);
  const deathShare = lethality(scope.deaths, scope.total);
  const expected = baseline && baselineName !== scopeName ? expectedCats(scope.population, baseline.rate) : null;
  const gap = expected == null ? null : scope.total - expected;
  const alignedWithBaseline = gap != null && Math.abs(gap) < 1;
  const regionSpread = useMemo(() => {
    if (!groups || groups.length < 2) {
      return null;
    }
    const ranked = [...groups].sort((left, right) => (right.metrics.rate ?? 0) - (left.metrics.rate ?? 0));
    const highest = ranked[0];
    const lowest = ranked[ranked.length - 1];
    if (!highest || !lowest || highest.metrics.rate == null || lowest.metrics.rate == null) {
      return null;
    }
    return { highest, lowest, gap: highest.metrics.rate - lowest.metrics.rate };
  }, [groups]);
  const rateBars = groups && groups.length > 0 ? null : rankedPlaces(places).slice(0, places.length > 12 ? 8 : places.length);
  const scatterPlaces = places.filter((place) => place.population > 0 && place.rate != null);

  return (
    <section className="sentinela-insights" aria-label="Leituras dos dados CAT">
      <header className="sentinela-insights-intro">
        <div>
          <p className="sentinela-map-kicker">Leituras</p>
          <h3>{scopeName}</h3>
          <p>Os mesmos números do mapa, lidos pelo volume, pela taxa, pelo tipo do acidente e pelos óbitos.</p>
        </div>
      </header>

      <div className="sentinela-insight-kpis">
        <article>
          <span>Taxa</span>
          <strong>{formatRate(scope.rate)}</strong>
          <small>CAT por 100 mil hab.</small>
        </article>
        <article>
          <span>
            {gap == null
              ? "Distância entre regiões"
              : alignedWithBaseline
                ? `Na taxa do ${baselineName}`
                : gap > 0
                  ? "Acima do esperado"
                  : "Abaixo do esperado"}
          </span>
          <strong>
            {gap == null
              ? formatRate(regionSpread?.gap)
              : alignedWithBaseline
                ? formatRate(scope.rate)
                : formatCount(Math.abs(Math.round(gap)))}
          </strong>
          <small>
            {gap == null
              ? regionSpread
                ? `${regionSpread.highest.name} ${formatRate(regionSpread.highest.metrics.rate)} · ${regionSpread.lowest.name} ${formatRate(regionSpread.lowest.metrics.rate)}`
                : `taxa do ${baselineName}`
              : alignedWithBaseline
                ? `volume perto do esperado para a população`
                : `CAT ${gap > 0 ? "a mais" : "a menos"} que a taxa do ${baselineName}`}
            {contextName && contextRate != null ? ` · ${contextName} ${formatRate(contextRate)}` : ""}
          </small>
        </article>
        <article>
          <span>Óbitos</span>
          <strong>{formatPercent(deathShare)}</strong>
          <small>{formatCount(scope.deaths)} comunicações com óbito</small>
        </article>
        <article>
          <span>Concentração</span>
          <strong>{places.length >= 3 ? formatPercent(concentration.share * 100, 0) : "—"}</strong>
          <small>
            {places.length >= 3
              ? `das CAT nos 3 ${pluralPlace(placeNoun)} com mais casos`
              : "poucos lugares neste recorte"}
          </small>
        </article>
      </div>

      <div className="sentinela-insight-grid">
        <article className="sentinela-insight-card">
          <header>
            <h4>Composição</h4>
            <p>Como as {formatCount(scope.total)} comunicações se dividem.</p>
          </header>
          <CompositionBar slices={slices} />
        </article>

        <article className="sentinela-insight-card">
          <header>
            <h4>{groups ? "Taxa por região" : places.length > 12 ? "Maiores taxas" : `Taxa por ${placeNoun}`}</h4>
            <p>Cada barra usa a mesma conta do mapa: CAT a cada 100 mil habitantes.</p>
          </header>
          {groups ? <RegionBars groups={groups} /> : <PlaceBars places={rateBars ?? []} activeId={activeId} onSelect={onSelect} />}
          {loadingPlaces ? <p className="sentinela-insight-note">Carregando municípios…</p> : null}
        </article>

        <article className="sentinela-insight-card sentinela-insight-card-wide">
          <header>
            <h4>Volume e taxa</h4>
            <p>{`Cada ponto é um ${placeNoun}. À direita, mais habitantes. Para cima, taxa maior. O tamanho acompanha o número de CAT.`}</p>
          </header>
          <ScatterPlot places={scatterPlaces} activeId={activeId} onSelect={onSelect} />
        </article>

        <PlaceCompare places={places} placeNoun={placeNoun} onSelect={onSelect} />

        <article className="sentinela-insight-card sentinela-insight-stories">
          <header>
            <h4>O que estes números mostram</h4>
          </header>
          {stories.length === 0 ? (
            <p className="sentinela-insight-note">Ainda não há lugares suficientes para uma leitura.</p>
          ) : (
            <ul>
              {stories.map((story) => (
                <li key={story.title}>
                  <strong>{story.title}</strong>
                  <p>{story.body}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}

function CompositionBar({ slices }: { slices: ReturnType<typeof compositionOf> }) {
  return (
    <>
      <div className="sentinela-composition" aria-hidden="true">
        {slices.map((slice) =>
          slice.share > 0 ? (
            <span key={slice.key} style={{ width: `${slice.share * 100}%`, background: slice.color }} />
          ) : null,
        )}
      </div>
      <ul className="sentinela-composition-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <i style={{ background: slice.color }} />
            <span>
              <strong>{slice.label}</strong>
              <small>
                {formatCount(slice.value)} · {formatPercent(slice.share * 100)} · {slice.hint}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function RegionBars({ groups }: { groups: RegionGroup[] }) {
  const maxRate = Math.max(...groups.map((group) => group.metrics.rate ?? 0), 0);
  return (
    <ul className="sentinela-hbar-list">
      {groups.map((group) => (
        <li key={group.name}>
          <span>{group.name}</span>
          <strong>{formatRate(group.metrics.rate)}</strong>
          <span className="sentinela-hbar-track">
            <span
              style={{
                width: `${maxRate ? ((group.metrics.rate ?? 0) / maxRate) * 100 : 0}%`,
                background: group.color,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlaceBars({
  places,
  activeId,
  onSelect,
}: {
  places: InsightPlace[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const maxRate = Math.max(...places.map((place) => place.rate ?? 0), 0);
  if (places.length === 0) {
    return <p className="sentinela-insight-note">Nenhuma localidade com taxa neste recorte.</p>;
  }

  return (
    <ul className="sentinela-hbar-list">
      {places.map((place) => (
        <li key={place.id}>
          <button className={place.id === activeId ? "is-active" : undefined} type="button" onClick={() => onSelect(place.id)}>
            <span>{place.name}</span>
            <strong>{formatRate(place.rate)}</strong>
            <span className="sentinela-hbar-track">
              <span style={{ width: `${maxRate ? ((place.rate ?? 0) / maxRate) * 100 : 0}%` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ScatterPlot({
  places,
  activeId,
  onSelect,
}: {
  places: InsightPlace[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const width = 640;
  const height = 280;
  const pad = { top: 16, right: 16, bottom: 28, left: 36 };

  if (places.length === 0) {
    return <p className="sentinela-insight-note">Sem pontos para cruzar população e taxa.</p>;
  }

  const populations = places.map((place) => place.population);
  const rates = places.map((place) => place.rate ?? 0);
  const minPop = Math.min(...populations);
  const maxPop = Math.max(...populations);
  const maxRate = Math.max(...rates, 1);
  const maxTotal = Math.max(...places.map((place) => place.total), 1);
  const crowded = places.length > 80;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  function xOf(population: number) {
    if (maxPop === minPop) {
      return pad.left + innerWidth / 2;
    }
    const start = Math.log(minPop);
    const end = Math.log(maxPop);
    return pad.left + ((Math.log(population) - start) / (end - start)) * innerWidth;
  }

  function yOf(rate: number) {
    return pad.top + innerHeight - (rate / (maxRate * 1.08)) * innerHeight;
  }

  const focused = places.find((place) => place.id === (hoveredId ?? activeId)) ?? null;

  return (
    <div className="sentinela-scatter">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dispersão de habitantes e taxa de CAT">
        <line className="sentinela-scatter-axis" x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} />
        <line
          className="sentinela-scatter-axis"
          x1={pad.left}
          y1={height - pad.bottom}
          x2={width - pad.right}
          y2={height - pad.bottom}
        />
        <text className="sentinela-scatter-label" x={pad.left} y={14}>
          taxa
        </text>
        <text className="sentinela-scatter-label" x={width - pad.right} y={height - 8} textAnchor="end">
          habitantes
        </text>
        {places.map((place) => {
          const radius = (crowded ? 3 : 5) + Math.sqrt(place.total / maxTotal) * (crowded ? 8 : 14);
          const active = place.id === activeId || place.id === hoveredId;
          return (
            <circle
              key={place.id}
              cx={xOf(place.population)}
              cy={yOf(place.rate ?? 0)}
              r={active ? radius + 2 : radius}
              className={active ? "is-active" : undefined}
              tabIndex={0}
              role="button"
              aria-label={`${place.name}, taxa ${formatRate(place.rate)}, ${formatCount(place.total)} CAT`}
              onMouseEnter={() => setHoveredId(place.id)}
              onMouseLeave={() => setHoveredId((current) => (current === place.id ? null : current))}
              onFocus={() => setHoveredId(place.id)}
              onBlur={() => setHoveredId((current) => (current === place.id ? null : current))}
              onClick={() => onSelect(place.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(place.id);
                }
              }}
            >
              <title>
                {place.name} · {formatRate(place.rate)} por 100 mil · {formatCount(place.total)} CAT
              </title>
            </circle>
          );
        })}
      </svg>
      <p className="sentinela-insight-note">
        {focused
          ? `${focused.name} · ${formatRate(focused.rate)} por 100 mil · ${formatCount(focused.total)} CAT · ${formatCount(focused.population)} hab.`
          : "Passe o cursor ou clique em um ponto para ver o lugar no ranking e no mapa."}
      </p>
    </div>
  );
}

function PlaceCompare({
  places,
  placeNoun,
  onSelect,
}: {
  places: InsightPlace[];
  placeNoun: "estado" | "município";
  onSelect: (id: string) => void;
}) {
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const placeKey = places.map((place) => place.id).join("\n");

  useEffect(() => {
    const byRate = [...places].filter((place) => place.rate != null).sort((left, right) => (right.rate ?? 0) - (left.rate ?? 0));
    const byTotal = [...places].sort((left, right) => right.total - left.total);
    const left = byRate[0];
    const right = byTotal.find((place) => place.id !== left?.id) ?? byRate[1];
    setLeftId(left?.id ?? "");
    setRightId(right?.id ?? "");
  }, [placeKey, places]);

  const options = useMemo(
    () => [...places].sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [places],
  );
  const left = places.find((place) => place.id === leftId) ?? null;
  const right = places.find((place) => place.id === rightId) ?? null;

  return (
    <article className="sentinela-insight-card">
      <header>
        <h4>{`Comparar dois ${pluralPlace(placeNoun)}`}</h4>
        <p>O par inicial junta a maior taxa e o maior volume. Troque para qualquer lugar deste recorte.</p>
      </header>
      {places.length < 2 ? (
        <p className="sentinela-insight-note">É preciso ao menos dois lugares para comparar.</p>
      ) : (
        <>
          <div className="sentinela-compare-picks">
            <label>
              Primeiro
              <select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
                {options.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segundo
              <select value={rightId} onChange={(event) => setRightId(event.target.value)}>
                {options.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {left && right && left.id === right.id ? (
            <p className="sentinela-insight-note">Escolha dois lugares diferentes para ver o contraste.</p>
          ) : null}
          {left && right && left.id !== right.id ? <CompareTable left={left} right={right} onSelect={onSelect} /> : null}
        </>
      )}
    </article>
  );
}

function CompareTable({
  left,
  right,
  onSelect,
}: {
  left: InsightPlace;
  right: InsightPlace;
  onSelect: (id: string) => void;
}) {
  const rows = [
    { label: "Taxa por 100 mil", left: formatRate(left.rate), right: formatRate(right.rate) },
    { label: "Comunicações", left: formatCount(left.total), right: formatCount(right.total) },
    { label: "Óbitos", left: formatPercent(lethality(left.deaths, left.total)), right: formatPercent(lethality(right.deaths, right.total)) },
    {
      label: "Trajeto",
      left: formatPercent(left.total > 0 ? (left.commute / left.total) * 100 : null),
      right: formatPercent(right.total > 0 ? (right.commute / right.total) * 100 : null),
    },
    {
      label: "Doença",
      left: formatPercent(left.total > 0 ? (left.disease / left.total) * 100 : null),
      right: formatPercent(right.total > 0 ? (right.disease / right.total) * 100 : null),
    },
  ];

  return (
    <table className="sentinela-compare-table">
      <thead>
        <tr>
          <th />
          <th>
            <button type="button" onClick={() => onSelect(left.id)}>
              {left.name}
            </button>
          </th>
          <th>
            <button type="button" onClick={() => onSelect(right.id)}>
              {right.name}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th>{row.label}</th>
            <td>{row.left}</td>
            <td>{row.right}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function rankedPlaces(places: InsightPlace[]) {
  return [...places].sort((left, right) => {
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
}
