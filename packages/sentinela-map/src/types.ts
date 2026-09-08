import type { Feature, FeatureCollection, Geometry } from "geojson";

export type OccurrenceSeverity = "leve" | "grave" | "obito";

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
