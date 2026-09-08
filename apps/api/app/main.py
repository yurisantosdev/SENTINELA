from threading import Thread

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.importer import CatImporter
from app.job_state import job_state
from app.models import JobSnapshot, StartJobRequest


settings = get_settings()

app = FastAPI(title="Sentinela API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/jobs/status", response_model=JobSnapshot)
def get_job_status() -> JobSnapshot:
    return job_state.snapshot()


@app.post("/api/jobs/start", response_model=JobSnapshot, status_code=status.HTTP_202_ACCEPTED)
def start_job(payload: StartJobRequest) -> JobSnapshot:
    if job_state.is_running():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma importação em andamento.",
        )

    dataset_url = str(payload.dataset_url or settings.sentinela_dataset_url).strip()
    if not dataset_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe a URL do dataset ou configure SENTINELA_DATASET_URL.",
        )

    importer = CatImporter(settings=settings, state=job_state)
    thread = Thread(
        target=importer.run,
        args=(dataset_url, payload.resource_ids),
        daemon=True,
    )
    thread.start()

    return job_state.snapshot()
