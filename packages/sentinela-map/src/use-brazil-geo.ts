"use client";

import { useCallback, useEffect, useState } from "react";
import fallbackJson from "./data/brazil-states.json";
import { BRAZIL_STATES_BY_ID } from "./brazil-states";
import type { StateFeatureCollection } from "./types";

const fallbackGeoJson = fallbackJson as GeoJSON.FeatureCollection;

const IBGE_MALHAS_URL =
  "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=" +
  encodeURIComponent("application/vnd.geo+json") +
  "&qualidade=minima&intrarregiao=UF";

function enrichCollection(collection: GeoJSON.FeatureCollection): StateFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const codarea = String(feature.properties?.codarea ?? "");
      const meta = BRAZIL_STATES_BY_ID.get(codarea);

      return {
        ...feature,
        properties: {
          codarea,
          id: meta?.id ?? Number(codarea),
          sigla: meta?.sigla ?? codarea,
          nome: meta?.nome ?? "Estado",
          regiao: meta?.regiao ?? "",
        },
      };
    }),
  };
}

export function useBrazilGeo() {
  const [data, setData] = useState<StateFeatureCollection>(() => enrichCollection(fallbackGeoJson));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"ibge" | "local">("local");

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(IBGE_MALHAS_URL, { signal, cache: "force-cache" });
      if (!response.ok) {
        throw new Error("A malha do IBGE não respondeu.");
      }

      const json = (await response.json()) as GeoJSON.FeatureCollection;
      if (signal.aborted) {
        return;
      }

      setData(enrichCollection(json));
      setSource("ibge");
    } catch (caughtError) {
      if (signal.aborted) {
        return;
      }

      setData(enrichCollection(fallbackGeoJson));
      setSource("local");
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao consultar o IBGE.");
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [load]);

  return { data, loading, error, source };
}
