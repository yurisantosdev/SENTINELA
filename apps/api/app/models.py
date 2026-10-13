from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


JobStatus = Literal["idle", "running", "completed", "failed"]


class StartJobRequest(BaseModel):
    dataset_url: Optional[HttpUrl] = None
    resource_ids: list[str] = Field(default_factory=list)


class ResourceSummary(BaseModel):
    id: str
    name: str
    format: str
    url: str


class JobSnapshot(BaseModel):
    status: JobStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    dataset_url: Optional[str] = None
    current_resource: Optional[str] = None
    resources_total: int = 0
    resources_done: int = 0
    rows_seen: int = 0
    rows_inserted: int = 0
    errors: list[str] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)


class MapMetrics(BaseModel):
    total: int = 0
    deaths: int = 0
    typical: int = 0
    commute: int = 0
    disease: int = 0
    population: int = 0
    rate: Optional[float] = None


class UfMapStat(MapMetrics):
    sigla: str
    nome: str
    lat: float
    lng: float


class CatMapSummary(MapMetrics):
    unknown: int = 0
    ufs: list[UfMapStat] = Field(default_factory=list)


class MunicipalityMapPoint(MapMetrics):
    id: str
    ibge: str
    name: str
    uf: str
    lat: float
    lng: float


class MunicipalityMapResponse(BaseModel):
    uf: str
    nome: str
    total: int
    unlocated: int = 0
    points: list[MunicipalityMapPoint] = Field(default_factory=list)
