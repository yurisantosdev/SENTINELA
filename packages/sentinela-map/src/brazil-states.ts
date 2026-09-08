import type { BrazilStateMeta } from "./types";

export const BRAZIL_STATES: BrazilStateMeta[] = [
  { id: 11, sigla: "RO", nome: "Rondônia", regiao: "Norte" },
  { id: 12, sigla: "AC", nome: "Acre", regiao: "Norte" },
  { id: 13, sigla: "AM", nome: "Amazonas", regiao: "Norte" },
  { id: 14, sigla: "RR", nome: "Roraima", regiao: "Norte" },
  { id: 15, sigla: "PA", nome: "Pará", regiao: "Norte" },
  { id: 16, sigla: "AP", nome: "Amapá", regiao: "Norte" },
  { id: 17, sigla: "TO", nome: "Tocantins", regiao: "Norte" },
  { id: 21, sigla: "MA", nome: "Maranhão", regiao: "Nordeste" },
  { id: 22, sigla: "PI", nome: "Piauí", regiao: "Nordeste" },
  { id: 23, sigla: "CE", nome: "Ceará", regiao: "Nordeste" },
  { id: 24, sigla: "RN", nome: "Rio Grande do Norte", regiao: "Nordeste" },
  { id: 25, sigla: "PB", nome: "Paraíba", regiao: "Nordeste" },
  { id: 26, sigla: "PE", nome: "Pernambuco", regiao: "Nordeste" },
  { id: 27, sigla: "AL", nome: "Alagoas", regiao: "Nordeste" },
  { id: 28, sigla: "SE", nome: "Sergipe", regiao: "Nordeste" },
  { id: 29, sigla: "BA", nome: "Bahia", regiao: "Nordeste" },
  { id: 31, sigla: "MG", nome: "Minas Gerais", regiao: "Sudeste" },
  { id: 32, sigla: "ES", nome: "Espírito Santo", regiao: "Sudeste" },
  { id: 33, sigla: "RJ", nome: "Rio de Janeiro", regiao: "Sudeste" },
  { id: 35, sigla: "SP", nome: "São Paulo", regiao: "Sudeste" },
  { id: 41, sigla: "PR", nome: "Paraná", regiao: "Sul" },
  { id: 42, sigla: "SC", nome: "Santa Catarina", regiao: "Sul" },
  { id: 43, sigla: "RS", nome: "Rio Grande do Sul", regiao: "Sul" },
  { id: 50, sigla: "MS", nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  { id: 51, sigla: "MT", nome: "Mato Grosso", regiao: "Centro-Oeste" },
  { id: 52, sigla: "GO", nome: "Goiás", regiao: "Centro-Oeste" },
  { id: 53, sigla: "DF", nome: "Distrito Federal", regiao: "Centro-Oeste" },
];

export const BRAZIL_STATES_BY_ID = new Map(BRAZIL_STATES.map((state) => [String(state.id), state]));
export const BRAZIL_STATES_BY_SIGLA = new Map(BRAZIL_STATES.map((state) => [state.sigla, state]));
