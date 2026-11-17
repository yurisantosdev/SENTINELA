"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type AskChart = "bar" | "line" | "none";

type AskResult = {
  answer: string;
  chart: AskChart;
  indicators: { label: string; value: string }[];
  rows: { label: string; value: string }[];
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  result?: AskResult;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const OPEN_MS = 280;
const CLOSE_MS = 220;
const CLEAR_MS = 360;

const SUGGESTIONS = [
  "Quantos acidentes aconteceram em Santa Catarina em 2025?",
  "Qual município possui mais acidentes fatais?",
  "Quais são os CNAEs com maior incidência?",
  "Qual foi a evolução dos acidentes de trajeto?",
  "Compare os acidentes de Chapecó com os de Florianópolis.",
  "Qual cidade de Santa Catarina tem a maior taxa?",
  "Compare Chapecó com Ita.",
  "Quais agentes causadores aparecem com maior frequência?",
];

type PanelPhase = "closed" | "opening" | "open" | "closing";

function motionMs(duration: number) {
  if (typeof window === "undefined") {
    return duration;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}

export function DataChat() {
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const panelOpen = phase !== "closed";
  const expanded = phase === "opening" || phase === "open";

  useEffect(() => {
    const log = logRef.current;
    if (!log) {
      return;
    }
    const userMessages = log.querySelectorAll("article.chat-user");
    const lastUser = userMessages[userMessages.length - 1];
    if (lastUser instanceof HTMLElement) {
      const top = lastUser.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop;
      log.scrollTo({ top, behavior: "auto" });
      return;
    }
    log.scrollTop = log.scrollHeight;
  }, [messages, pending, panelOpen]);

  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") {
      return;
    }
    const timer = window.setTimeout(() => {
      setPhase(phase === "opening" ? "open" : "closed");
    }, motionMs(phase === "opening" ? OPEN_MS : CLOSE_MS));
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!clearing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setMessages([]);
      setClearing(false);
    }, motionMs(CLEAR_MS));
    return () => window.clearTimeout(timer);
  }, [clearing]);

  function togglePanel() {
    setPhase((current) => (current === "closed" || current === "closing" ? "opening" : "closing"));
  }

  async function send(question: string) {
    const text = question.trim();
    if (!text || pending || clearing) {
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const userMessage: ChatMessage = { id: Date.now(), role: "user", text };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/cat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await response.json();
      if (requestRef.current !== requestId) {
        return;
      }
      if (!response.ok) {
        throw new Error(data.detail ?? "Não foi possível consultar as CATs.");
      }
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", text: data.answer, result: data },
      ]);
    } catch (error) {
      if (requestRef.current !== requestId) {
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: error instanceof Error ? error.message : "Não foi possível consultar as CATs.",
        },
      ]);
    } finally {
      if (requestRef.current === requestId) {
        setPending(false);
      }
    }
  }

  function clearChat() {
    if (messages.length === 0 || clearing) {
      return;
    }
    requestRef.current += 1;
    setDraft("");
    setPending(false);
    setClearing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(draft).catch(() => undefined);
  }

  return (
    <div className="chat-dock">
      {panelOpen ? (
        <section
          className={`chat-panel${phase === "opening" ? " is-opening" : ""}${phase === "closing" ? " is-closing" : ""}`}
          role="dialog"
          aria-label="Conversa com os dados CAT"
        >
          <header>
            <div>
              <span>Sentinela</span>
              <strong>Converse com os dados</strong>
            </div>
            <div className="chat-actions">
              <button type="button" onClick={clearChat} disabled={messages.length === 0 || clearing}>
                Limpar
              </button>
              <button type="button" onClick={() => setPhase("closing")} aria-label="Fechar conversa">
                Fechar
              </button>
            </div>
          </header>
          <div className={`chat-log${clearing ? " is-clearing" : ""}`} ref={logRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p>Pergunte em português. A consulta roda na base local, sem serviço pago.</p>
                <div>
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <article
                  key={message.id}
                  className={`chat-message chat-${message.role}`}
                  style={clearing ? { animationDelay: `${Math.min(index, 8) * 24}ms` } : undefined}
                >
                  <p>{message.text}</p>
                  {message.result ? <ResultView result={message.result} onSuggest={send} /> : null}
                </article>
              ))
            )}
            {pending ? <p className="chat-pending">Consultando as CATs…</p> : null}
          </div>
          <form onSubmit={submit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Pergunte sobre as CATs"
              aria-label="Pergunta sobre as CATs"
              disabled={pending}
            />
            <button type="submit" disabled={pending || !draft.trim()}>
              Enviar
            </button>
          </form>
        </section>
      ) : null}
      <button
        className="chat-launcher"
        type="button"
        aria-expanded={panelOpen}
        aria-label={panelOpen ? "Fechar chat" : "Perguntar aos dados"}
        onClick={togglePanel}
      >
        {expanded ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6.5h14A1.5 1.5 0 0 1 20.5 8v7a1.5 1.5 0 0 1-1.5 1.5H9.2L5 19.8V16.5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function ResultView({ result, onSuggest }: { result: AskResult; onSuggest: (question: string) => void }) {
  const numeric = result.rows.filter((row) => row.value);
  const suggestions = result.rows.filter((row) => !row.value);
  return (
    <div className="chat-result">
      {result.indicators.length ? (
        <div className="chat-indicators">
          {result.indicators.map((item) => (
            <span key={`${item.label}-${item.value}`}>
              <small>{item.label}</small>
              {item.value}
            </span>
          ))}
        </div>
      ) : null}
      {result.chart !== "none" && numeric.length ? <ResultChart chart={result.chart} rows={numeric} /> : null}
      {numeric.length ? (
        <table>
          <tbody>
            {numeric.map((row) => (
              <tr key={`${row.label}-${row.value}`}>
                <th>{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {suggestions.length ? (
        <div className="chat-suggestions">
          {suggestions.map((row) => (
            <button key={row.label} type="button" onClick={() => onSuggest(row.label)}>
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultChart({ chart, rows }: { chart: AskChart; rows: { label: string; value: string }[] }) {
  const counts = rows.map((row) => Number(row.value.replace(/\./g, "").replace(",", "."))).map((value) => (Number.isFinite(value) ? value : 0));
  const max = Math.max(1, ...counts);
  if (chart === "line") {
    const step = rows.length === 1 ? 0 : 240 / (rows.length - 1);
    const path = counts
      .map((count, index) => `${index === 0 ? "M" : "L"} ${8 + index * step} ${72 - (count / max) * 58}`)
      .join(" ");
    return (
      <svg className="chat-chart" viewBox="0 0 256 88" role="img" aria-label="Série da resposta">
        <path d={path} />
      </svg>
    );
  }
  return (
    <div className="chat-bars" aria-hidden="true">
      {rows.slice(0, 6).map((row, index) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <b style={{ width: `${Math.max(8, ((counts[index] ?? 0) / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}
