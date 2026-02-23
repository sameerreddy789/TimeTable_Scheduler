from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any

app = FastAPI(title="Scheduler Microservice")


class SolveRequest(BaseModel):
    job_id: str
    correlation_id: str
    term_id: str
    department_id: str
    rooms: list[Any] = []
    faculty: list[Any] = []
    subjects: list[Any] = []
    batches: list[Any] = []
    timeslots: list[Any] = []
    blackout_dates: list[Any] = []
    soft_weights: dict[str, Any] = {}
    timeout_seconds: int = 30


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve")
def solve(_request: SolveRequest) -> dict[str, str]:
    return {"status": "not_implemented"}
