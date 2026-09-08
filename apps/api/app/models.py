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
