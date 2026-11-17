"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PatternStatus = "ready" | "insufficient" | "unavailable";

type PatternReport = {
  status: PatternStatus;
  message: string;
  headline: string;
  headline_change: number | null;
  period_label: string;
  stability: number | null;
  stability_note: string;
  series: { month: string; label: string; total: number; typical: number; commute: number; disease: number }[];
  heatmap: { month: string; label: string; days: number[] }[];
  peak: string;
  activities: { label: string; total: number; share: number }[];
  regions: { name: string; total: number; rate: number | null; color: string }[];
  municipalities: { name: string; uf: string; total: number; rate: number }[];
  anomalies: { label: string; kind: "maquina" | "setor"; change: number; recent: number; previous: number; sentence: string }[];
  associations: { agent: string; injury: string; count: number; lift: number }[];
  clusters: { name: string; summary: string; states: { sigla: string; nome: string; rate: number }[] }[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function PatternBoard() {
  const [report, setReport] = useState<PatternReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/cat/patterns?refresh=${refresh ? "true" : "false"}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Não foi possível montar a leitura dos padrões.");
      }
      setReport(data);
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : "Erro inesperado ao consultar os padrões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const ready = report?.status === "ready";

  return (
    <section className="ai-board">
      <div className="section-heading inline">
        <div>
          <span>Inteligência sobre os registros</span>
          <h2>Padrões que a leitura encontra nas CATs</h2>
          <p>{report?.message ?? "A leitura percorre o histórico e destaca o que muda de volume, lugar, setor, agente e período."}</p>
        </div>
        <button className="ghost-action" type="button" disabled={loading} onClick={() => load(true)}>
          {loading ? "Lendo registros" : "Atualizar leitura"}
        </button>
      </div>

      {error ? <p className="message">{error}</p> : null}
      {report && !ready ? <p className="message">{report.headline}</p> : null}

      {ready && report ? <PatternBody report={report} /> : null}
    </section>
  );
}

function PatternBody({ report }: { report: PatternReport }) {
  return (
    <>
      <div className="ai-top">
        <article className="ai-score">
          <StabilityRing score={report.stability} />
          <div>
            <span>Estabilidade dos setores</span>
            <strong>{report.stability == null ? "—" : `${report.stability}%`}</strong>
            <p>{report.stability_note}</p>
            <small>{report.period_label}</small>
          </div>
        </article>
        <article className="ai-series">
          <header>
            <span>Comunicações por mês</span>
            <div className="ai-legend">
              <i className="ai-typical" /> Típico
              <i className="ai-commute" /> Trajeto
              <i className="ai-disease" /> Doença
            </div>
          </header>
          <SeriesChart points={report.series} />
        </article>
      </div>

      <article className="ai-callout">
        <span>Aumento fora do ritmo</span>
        <p>{report.headline}</p>
      </article>

      <div className="ai-split">
        <article className="ai-panel">
          <header>
            <span>Atividades econômicas</span>
            <h3>Maior incidência</h3>
          </header>
          <BarList
            items={report.activities.map((item) => ({
              label: item.label,
              value: item.total.toLocaleString("pt-BR"),
              width: item.share,
            }))}
          />
        </article>
        <article className="ai-panel">
          <header>
            <span>Comparação</span>
            <h3>Regiões e municípios</h3>
          </header>
          <RegionBars regions={report.regions} />
          <ul className="ai-municipalities">
            {report.municipalities.map((place) => (
              <li key={`${place.uf}-${place.name}`}>
                <strong>
                  {place.name} · {place.uf}
                </strong>
                <em>{place.rate.toLocaleString("pt-BR")} / 100 mil</em>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="ai-panel">
        <header>
          <span>Dia e mês</span>
          <h3>Quando as comunicações se concentram</h3>
          <p>{report.peak}</p>
        </header>
        <Heatmap cells={report.heatmap} />
        <HeatLegend />
      </article>

      <div className="ai-split">
        <article className="ai-panel">
          <header>
            <span>Agrupamento</span>
            <h3>Padrão dos estados</h3>
          </header>
          <div className="ai-clusters">
            {report.clusters.map((cluster) => (
              <section key={cluster.name}>
                <h4>{cluster.name}</h4>
                <p>{cluster.summary}</p>
                <div>
                  {cluster.states.map((state) => (
                    <span key={state.sigla} title={`${state.nome}: ${state.rate.toLocaleString("pt-BR")} por 100 mil`}>
                      {state.sigla}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
        <article className="ai-panel">
          <header>
            <span>Regras de associação</span>
            <h3>Agente causador e lesão</h3>
          </header>
          <ul className="ai-links">
            {report.associations.map((item) => (
              <li key={`${item.agent}-${item.injury}`}>
                <div>
                  <strong>{item.agent}</strong>
                  <small>{item.injury}</small>
                </div>
                <em>{item.lift.toLocaleString("pt-BR")}×</em>
              </li>
            ))}
          </ul>
          {report.anomalies.length ? (
            <ul className="ai-alerts">
              {report.anomalies.slice(0, 3).map((item) => (
                <li key={`${item.kind}-${item.label}`}>
                  {item.kind === "maquina" ? "Máquinas · " : "Setor · "}
                  {item.label} · +{item.change.toLocaleString("pt-BR")}%
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </div>
    </>
  );
}

function StabilityRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const radius = 46;
  const length = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * length;
  return (
    <svg className="ai-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} />
      <circle cx="60" cy="60" r={radius} strokeDasharray={`${dash} ${length - dash}`} />
    </svg>
  );
}

function SeriesChart({ points }: { points: PatternReport["series"] }) {
  const chart = useMemo(() => buildSeries(points), [points]);
  if (!chart) {
    return <p className="ai-empty">A série mensal ainda não está disponível.</p>;
  }
  return (
    <svg className="ai-chart" viewBox="0 0 640 180" role="img" aria-label="Série mensal de comunicações">
      {chart.guides.map((y) => (
        <line key={y} x1="28" x2="628" y1={y} y2={y} />
      ))}
      <path className="ai-typical" d={chart.typical} />
      <path className="ai-commute" d={chart.commute} />
      <path className="ai-disease" d={chart.disease} />
      {chart.labels.map((label) => (
        <text key={label.month} x={label.x} y="172">
          {label.label}
        </text>
      ))}
    </svg>
  );
}

function Heatmap({ cells }: { cells: PatternReport["heatmap"] }) {
  const max = Math.max(1, ...cells.flatMap((cell) => cell.days));
  return (
    <div className="ai-heat" style={{ gridTemplateColumns: `64px repeat(${Math.max(cells.length, 1)}, minmax(2.4rem, 1fr))` }}>
      <span />
      {cells.map((cell) => (
        <span key={cell.month}>{cell.label}</span>
      ))}
      {WEEKDAYS.map((weekday, index) => (
        <HeatmapRow key={weekday} weekday={weekday} index={index} cells={cells} max={max} />
      ))}
    </div>
  );
}

function HeatmapRow({
  weekday,
  index,
  cells,
  max,
}: {
  weekday: string;
  index: number;
  cells: PatternReport["heatmap"];
  max: number;
}) {
  return (
    <>
      <span>{weekday}</span>
      {cells.map((cell) => {
        const value = cell.days[index] ?? 0;
        const tone = value / max;
        return (
          <i
            key={`${cell.month}-${weekday}`}
            style={{ background: heatColor(tone), color: tone > 0.55 ? "#fff" : "#0f172a" }}
            title={`${weekday} · ${cell.label}: ${value.toLocaleString("pt-BR")}`}
          >
            {value > 0 ? compact(value) : ""}
          </i>
        );
      })}
    </>
  );
}

function RegionBars({ regions }: { regions: PatternReport["regions"] }) {
  const max = Math.max(1, ...regions.map((region) => region.rate ?? 0));
  return (
    <div className="ai-bars">
      {regions.map((region) => (
        <div key={region.name}>
          <span>{region.name}</span>
          <div>
            <b style={{ width: `${((region.rate ?? 0) / max) * 100}%`, background: region.color }} />
          </div>
          <em>{region.rate == null ? "—" : region.rate.toLocaleString("pt-BR")}</em>
        </div>
      ))}
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: string; width: number }[] }) {
  const max = Math.max(0.01, ...items.map((item) => item.width));
  return (
    <div className="ai-activity">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <div>
            <b style={{ width: `${(item.width / max) * 100}%` }} />
          </div>
          <em>{item.value}</em>
        </div>
      ))}
    </div>
  );
}

function buildSeries(points: PatternReport["series"]) {
  if (points.length < 2) {
    return null;
  }
  const max = Math.max(1, ...points.flatMap((point) => [point.typical, point.commute, point.disease]));
  const step = points.length === 1 ? 0 : 600 / (points.length - 1);
  const yOf = (value: number) => 150 - (value / max) * 130;
  const pathOf = (key: "typical" | "commute" | "disease") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${28 + index * step} ${yOf(point[key])}`).join(" ");
  const labels = points
    .filter((_, index) => index % Math.ceil(points.length / 6) === 0 || index === points.length - 1)
    .map((point) => ({
      month: point.month,
      label: point.label,
      x: 28 + points.indexOf(point) * step,
    }));
  return {
    typical: pathOf("typical"),
    commute: pathOf("commute"),
    disease: pathOf("disease"),
    guides: [20, 85, 150],
    labels,
  };
}

const HEAT_STOPS = [
  { tone: 0, label: "Poucas" },
  { tone: 0.35, label: "Volume baixo" },
  { tone: 0.7, label: "Volume alto" },
  { tone: 1, label: "Pico do recorte" },
];

function HeatLegend() {
  return (
    <div className="ai-heat-legend">
      <p>A cor compara o dia da semana naquele mês com a célula mais cheia deste quadro.</p>
      <ul>
        {HEAT_STOPS.map((stop) => (
          <li key={stop.label}>
            <i style={{ background: heatColor(stop.tone) }} />
            {stop.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function heatColor(tone: number) {
  const clamped = Math.max(0, Math.min(1, tone));
  const hue = 145 - clamped * 145;
  const light = 42 + (1 - clamped) * 16;
  return `hsl(${hue} ${clamped > 0.08 ? 72 : 12}% ${clamped > 0.08 ? light : 28}%)`;
}

function compact(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`.replace(".", ",");
  }
  return String(value);
}
