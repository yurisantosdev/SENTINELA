import type { Feature, FeatureCollection, Geometry } from "geojson";

export type BrazilStateMeta = {
  id: number;
  sigla: string;
  nome: string;
  regiao: string;
};

export type StateProperties = BrazilStateMeta & {
  codarea: string;
};

export type StateFeature = Feature<Geometry, StateProperties>;
export type StateFeatureCollection = FeatureCollection<Geometry, StateProperties>;

export type CatMetrics = {
  total: number;
  deaths: number;
  typical: number;
  commute: number;
  disease: number;
  population: number;
  rate: number | null;
};

export type UfMapStat = CatMetrics & {
  sigla: string;
  nome: string;
  lat: number;
  lng: number;
};

export type CatMapSummary = CatMetrics & {
  unknown: number;
  ufs: UfMapStat[];
};

export type MunicipalityMapPoint = CatMetrics & {
  id: string;
  ibge: string;
  name: string;
  uf: string;
  lat: number;
  lng: number;
};

export type MapPoint = CatMetrics & {
  id: string;
  uf: string;
  name: string;
  lat: number;
  lng: number;
  kind: "uf" | "municipality";
};

export type OccurrenceSeverity = "leve" | "grave" | "obito";

export type Occurrence = {
  id: string;
  uf: string;
  city: string;
  lat: number;
  lng: number;
  severity: OccurrenceSeverity;
  description: string;
  date: string;
};
