"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { regionColor, regionOf } from "./brazil-states";
import { formatCount, formatRate } from "./format";
import type { MapPoint, StateFeature, StateFeatureCollection } from "./types";
import "leaflet/dist/leaflet.css";

type BrazilMapProps = {
  geojson: StateFeatureCollection;
  selectedSigla: string | null;
  selectedRegion: string | null;
  points: MapPoint[];
  ratesByUf: Map<string, number>;
  highlightedId: string | null;
  onSelectState: (sigla: string) => void;
};

function OccurrencePane() {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane("occurrences")) {
      const pane = map.createPane("occurrences");
      pane.style.zIndex = "650";
    }
  }, [map]);

  return null;
}

function MapViewport({
  geojson,
  focus,
}: {
  geojson: StateFeatureCollection;
  focus: "country" | "region" | "state";
}) {
  const map = useMap();

  useEffect(() => {
    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();
    if (!bounds.isValid()) {
      return;
    }

    map.fitBounds(bounds, {
      animate: true,
      padding: [28, 28],
      maxZoom: focus === "state" ? 10 : focus === "region" ? 6 : 5,
    });
    map.setMaxBounds(bounds.pad(focus === "country" ? 0.22 : 0.45));
    const timeoutId = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timeoutId);
  }, [focus, geojson, map]);

  return null;
}

const STREET_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const STREET_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com/" rel="noreferrer">Esri</a>, TomTom, FAO, NOAA, USGS';

function useMapTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function regionFill(region: string, value: number, max: number, theme: "dark" | "light") {
  const { r, g, b } = hexToRgb(regionColor(region));
  const amount = !value || !max ? 0 : Math.pow(Math.max(0, Math.min(1, value / max)), 0.72);
  const mix = theme === "light" ? 0.28 + 0.72 * amount : 0.42 + 0.58 * amount;
  const target = theme === "light" ? 255 : 0;
  return `rgb(${Math.round(r * mix + target * (1 - mix))}, ${Math.round(g * mix + target * (1 - mix))}, ${Math.round(b * mix + target * (1 - mix))})`;
}

function pointRadius(rate: number, max: number, selected: boolean) {
  const t = max > 0 ? Math.sqrt(Math.max(rate, 0) / max) : 0;
  const min = selected ? 4 : 3.2;
  const span = selected ? 9 : 7;
  return min + t * span;
}

function FocusPoint({ point }: { point: MapPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) {
      return;
    }
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), point.kind === "municipality" ? 8 : 5), {
      duration: 0.55,
    });
  }, [map, point]);

  return null;
}

export function BrazilMap({
  geojson,
  selectedSigla,
  selectedRegion,
  points,
  ratesByUf,
  highlightedId,
  onSelectState,
}: BrazilMapProps) {
  const displayedGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: geojson.features.filter((feature) => {
        if (selectedSigla) {
          return feature.properties.sigla === selectedSigla;
        }
        if (selectedRegion) {
          return feature.properties.regiao === selectedRegion;
        }
        return true;
      }),
    };
  }, [geojson, selectedRegion, selectedSigla]);

  const maxRate = useMemo(() => Math.max(0, ...ratesByUf.values()), [ratesByUf]);
  const maxPointRate = useMemo(
    () => Math.max(0, ...points.map((point) => point.rate ?? 0)),
    [points],
  );
  const highlightedPoint = points.find((point) => point.id === highlightedId) ?? null;
  const theme = useMapTheme();
  const focus = selectedSigla ? "state" : selectedRegion ? "region" : "country";

  function styleFeature(feature?: StateFeature) {
    const sigla = feature?.properties.sigla ?? "";
    const rate = ratesByUf.get(sigla) ?? 0;

    return {
      color: theme === "light" ? "#18181b" : "#fafafa",
      weight: selectedSigla ? 2 : 1.25,
      opacity: 1,
      fillColor: regionFill(feature?.properties.regiao ?? regionOf(sigla) ?? "", rate, maxRate, theme),
      fillOpacity: selectedSigla ? 0.22 : rate === 0 ? 0.34 : 0.72,
    };
  }

  return (
    <MapContainer
      className="sentinela-leaflet"
      center={[-14.2, -51.9]}
      zoom={4}
      minZoom={4}
      maxZoom={12}
      maxBoundsViscosity={0.85}
      scrollWheelZoom
    >
      <TileLayer url={STREET_TILES} attribution={STREET_ATTRIBUTION} maxNativeZoom={19} />
      <OccurrencePane />
      <MapViewport geojson={displayedGeoJson} focus={focus} />
      <FocusPoint point={highlightedPoint?.kind === "municipality" ? highlightedPoint : null} />
      <GeoJSON
        key={`${selectedSigla ?? selectedRegion ?? "br"}-${theme}`}
        data={displayedGeoJson}
        style={(feature) => styleFeature(feature as StateFeature)}
        onEachFeature={(feature, layer) => {
          const state = (feature as StateFeature).properties;
          const rate = ratesByUf.get(state.sigla) ?? 0;

          layer.bindTooltip(`${state.nome} · ${state.regiao} · ${formatRate(rate)} por 100 mil hab.`, {
            sticky: true,
            className: "sentinela-map-tooltip",
            opacity: 1,
          });

          layer.on({
            mouseover: (event) => {
              event.target.setStyle({
                weight: 2.5,
                fillOpacity: selectedSigla ? 0.34 : 0.84,
                fillColor: regionFill(state.regiao, rate, maxRate, theme),
                color: theme === "light" ? "#000" : "#fff",
              });
              event.target.bringToFront();
            },
            mouseout: (event) => {
              event.target.setStyle(styleFeature(feature as StateFeature));
            },
            click: () => {
              if (!selectedSigla) {
                onSelectState(state.sigla);
              }
            },
          });
        }}
      />
      {points.map((point) => {
        const highlighted = point.id === highlightedId;
        return (
          <CircleMarker
            key={point.id}
            pane="occurrences"
            center={[point.lat, point.lng]}
            radius={pointRadius(point.rate ?? 0, maxPointRate, Boolean(selectedSigla)) + (highlighted ? 2 : 0)}
            pathOptions={{
              color: theme === "light" ? "#18181b" : "#fafafa",
              weight: highlighted ? 2.5 : 1.25,
              fillColor: regionFill(regionOf(point.uf) ?? "", point.rate ?? 0, maxPointRate, theme),
              fillOpacity: 0.95,
            }}
            eventHandlers={{
              click: (event) => event.originalEvent.stopPropagation(),
            }}
          >
            <Tooltip className="sentinela-map-tooltip" direction="top">
              {point.name} · {formatRate(point.rate)} por 100 mil hab.
            </Tooltip>
            <Popup className="sentinela-map-popup">
              <strong>
                {point.name} · {point.uf}
              </strong>
              <p>{formatRate(point.rate)} CAT por 100 mil habitantes.</p>
              <small>
                {formatCount(point.total)} CAT · {formatCount(point.population)} hab. · Óbitos{" "}
                {formatCount(point.deaths)} · Típico {formatCount(point.typical)} · Trajeto{" "}
                {formatCount(point.commute)} · Doença {formatCount(point.disease)}
              </small>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
