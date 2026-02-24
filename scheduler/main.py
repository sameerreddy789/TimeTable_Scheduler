from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any
from models import SolveRequest, SolveResponse, SolutionOption
from solver import solve_timetable, generate_infeasibility_report

app = FastAPI(title="Scheduler Microservice")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
def solve(request: SolveRequest) -> SolveResponse:
    """
    Run CP-SAT solver with multiple random seeds to generate a pool of 3–5 timetable options.
    All options satisfy hard constraints. Returns solution pool or infeasibility report.
    """
    num_solutions = max(3, min(5, request.num_solutions))
    seeds = [42, 137, 271, 512, 999][:num_solutions]

    options: list[SolutionOption] = []
    for seed in seeds:
        result = solve_timetable(request, seed)
        if result is not None:
            options.append(result)

    if not options:
        report = generate_infeasibility_report(request)
        return SolveResponse(
            job_id=request.job_id,
            correlation_id=request.correlation_id,
            status='infeasible',
            options=[],
            infeasibility_report=report,
        )

    return SolveResponse(
        job_id=request.job_id,
        correlation_id=request.correlation_id,
        status='success',
        options=options,
        infeasibility_report=None,
    )
