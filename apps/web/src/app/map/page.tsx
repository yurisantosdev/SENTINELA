import Link from "next/link";
import { MapPage } from "@sentinela/map";

export default function Map() {
  return (
    <div className="dashboard-shell map-wide">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>SENTINELA</strong>
            <small>Mapa de acidentes CAT</small>
          </div>
        </div>
        <Link className="ghost-action" href="/">
          Voltar ao painel
        </Link>
      </header>

      <section className="card map-stage">
        <MapPage apiBaseUrl={process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"} />
      </section>
    </div>
  );
}
