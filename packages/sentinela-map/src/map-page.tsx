"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BRAZIL_REGIONS, BRAZIL_STATES_BY_SIGLA, regionOf, type BrazilRegionId } from "./brazil-states";
import { formatCount, formatRate } from "./format";
import { placeFromMetrics, type InsightPlace } from "./insights";
import { MapInsights } from "./map-insights";
import { RateRanking, type RankingItem } from "./rate-ranking";
import { useBrazilGeo } from "./use-brazil-geo";
import { useCatMapData } from "./use-cat-map";
import type { CatMetrics, MapPoint, UfMapStat } from "./types";
import "./map.css";
import "leaflet/dist/leaflet.css";

const BrazilMap = dynamic(() => import("./brazil-map").then((module) => module.BrazilMap), {
  ssr: false,
  loading: () => <div className="sentinela-map-status">Carregando mapa do Brasil…</div>,
});

type MapPageProps = {
  apiBaseUrl?: string;
};

function aggregateMetrics(ufs: UfMapStat[]): CatMetrics {
  const total = ufs.reduce((sum, uf) => sum + uf.total, 0);
  const population = ufs.reduce((sum, uf) => sum + uf.population, 0);
  const deaths = ufs.reduce((sum, uf) => sum + uf.deaths, 0);
  const typical = ufs.reduce((sum, uf) => sum + uf.typical, 0);
  const commute = ufs.reduce((sum, uf) => sum + uf.commute, 0);
  const disease = ufs.reduce((sum, uf) => sum + uf.disease, 0);
  const rate = population > 0 ? Math.round(((total * 100_000) / population) * 10) / 10 : null;
  return { total, population, deaths, typical, commute, disease, rate };
}

