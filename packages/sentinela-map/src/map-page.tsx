"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BRAZIL_STATES_BY_SIGLA } from "./brazil-states";
import { TEST_OCCURRENCES } from "./test-occurrences";
import { useBrazilGeo } from "./use-brazil-geo";
import "./map.css";
import "leaflet/dist/leaflet.css";

const BrazilMap = dynamic(() => import("./brazil-map").then((module) => module.BrazilMap), {
  ssr: false,
  loading: () => <div className="sentinela-map-status">Carregando mapa do Brasil…</div>,
});

export function MapPage() {
  const { data, error, source } = useBrazilGeo();
  const [selectedSigla, setSelectedSigla] = useState<string | null>(null);

  const countsByUf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const occurrence of TEST_OCCURRENCES) {
      counts.set(occurrence.uf, (counts.get(occurrence.uf) ?? 0) + 1);
    }
    return counts;
  }, []);

  const selectedState = selectedSigla ? BRAZIL_STATES_BY_SIGLA.get(selectedSigla) : null;
  const visibleOccurrences = selectedSigla
    ? TEST_OCCURRENCES.filter((occurrence) => occurrence.uf === selectedSigla)
    : TEST_OCCURRENCES;

  const title = selectedState ? selectedState.nome : "Brasil";
  const subtitle = selectedState
    ? `${selectedState.sigla} · ${visibleOccurrences.length} ocorrência${visibleOccurrences.length === 1 ? "" : "s"} de teste`
    : "Passe o mouse para destacar um estado. Clique para abrir o mapa ampliado.";

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
        <BrazilMap
          geojson={data}
          selectedSigla={selectedSigla}
          occurrences={visibleOccurrences}
          countsByUf={countsByUf}
          onSelectState={setSelectedSigla}
        />
      </div>

      <footer className="sentinela-map-legend">
        <span>
          <i className="leve" /> Leve
        </span>
        <span>
          <i className="grave" /> Grave
        </span>
        <span>
          <i className="obito" /> Óbito
        </span>
        <span>
          {visibleOccurrences.length} ponto{visibleOccurrences.length === 1 ? "" : "s"} de teste
          {source === "ibge" ? " · malha IBGE" : source === "local" ? " · malha local" : ""}
          {error && source === "local" ? " (IBGE indisponível)" : ""}
        </span>
      </footer>
    </section>
  );
}
