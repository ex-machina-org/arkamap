"""First-boot ingest: fill an empty database, then exit.

Run by the `seed` service in docker compose. Safe to re-run — every step
upserts, and region boundaries are only re-downloaded when the table is empty.
"""
import logging
import sys

from app.db import apply_schema, init_pool, query_one
from app.ingest.runner import run_all

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
# httpx logs every URL at INFO; some carry keys (FIRMS area API) or signed tokens
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("seed")


def main() -> int:
    init_pool()
    apply_schema()

    existing = query_one("SELECT COUNT(*) AS c FROM region")["c"]
    log.info("wilayah yang sudah ada: %d", existing)

    report = run_all(with_regions=(existing == 0), include_slow=False)
    log.info("hasil ingest: %s", report)

    counts = query_one(
        """
        SELECT (SELECT COUNT(*) FROM region)      AS regions,
               (SELECT COUNT(*) FROM indicator)   AS indicators,
               (SELECT COUNT(*) FROM observation) AS observations
        """
    )
    log.info(
        "siap: %d wilayah, %d indikator, %d observasi",
        counts["regions"], counts["indicators"], counts["observations"],
    )

    if not counts["regions"] or not counts["indicators"]:
        log.error("database masih kosong setelah ingest")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