function toRankingItem(place: InsightPlace, detail: string): RankingItem {
  return {
    id: place.id,
    name: place.name,
    detail,
    rate: place.rate,
    total: place.total,
    population: place.population,
    deaths: place.deaths,
    typical: place.typical,
    commute: place.commute,
    disease: place.disease,
  };
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
  const [selectedRegion, setSelectedRegion] = useState<BrazilRegionId | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const ratesByUf = useMemo(() => {
    const rates = new Map<string, number>();
    for (const uf of summary?.ufs ?? []) {
      rates.set(uf.sigla, uf.rate ?? 0);
    }
    return rates;
  }, [summary]);

  const points = useMemo<MapPoint[]>(() => {
    if (selectedSigla) {
      return municipalities.map((point) => ({
        ...point,
        kind: "municipality" as const,
      }));
    }

    return (summary?.ufs ?? [])
      .filter((uf) => uf.total > 0 && (!selectedRegion || regionOf(uf.sigla) === selectedRegion))
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
        population: uf.population,
        rate: uf.rate,
        kind: "uf" as const,
      }));
  }, [municipalities, selectedRegion, selectedSigla, summary]);

  const insightPlaces = useMemo<InsightPlace[]>(() => {
    if (selectedSigla) {
      return municipalities.map((point) =>
        placeFromMetrics(point.id, point.name, {
          total: point.total,
          deaths: point.deaths,
          typical: point.typical,
          commute: point.commute,
          disease: point.disease,
          population: point.population,
          rate: point.rate,
        }),
      );
    }

    return (summary?.ufs ?? [])
      .filter((uf) => !selectedRegion || regionOf(uf.sigla) === selectedRegion)
      .map((uf) => placeFromMetrics(uf.sigla, uf.nome, uf));
  }, [municipalities, selectedRegion, selectedSigla, summary]);

  const rankingItems = useMemo<RankingItem[]>(
    () => insightPlaces.map((place) => toRankingItem(place, selectedSigla ? "por 100 mil" : place.id)),
    [insightPlaces, selectedSigla],
  );

  const regionUfs = useMemo(
    () => (summary?.ufs ?? []).filter((uf) => selectedRegion && regionOf(uf.sigla) === selectedRegion),
    [selectedRegion, summary],
  );
  const regionStats = selectedRegion ? aggregateMetrics(regionUfs) : null;
  const regionGroups = useMemo(() => {
    if (!summary || selectedSigla || selectedRegion) {
      return undefined;
    }
    return BRAZIL_REGIONS.map((region) => ({
      name: region.nome,
      color: region.color,
      metrics: aggregateMetrics((summary.ufs ?? []).filter((uf) => regionOf(uf.sigla) === region.id)),
    }));
  }, [selectedRegion, selectedSigla, summary]);
  const selectedState = selectedSigla ? BRAZIL_STATES_BY_SIGLA.get(selectedSigla) : null;
  const selectedUf = selectedSigla ? summary?.ufs.find((uf) => uf.sigla === selectedSigla) : null;
  const scopeRate = selectedUf?.rate ?? regionStats?.rate ?? summary?.rate;
  const scopeTotal = selectedUf?.total ?? regionStats?.total ?? summary?.total ?? 0;
  const scopeDeaths = selectedUf?.deaths ?? regionStats?.deaths ?? summary?.deaths ?? 0;
  const title = selectedState ? selectedState.nome : (selectedRegion ?? "Brasil");
  const subtitle = summary
    ? selectedState
      ? `${selectedState.sigla} · ${selectedState.regiao} · ${formatRate(scopeRate)} CAT por 100 mil hab. · ${formatCount(scopeTotal)} comunicações`
      : `${formatRate(scopeRate)} CAT por 100 mil hab. · clique em um estado ou no ranking`
    : "Carregando a taxa das comunicações CAT…";

  function openState(sigla: string) {
    setHighlightedId(null);
    setSelectedSigla(sigla);
    loadMunicipalities(sigla).catch(() => undefined);
  }

  function backToScope() {
    setHighlightedId(null);
    setSelectedSigla(null);
    loadMunicipalities(null).catch(() => undefined);
  }

  function selectRegion(region: BrazilRegionId | null) {
    setHighlightedId(null);
    setSelectedRegion(region);
    if (selectedSigla) {
      setSelectedSigla(null);
      loadMunicipalities(null).catch(() => undefined);
    }
  }

  function selectRankingItem(id: string) {
    if (selectedSigla) {
      setHighlightedId(id);
      return;
    }
    openState(id);
  }

  return (
    <section className="sentinela-map-shell">
      <header className="sentinela-map-header">
        <div>
          <p className="sentinela-map-kicker">Mapa CAT</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <p className="sentinela-map-about">
            O Sentinela mostra onde os acidentes de trabalho acontecem no Brasil, a partir das
            comunicações oficiais do INSS. Cada região tem uma cor, e o tom mais forte indica mais
            casos a cada 100 mil habitantes.
          </p>
        </div>
        {selectedSigla ? (
          <button className="sentinela-map-back" type="button" onClick={backToScope}>
            <ArrowLeft size={16} weight="bold" />
            {selectedRegion ? `Ver ${selectedRegion}` : "Ver Brasil"}
          </button>
        ) : null}
      </header>

      <div className="sentinela-region-filter" role="group" aria-label="Filtrar por região">
        <button aria-pressed={selectedRegion === null} type="button" onClick={() => selectRegion(null)}>
          Brasil
        </button>
        {BRAZIL_REGIONS.map((region) => (
          <button
            aria-pressed={selectedRegion === region.id}
            key={region.id}
            type="button"
            onClick={() => selectRegion(region.id)}
          >
            <i style={{ background: region.color }} />
            {region.nome}
          </button>
        ))}
      </div>

      <div className="sentinela-map-body">
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
                selectedRegion={selectedRegion}
                points={points}
                ratesByUf={ratesByUf}
                highlightedId={highlightedId}
                onSelectState={openState}
              />
              {loadingMunicipalities ? (
                <div className="sentinela-map-overlay">Carregando municípios…</div>
              ) : null}
            </>
          ) : (
            <div className="sentinela-map-status">Não foi possível montar o mapa do Brasil.</div>
          )}
        </div>

        <RateRanking
          key={selectedState ? selectedState.sigla : (selectedRegion ?? "Brasil")}
          scopeLabel={
            selectedState ? `Municípios de ${selectedState.sigla}` : selectedRegion ? `Estados do ${selectedRegion}` : "Estados"
          }
          loading={loadingSummary || (Boolean(selectedSigla) && loadingMunicipalities)}
          items={selectedSigla && loadingMunicipalities ? [] : rankingItems}
          activeId={selectedSigla ? highlightedId : selectedSigla}
          onSelect={selectRankingItem}
        />
      </div>

      {summary && (selectedUf || regionStats || summary) ? (
        <MapInsights
          scopeName={title}
          scope={selectedUf ?? regionStats ?? summary}
          baselineName="Brasil"
          baseline={summary}
          contextName={selectedUf ? selectedState?.regiao : null}
          contextRate={
            selectedUf && selectedState
              ? aggregateMetrics(summary.ufs.filter((uf) => regionOf(uf.sigla) === selectedState.regiao)).rate
              : null
          }
          places={selectedSigla && loadingMunicipalities ? [] : insightPlaces}
          placeNoun={selectedSigla ? "município" : "estado"}
          groups={regionGroups}
          activeId={highlightedId ?? selectedSigla}
          loadingPlaces={Boolean(selectedSigla) && loadingMunicipalities}
          onSelect={selectRankingItem}
        />
      ) : null}

      <footer className="sentinela-map-legend">
        <span>Tom mais forte, taxa maior · por 100 mil hab. · IBGE 2024</span>
        <span>
          {selectedSigla
            ? `${formatCount(points.length)} municípios · ${formatCount(unlocated)} sem coordenada`
            : `${formatCount(points.length)} UFs`}
          {summary ? ` · ${formatCount(scopeDeaths)} óbitos` : ""}
          {source === "ibge" ? " · malha IBGE" : source === "local" ? " · malha local" : ""}
          {geoError && source === "local" ? " (IBGE indisponível)" : ""}
        </span>
      </footer>
    </section>
  );
}
