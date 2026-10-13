"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatMapSummary, MunicipalityMapPoint } from "./types";

const defaultApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function useCatMapData(apiBaseUrl = defaultApiBaseUrl) {
  const [summary, setSummary] = useState<CatMapSummary | null>(null);
  const [municipalities, setMunicipalities] = useState<MunicipalityMapPoint[]>([]);
  const [unlocated, setUnlocated] = useState(0);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/cat/map/ufs`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível agregar as CATs do MongoDB.");
      }
      setSummary((await response.json()) as CatMapSummary);
    } catch (caughtError) {
      setSummary(null);
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao carregar o mapa.");
    } finally {
      setLoadingSummary(false);
    }
  }, [apiBaseUrl]);

  const loadMunicipalities = useCallback(
    async (sigla: string | null) => {
      if (!sigla) {
        setMunicipalities([]);
        setUnlocated(0);
        setLoadingMunicipalities(false);
        return;
      }

      setMunicipalities([]);
      setUnlocated(0);
      setLoadingMunicipalities(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/cat/map/ufs/${sigla}/municipalities`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Não foi possível carregar os municípios dessa UF.");
        }
        const payload = (await response.json()) as {
          points: MunicipalityMapPoint[];
          unlocated: number;
        };
        setMunicipalities(payload.points);
        setUnlocated(payload.unlocated ?? 0);
      } catch (caughtError) {
        setMunicipalities([]);
        setUnlocated(0);
        setError(caughtError instanceof Error ? caughtError.message : "Falha ao carregar municípios.");
      } finally {
        setLoadingMunicipalities(false);
      }
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    loadSummary().catch(() => undefined);
  }, [loadSummary]);

  return {
    summary,
    municipalities,
    unlocated,
    loadingSummary,
    loadingMunicipalities,
    error,
    loadMunicipalities,
  };
}
