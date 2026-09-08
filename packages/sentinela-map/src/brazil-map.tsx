"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Occurrence, StateFeature, StateFeatureCollection } from "./types";
import "leaflet/dist/leaflet.css";

type BrazilMapProps = {
  geojson: StateFeatureCollection;
  selectedSigla: string | null;
  occurrences: Occurrence[];
  countsByUf: Map<string, number>;
  onSelectState: (sigla: string) => void;
};

const severityColor: Record<Occurrence["severity"], string> = {
  leve: "#fbbf24",
  grave: "#fb7185",
  obito: "#f43f5e",
};

const severityLabel: Record<Occurrence["severity"], string> = {
  leve: "Leve",
  grave: "Grave",
  obito: "Óbito",
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

export function BrazilMap({
  geojson,
  selectedSigla,
  occurrences,
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

  function styleFeature(feature?: StateFeature) {
    const count = countsByUf.get(feature?.properties.sigla ?? "") ?? 0;
    const isSelected = Boolean(selectedSigla);

    return {
      color: isSelected ? "#7dd3fc" : "#38bdf8",
      weight: isSelected ? 2 : 1,
      opacity: 0.95,
      fillColor: count === 0 ? "#0f3a52" : count < 2 ? "#075985" : count < 4 ? "#0284c7" : "#38bdf8",
      fillOpacity: isSelected ? 0.16 : count === 0 ? 0.18 : 0.32,
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

          layer.bindTooltip(`${state.nome} · ${state.sigla} · ${count} ocorrência${count === 1 ? "" : "s"}`, {
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
      {occurrences.map((occurrence) => (
        <CircleMarker
          key={occurrence.id}
          pane="occurrences"
          center={[occurrence.lat, occurrence.lng]}
          radius={selectedSigla ? 9 : 7}
          pathOptions={{
            color: "#020617",
            weight: 1.5,
            fillColor: severityColor[occurrence.severity],
            fillOpacity: 0.95,
          }}
        >
          <Tooltip className="sentinela-map-tooltip" direction="top">
            {occurrence.city}
          </Tooltip>
          <Popup className="sentinela-map-popup">
            <strong>
              {occurrence.city} · {occurrence.uf}
            </strong>
            <p>{occurrence.description}</p>
            <small>
              {new Intl.DateTimeFormat("pt-BR").format(new Date(`${occurrence.date}T00:00:00`))} ·{" "}
              {severityLabel[occurrence.severity]}
            </small>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
