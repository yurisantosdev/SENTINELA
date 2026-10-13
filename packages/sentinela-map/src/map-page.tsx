"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { BRAZIL_STATES_BY_SIGLA } from "./brazil-states";
import { useBrazilGeo } from "./use-brazil-geo";
import { useCatMapData } from "./use-cat-map";
import type { MapPoint } from "./types";
import "./map.css";
import "leaflet/dist/leaflet.css";

const BrazilMap = dynamic(() => import("./brazil-map").then((module) => module.BrazilMap), {
  ssr: false,
  loading: () => <div className="sentinela-map-status">Carregando mapa do Brasil…</div>,
});

type MapPageProps = {
  apiBaseUrl?: string;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function MapPage({ apiBaseUrl }: MapPageProps) {
  const { data, error: geoError, source } = useBrazilGeo();
  const {
    summary,
    municipalities,
    unlocated,
    loadingSummary,
    loadingMunicipalities,
    error: catError,
    loadMunicipalities,
  } = useCatMapData(apiBaseUrl);
  const [selectedSigla, setSelectedSigla] = useState<string | null>(null);

  useEffect(() => {
    loadMunicipalities(selectedSigla).catch(() => undefined);
  }, [loadMunicipalities, selectedSigla]);

  const countsByUf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const uf of summary?.ufs ?? []) {
      counts.set(uf.sigla, uf.total);
    }
    return counts;
  }, [summary]);

  const points = useMemo<MapPoint[]>(() => {
    if (selectedSigla) {
      return municipalities.map((point) => ({
        ...point,
        kind: "municipality" as const,
      }));
    }

    return (summary?.ufs ?? [])
      .filter((uf) => uf.total > 0)
      .map((uf) => ({
        id: uf.sigla,
        uf: uf.sigla,
        name: uf.nome,
        lat: uf.lat,
        lng: uf.lng,
        total: uf.total,
        deaths: uf.deaths,
        typical: uf.typical,
        commute: uf.commute,
        disease: uf.disease,
        kind: "uf" as const,
      }));
  }, [municipalities, selectedSigla, summary]);

  const selectedState = selectedSigla ? BRAZIL_STATES_BY_SIGLA.get(selectedSigla) : null;
  const selectedTotal = selectedSigla ? (countsByUf.get(selectedSigla) ?? 0) : (summary?.total ?? 0);
  const title = selectedState ? selectedState.nome : "Brasil";
  const subtitle = selectedState
    ? `${selectedState.sigla} · ${formatCount(selectedTotal)} CAT no município do empregador`
    : summary
      ? `${formatCount(summary.total)} comunicações CAT · clique em um estado para ver os municípios`
      : "Carregando agregação das comunicações CAT…";

  return (
    <section className="sentinela-map-shell">
      <header className="sentinela-map-header">
        <div>
          <p className="sentinela-map-kicker">Mapa CAT</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {selectedSigla ? (
          <button className="sentinela-map-back" type="button" onClick={() => setSelectedSigla(null)}>
            <ArrowLeft size={16} weight="bold" />
            Ver Brasil
          </button>
        ) : null}
      </header>

      <div className="sentinela-map-canvas">
        {loadingSummary ? (
          <div className="sentinela-map-status">
            Agregando as comunicações CAT do MongoDB. A primeira carga pode levar cerca de um minuto…
          </div>
        ) : catError && !summary ? (
          <div className="sentinela-map-status">{catError}</div>
        ) : data ? (
          <>
            <BrazilMap
              geojson={data}
              selectedSigla={selectedSigla}
              points={points}
              countsByUf={countsByUf}
              onSelectState={setSelectedSigla}
            />
            {loadingMunicipalities ? (
              <div className="sentinela-map-overlay">Carregando municípios…</div>
            ) : null}
          </>
        ) : (
          <div className="sentinela-map-status">Não foi possível montar o mapa do Brasil.</div>
        )}
      </div>

      <footer className="sentinela-map-legend">
        <span>
          <i className="tipico" /> Típico
        </span>
        <span>
          <i className="trajeto" /> Trajeto
        </span>
        <span>
          <i className="doenca" /> Doença
        </span>
        <span>
          <i className="obito" /> Óbito
        </span>
        <span>
          {selectedSigla
            ? `${formatCount(points.length)} municípios · ${formatCount(unlocated)} sem coordenada`
            : `${formatCount(points.length)} UFs`}
          {summary ? ` · ${formatCount(summary.deaths)} óbitos` : ""}
          {source === "ibge" ? " · malha IBGE" : source === "local" ? " · malha local" : ""}
          {geoError && source === "local" ? " (IBGE indisponível)" : ""}
        </span>
      </footer>
    </section>
  );
}
