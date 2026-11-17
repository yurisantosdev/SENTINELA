"use client";

import { useCallback, useEffect, useState } from "react";

type RiskStatus = "ready" | "insufficient" | "unavailable";

type RiskFactor = {
  code: string;
  label: string;
  coefficient: number;
  odds_ratio: number;
  effect: "aumenta" | "reduz";
};

type RiskReport = {
  status: RiskStatus;
  algorithm: string;
  family: string;
  question: string;
  message: string;
  sample_size: number;
  deaths: number;
  death_rate: number | null;
  holdout_size: number;
  auc: number | null;
  factors: RiskFactor[];
  reference: string;
  trained_at: string | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function RiskReading() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/cat/risk?refresh=${refresh ? "true" : "false"}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Não foi possível treinar a leitura de risco.");
      }
      setReport(data);
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "Erro inesperado ao consultar o modelo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const ready = report?.status === "ready";

  return (
    <section className="card risk-panel">
      <div className="section-heading inline">
        <div>
          <span>Modelo supervisionado</span>
          <h2>Chance de óbito na CAT</h2>
          <p>{report?.question ?? "Quais características da CAT se associam a uma comunicação com óbito?"}</p>
        </div>
        <button className="ghost-action" type="button" disabled={loading} onClick={() => load(true)}>
          {loading ? "Calculando" : "Atualizar leitura"}
        </button>
      </div>

      {error ? <p className="message">{error}</p> : null}

      {report ? (
        <>
          <div className="risk-meta" aria-label="Resumo do modelo">
            <span>{report.algorithm}</span>
            <span>{report.family}</span>
            {ready && report.auc != null ? <span>AUC {report.auc.toLocaleString("pt-BR")}</span> : null}
            {ready ? (
              <span>
                {report.sample_size.toLocaleString("pt-BR")} CATs · {report.deaths.toLocaleString("pt-BR")} óbitos
              </span>
            ) : null}
          </div>
          <p className={ready ? "risk-reading" : "message"}>{report.message}</p>
          {ready ? (
            <div className="risk-factors">
              {report.factors.slice(0, 8).map((factor) => (
                <article key={factor.code} className="risk-factor">
                  <div>
                    <strong>{factor.label}</strong>
                    <div className="risk-track" aria-hidden="true">
                      <span className={factor.effect === "aumenta" ? "risk-up" : "risk-down"} style={{ width: barWidth(factor.odds_ratio) }} />
                    </div>
                  </div>
                  <em className={factor.effect === "aumenta" ? "risk-up-text" : "risk-down-text"}>
                    {factor.effect === "aumenta" ? "aumenta" : "reduz"} · {factor.odds_ratio.toLocaleString("pt-BR")}×
                  </em>
                </article>
              ))}
            </div>
          ) : null}
          {ready ? <p className="risk-note">{report.reference}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function barWidth(oddsRatio: number) {
  if (oddsRatio <= 0) {
    return "8%";
  }
  const magnitude = Math.min(Math.abs(Math.log(oddsRatio)), 1.6) / 1.6;
  return `${Math.round(12 + magnitude * 88)}%`;
}
