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


class RiskFactor(BaseModel):
    code: str
    label: str
    coefficient: float
    odds_ratio: float
    effect: Literal["aumenta", "reduz"]


class RiskModelResponse(BaseModel):
    status: Literal["ready", "insufficient", "unavailable"]
    algorithm: str
    family: str
    question: str
    message: str
    sample_size: int = 0
    deaths: int = 0
    death_rate: Optional[float] = None
    holdout_size: int = 0
    auc: Optional[float] = None
    factors: list[RiskFactor] = Field(default_factory=list)
    reference: str = ""
    trained_at: Optional[datetime] = None


class PatternPoint(BaseModel):
    month: str
    label: str
    total: int
    typical: int
    commute: int
    disease: int


class PatternHeatCell(BaseModel):
    month: str
    label: str
    days: list[int]


class PatternActivity(BaseModel):
    label: str
    total: int
    share: float


class PatternRegion(BaseModel):
    name: str
    total: int
    rate: Optional[float] = None
    color: str


class PatternMunicipality(BaseModel):
    name: str
    uf: str
    total: int
    rate: float


class PatternAnomaly(BaseModel):
    sector: str
    label: str
    kind: Literal["maquina", "setor"]
    change: float
    recent: int
    previous: int
    sentence: str


class PatternAssociation(BaseModel):
    agent: str
    injury: str
    count: int
    lift: float


class PatternState(BaseModel):
    sigla: str
    nome: str
    rate: float


class PatternCluster(BaseModel):
    name: str
    summary: str
    states: list[PatternState]


class PatternReportResponse(BaseModel):
    status: Literal["ready", "insufficient", "unavailable"]
    message: str
    headline: str
    headline_change: Optional[float] = None
    period_label: str = ""
    stability: Optional[int] = None
    stability_note: str = ""
    series: list[PatternPoint] = Field(default_factory=list)
    heatmap: list[PatternHeatCell] = Field(default_factory=list)
    peak: str = ""
    activities: list[PatternActivity] = Field(default_factory=list)
    regions: list[PatternRegion] = Field(default_factory=list)
    municipalities: list[PatternMunicipality] = Field(default_factory=list)
    anomalies: list[PatternAnomaly] = Field(default_factory=list)
    associations: list[PatternAssociation] = Field(default_factory=list)
    clusters: list[PatternCluster] = Field(default_factory=list)
    trained_at: Optional[datetime] = None


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class AskIndicator(BaseModel):
    label: str
    value: str


class AskRow(BaseModel):
    label: str
    value: str = ""


class AskResponse(BaseModel):
    answer: str
    chart: Literal["bar", "line", "none"]
    indicators: list[AskIndicator] = Field(default_factory=list)
    rows: list[AskRow] = Field(default_factory=list)
