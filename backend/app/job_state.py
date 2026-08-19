from datetime import datetime, timezone
from threading import Lock

from app.models import JobSnapshot, JobStatus


class JobState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._snapshot = JobSnapshot(status="idle")

    def snapshot(self) -> JobSnapshot:
        with self._lock:
            return self._snapshot.model_copy(deep=True)

    def start(self, dataset_url: str) -> None:
        with self._lock:
            self._snapshot = JobSnapshot(
                status="running",
                started_at=datetime.now(timezone.utc),
                dataset_url=dataset_url,
                logs=["Robô iniciado."],
            )

    def set_resources_total(self, total: int) -> None:
        with self._lock:
            self._snapshot.resources_total = total

    def set_current_resource(self, name: str) -> None:
        with self._lock:
            self._snapshot.current_resource = name
            self._snapshot.logs.append(f"Processando recurso: {name}")
            self._trim_logs()

    def add_rows(self, seen: int, inserted: int) -> None:
        with self._lock:
            self._snapshot.rows_seen += seen
            self._snapshot.rows_inserted += inserted

    def complete_resource(self) -> None:
        with self._lock:
            self._snapshot.resources_done += 1

    def log(self, message: str) -> None:
        with self._lock:
            self._snapshot.logs.append(message)
            self._trim_logs()

    def add_error(self, message: str) -> None:
        with self._lock:
            self._snapshot.errors.append(message)
            self._snapshot.logs.append(f"Erro: {message}")
            self._trim_logs()

    def fail(self, message: str) -> None:
        with self._lock:
            self._snapshot.status = "failed"
            self._snapshot.finished_at = datetime.now(timezone.utc)
            self._snapshot.errors.append(message)
            self._snapshot.logs.append(f"Erro: {message}")
            self._trim_logs()

    def finish(self, status: JobStatus = "completed") -> None:
        with self._lock:
            self._snapshot.status = status
            self._snapshot.finished_at = datetime.now(timezone.utc)
            self._snapshot.current_resource = None
            self._snapshot.logs.append("Robô finalizado.")
            self._trim_logs()

    def is_running(self) -> bool:
        with self._lock:
            return self._snapshot.status == "running"

    def _trim_logs(self) -> None:
        self._snapshot.logs = self._snapshot.logs[-200:]


job_state = JobState()
