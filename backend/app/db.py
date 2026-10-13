"""Connection pool and the small helpers every query goes through."""
from contextlib import contextmanager
from pathlib import Path

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

from .config import DATABASE_URL

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=8, open=False, kwargs={"row_factory": dict_row})


def init_pool() -> None:
    pool.open()
    pool.wait(timeout=30)


def close_pool() -> None:
    pool.close()


@contextmanager
def conn():
    with pool.connection() as c:
        yield c


def query(sql: str, params: tuple | dict | None = None) -> list[dict]:
    with conn() as c, c.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql: str, params: tuple | dict | None = None) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple | dict | None = None) -> int:
    with conn() as c, c.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def apply_schema() -> None:
    """Idempotent: safe to run on every boot."""
    sql_dir = Path(__file__).resolve().parent.parent / "sql"
    for path in sorted(sql_dir.glob("*.sql")):
        with conn() as c, c.cursor() as cur:
            cur.execute(path.read_text())
