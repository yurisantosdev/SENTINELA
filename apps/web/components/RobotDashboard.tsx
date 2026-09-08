"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type JobStatus = "idle" | "running" | "completed" | "failed";

type JobSnapshot = {
  status: JobStatus;
  started_at: string | null;
  finished_at: string | null;
  dataset_url: string | null;
  current_resource: string | null;
  resources_total: number;
  resources_done: number;
  rows_seen: number;
  rows_inserted: number;
  errors: string[];
  logs: string[];
};

const initialSnapshot: JobSnapshot = {
  status: "idle",
  started_at: null,
  finished_at: null,
  dataset_url: null,
  current_resource: null,
  resources_total: 0,
  resources_done: 0,
  rows_seen: 0,
  rows_inserted: 0,
  errors: [],
  logs: [],
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const officialDatasetUrl =
  process.env.NEXT_PUBLIC_DEFAULT_DATASET_URL ??
  "https://dadosabertos.inss.gov.br/pt_BR/dataset/comunicacoes-de-acidente-de-trabalho-cat-plano-de-dados-abertos-jun-2023-a-jun-2025";

export function RobotDashboard() {
  const [snapshot, setSnapshot] = useState<JobSnapshot>(initialSnapshot);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = useMemo(() => {
    if (!snapshot.resources_total) {
      return 0;
    }
    return Math.round((snapshot.resources_done / snapshot.resources_total) * 100);
  }, [snapshot.resources_done, snapshot.resources_total]);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/api/jobs/status`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Não foi possível consultar o status do robô.");
    }
    setSnapshot(await response.json());
  }, []);

  useEffect(() => {
    refreshStatus().catch(() => {
      setMessage("API ainda não respondeu. Verifique se o backend está rodando.");
    });

    const intervalId = window.setInterval(() => {
      refreshStatus().catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [refreshStatus]);

  async function startRobot() {
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/jobs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Falha ao iniciar o robô.");
      }

      setSnapshot(data);
      setMessage("Robô iniciado com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isRunning = snapshot.status === "running";
  const lastLog = snapshot.logs.length ? snapshot.logs[snapshot.logs.length - 1] : "Nenhuma atividade registrada.";

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>SENTINELA</strong>
            <small>Inteligência de dados CAT</small>
          </div>
        </div>
        <span className={`status-pill status-${snapshot.status}`}>
          <span />
          {statusLabel(snapshot.status)}
        </span>
      </header>

      <section className="hero-panel">
        <div className="hero-content">
          <p className="eyebrow">Robô de captura CAT</p>
          <h1>Capture, processe e monitore os dados do INSS em um só painel.</h1>
          <p>
            O robô acessa o dataset oficial CAT do portal CKAN do INSS, baixa todos os recursos
            CSV, XLS, XLSX ou ZIP da lista e grava tudo no MongoDB local <strong>sentinela</strong>.
          </p>
          <div className="hero-chips" aria-label="Recursos do robô">
            <span>CKAN</span>
            <span>ZIP automático</span>
            <span>MongoDB local</span>
            <span>Upsert sem duplicar</span>
          </div>
        </div>

        <aside className="live-card">
          <span className="live-label">Última atividade</span>
          <strong>{lastLog}</strong>
          <p>{statusDescription(snapshot.status)}</p>
        </aside>
      </section>

      <section className="workspace-grid">
        <section className="card control-panel">
          <div className="section-heading">
            <span>Comando</span>
            <h2>Importação automática</h2>
            <p>Sem preenchimento manual. O robô sempre usa o dataset oficial CAT do INSS.</p>
          </div>

          <div className="target-card">
            <span>Dataset fixo</span>
            <strong>Comunicações de Acidente de Trabalho – CAT</strong>
            <p>{officialDatasetUrl}</p>
          </div>

          <button className="primary-action" disabled={isSubmitting || isRunning} type="button" onClick={startRobot}>
            {isRunning ? "Importação em andamento" : "Iniciar robô"}
          </button>

          {message ? <p className="message">{message}</p> : null}
        </section>

        <div className="monitor-column">
          <section className="metric-grid">
            <Metric label="Recursos" value={`${snapshot.resources_done}/${snapshot.resources_total}`} />
            <Metric label="Linhas lidas" value={snapshot.rows_seen.toLocaleString("pt-BR")} />
            <Metric label="Novas linhas" value={snapshot.rows_inserted.toLocaleString("pt-BR")} />
            <Metric label="Progresso" value={`${progress}%`} />
          </section>

          <section className="card execution-card">
            <div className="section-heading inline">
              <div>
                <span>Execução</span>
                <h2>Monitoramento</h2>
              </div>
              <strong>{progress}%</strong>
            </div>

            <div className="progress-track" aria-label={`Progresso ${progress}%`}>
              <div style={{ width: `${progress}%` }} />
            </div>

            <dl className="run-details">
              <div>
                <dt>Recurso atual</dt>
                <dd>{snapshot.current_resource ?? "Nenhum recurso em processamento."}</dd>
              </div>
              <div>
                <dt>Início</dt>
                <dd>{formatDate(snapshot.started_at)}</dd>
              </div>
              <div>
                <dt>Fim</dt>
                <dd>{formatDate(snapshot.finished_at)}</dd>
              </div>
              <div>
                <dt>Dataset</dt>
                <dd>{snapshot.dataset_url ?? "Aguardando execução."}</dd>
              </div>
            </dl>
          </section>
        </div>
      </section>

      <section className="insight-grid">
        <section className="card logs-panel">
          <div className="section-heading inline">
            <div>
              <span>Timeline</span>
              <h2>Atividade do robô</h2>
            </div>
            <small>{snapshot.logs.length} eventos</small>
          </div>

          <div className="timeline">
            {snapshot.logs.length ? (
              snapshot.logs.map((log, index) => (
                <p key={`${log}-${index}`}>
                  <span />
                  {log}
                </p>
              ))
            ) : (
              <p>
                <span />
                Aguardando início do robô.
              </p>
            )}
          </div>
        </section>

        <aside className="card checklist-card">
          <div className="section-heading">
            <span>Fluxo</span>
            <h2>O que acontece</h2>
          </div>
          <ol>
            <li>Apaga os dados antigos da coleção local antes de cada execução.</li>
            <li>Coleta todos os recursos da lista oficial do dataset CAT do INSS.</li>
            <li>Baixa em arquivo temporário, importa no MongoDB e remove o arquivo baixado.</li>
          </ol>
          {snapshot.errors.length ? (
            <div className="error-list">
              <strong>Erros encontrados</strong>
              {snapshot.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : (
            <p className="quiet">Nenhum erro registrado até agora.</p>
          )}
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="card metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function statusLabel(status: JobStatus) {
  const labels: Record<JobStatus, string> = {
    idle: "Aguardando",
    running: "Executando",
    completed: "Concluído",
    failed: "Falhou",
  };

  return labels[status];
}

function statusDescription(status: JobStatus) {
  const descriptions: Record<JobStatus, string> = {
    idle: "Pronto para iniciar uma nova importação.",
    running: "Coletando documentos e gravando no banco local.",
    completed: "Importação concluída. Você pode executar novamente sem duplicar linhas.",
    failed: "A importação encontrou uma falha. Veja os detalhes nos logs.",
  };

  return descriptions[status];
}

function formatDate(value: string | null) {
  if (!value) {
    return "Ainda não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
