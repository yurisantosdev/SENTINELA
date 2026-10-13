"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { MapPoint, StateFeature, StateFeatureCollection } from "./types";
import "leaflet/dist/leaflet.css";

type BrazilMapProps = {
  geojson: StateFeatureCollection;
  selectedSigla: string | null;
  points: MapPoint[];
  countsByUf: Map<string, number>;
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

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function pointColor(point: MapPoint) {
  const deathRate = point.total ? point.deaths / point.total : 0;
  if (deathRate >= 0.005 && point.deaths > 0) {
    return "#f43f5e";
  }
  if (point.deaths > 0) {
    return "#fb7185";
  }
  if (point.commute >= point.typical && point.commute >= point.disease) {
    return "#fbbf24";
  }
  if (point.disease >= point.typical) {
    return "#c084fc";
  }
  return "#38bdf8";
}

function pointRadius(total: number, selected: boolean) {
  const scaled = 3 + Math.log10(Math.max(total, 1)) * (selected ? 2.2 : 1.7);
  return Math.max(selected ? 3.5 : 3, Math.min(selected ? 10 : 8, scaled));
}

function choroplethColor(count: number, max: number) {
  if (!count || !max) {
    return "#0f172a";
  }
  const t = Math.max(0.18, Math.log1p(count) / Math.log1p(max));
  const r = Math.round(8 + 48 * t);
  const g = Math.round(47 + 142 * t);
  const b = Math.round(73 + 175 * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function BrazilMap({
  geojson,
  selectedSigla,
  points,
  countsByUf,
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

  const maxCount = useMemo(() => Math.max(0, ...countsByUf.values()), [countsByUf]);

  function styleFeature(feature?: StateFeature) {
    const count = countsByUf.get(feature?.properties.sigla ?? "") ?? 0;
    const isSelected = Boolean(selectedSigla);

    return {
      color: isSelected ? "#7dd3fc" : "#38bdf8",
      weight: isSelected ? 2 : 1,
      opacity: 0.95,
      fillColor: choroplethColor(count, maxCount),
      fillOpacity: isSelected ? 0.14 : count === 0 ? 0.16 : 0.42,
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
      <GeoJSON
        key={selectedSigla ?? "br"}
        data={displayedGeoJson}
        style={(feature) => styleFeature(feature as StateFeature)}
        onEachFeature={(feature, layer) => {
          const state = (feature as StateFeature).properties;
          const count = countsByUf.get(state.sigla) ?? 0;

          layer.bindTooltip(`${state.nome} · ${state.sigla} · ${formatCount(count)} CAT`, {
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
      {points.map((point) => (
        <CircleMarker
          key={point.id}
          pane="occurrences"
          center={[point.lat, point.lng]}
          radius={pointRadius(point.total, Boolean(selectedSigla))}
          pathOptions={{
            color: "#020617",
            weight: 1.5,
            fillColor: pointColor(point),
            fillOpacity: 0.9,
          }}
          eventHandlers={{
            click: (event) => event.originalEvent.stopPropagation(),
          }}
        >
          <Tooltip className="sentinela-map-tooltip" direction="top">
            {point.name} · {formatCount(point.total)}
          </Tooltip>
          <Popup className="sentinela-map-popup">
            <strong>
              {point.name} · {point.uf}
            </strong>
            <p>{formatCount(point.total)} comunicações CAT neste ponto.</p>
            <small>
              Óbitos {formatCount(point.deaths)} · Típico {formatCount(point.typical)} · Trajeto{" "}
              {formatCount(point.commute)} · Doença {formatCount(point.disease)}
            </small>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
