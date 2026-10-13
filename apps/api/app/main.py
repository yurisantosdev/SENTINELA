from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.cat_map import municipalities_for_uf, summarize_ufs, warmup_map_cache
from app.config import get_settings
from app.importer import CatImporter
from app.job_state import job_state
from app.models import CatMapSummary, JobSnapshot, MunicipalityMapResponse, StartJobRequest


settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    thread = Thread(target=warmup_map_cache, daemon=True, name="sentinela-map-warmup")
    thread.start()
    yield


app = FastAPI(title="Sentinela API", version="0.1.0", lifespan=lifespan)
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


@app.get("/api/cat/map/ufs", response_model=CatMapSummary)
def get_cat_map_ufs() -> CatMapSummary:
    try:
        return CatMapSummary.model_validate(summarize_ufs())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível agregar as CATs no MongoDB.",
        ) from exc


@app.get("/api/cat/map/ufs/{sigla}/municipalities", response_model=MunicipalityMapResponse)
def get_cat_map_municipalities(sigla: str) -> MunicipalityMapResponse:
    try:
        payload = municipalities_for_uf(sigla)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="UF não encontrada.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível agregar as CATs no MongoDB.",
        ) from exc

    return MunicipalityMapResponse.model_validate(payload)
