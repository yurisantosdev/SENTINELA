"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { formatCount, formatRate } from "./format";
import type { MapPoint, StateFeature, StateFeatureCollection } from "./types";
import "leaflet/dist/leaflet.css";

type BrazilMapProps = {
  geojson: StateFeatureCollection;
  selectedSigla: string | null;
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

function MapViewport({ geojson, selectedSigla }: { geojson: StateFeatureCollection; selectedSigla: string | null }) {
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
      maxZoom: selectedSigla ? 10 : 5,
    });
    map.setMaxBounds(bounds.pad(selectedSigla ? 0.45 : 0.22));
    const timeoutId = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timeoutId);
  }, [geojson, map, selectedSigla]);

  return null;
}

function choroplethColor(value: number, max: number) {
  if (!value || !max) {
    return "#0f172a";
  }
  const t = Math.max(0.12, Math.min(1, value / max));
  const r = Math.round(8 + 48 * t);
  const g = Math.round(47 + 142 * t);
  const b = Math.round(73 + 175 * t);
  return `rgb(${r}, ${g}, ${b})`;
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
  points,
  ratesByUf,
  highlightedId,
  onSelectState,
}: BrazilMapProps) {
  const displayedGeoJson = useMemo(() => {
    if (!selectedSigla) {
      return geojson;
    }

    return {
      type: "FeatureCollection" as const,
      features: geojson.features.filter((feature) => feature.properties.sigla === selectedSigla),
    };
  }, [geojson, selectedSigla]);

  const maxRate = useMemo(() => Math.max(0, ...ratesByUf.values()), [ratesByUf]);
  const maxPointRate = useMemo(
    () => Math.max(0, ...points.map((point) => point.rate ?? 0)),
    [points],
  );
  const highlightedPoint = points.find((point) => point.id === highlightedId) ?? null;

  function styleFeature(feature?: StateFeature) {
    const rate = ratesByUf.get(feature?.properties.sigla ?? "") ?? 0;
    const isSelected = Boolean(selectedSigla);

    return {
      color: isSelected ? "#7dd3fc" : "#38bdf8",
      weight: isSelected ? 2 : 1,
      opacity: 0.95,
      fillColor: choroplethColor(rate, maxRate),
      fillOpacity: isSelected ? 0.14 : rate === 0 ? 0.16 : 0.42,
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
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
      />
      <OccurrencePane />
      <MapViewport geojson={displayedGeoJson} selectedSigla={selectedSigla} />
      <FocusPoint point={highlightedPoint?.kind === "municipality" ? highlightedPoint : null} />
      <GeoJSON
        key={selectedSigla ?? "br"}
        data={displayedGeoJson}
        style={(feature) => styleFeature(feature as StateFeature)}
        onEachFeature={(feature, layer) => {
          const state = (feature as StateFeature).properties;
          const rate = ratesByUf.get(state.sigla) ?? 0;

          layer.bindTooltip(`${state.nome} · ${formatRate(rate)} por 100 mil hab.`, {
            sticky: true,
            className: "sentinela-map-tooltip",
            opacity: 1,
          });

          layer.on({
            mouseover: (event) => {
              event.target.setStyle({
                weight: 2.5,
                fillOpacity: 0.55,
                fillColor: "#38bdf8",
                color: "#e0f2fe",
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
              color: highlighted ? "#e0f2fe" : "#020617",
              weight: highlighted ? 2.5 : 1.5,
              fillColor: choroplethColor(point.rate ?? 0, maxPointRate),
              fillOpacity: 0.92,
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
