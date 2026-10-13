"""Public API."""
from fastapi import APIRouter, HTTPException

from ..db import query, query_one
from .schemas import HealthReport, SourceInfo

router = APIRouter()


@router.get("/health", response_model=HealthReport)
def health() -> HealthReport:
    try:
        counts = query_one(
            """
            SELECT (SELECT COUNT(*) FROM region)      AS regions,
                   (SELECT COUNT(*) FROM indicator)   AS indicators,
                   (SELECT COUNT(*) FROM observation) AS observations
            """
        )
        srcs = query("SELECT * FROM source ORDER BY aspect, id")
        return HealthReport(
            status="ok",
            database="connected",
            regions=counts["regions"],
            indicators=counts["indicators"],
            observations=counts["observations"],
            sources=[SourceInfo(**s) for s in srcs],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"database tidak siap: {exc}") from exc
