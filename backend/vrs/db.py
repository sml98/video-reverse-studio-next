"""Armazenamento SQLite único (projetos, jobs, recursos + FTS, cache, recibos)."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import settings

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt-BR',
  aspect TEXT NOT NULL DEFAULT 'landscape',
  target_seconds REAL NOT NULL DEFAULT 30,
  idea TEXT NOT NULL DEFAULT '',
  niche_id TEXT NOT NULL DEFAULT '',
  reference_json TEXT NOT NULL DEFAULT '{}',
  options_json TEXT NOT NULL DEFAULT '{}',
  stage TEXT NOT NULL DEFAULT 'created',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  is_example INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  at REAL NOT NULL,
  kind TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_history_project ON project_history(project_id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT '',
  progress REAL NOT NULL DEFAULT 0,
  params_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  checkpoints_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  resumable INTEGER NOT NULL DEFAULT 1,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL,
  started_at REAL,
  finished_at REAL
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);

CREATE TABLE IF NOT EXISTS worker_lease (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  heartbeat REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  styles TEXT NOT NULL DEFAULT '',
  niches TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  pack TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  license TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL DEFAULT '',
  capability TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
  id UNINDEXED, kind, name, tags, styles, niches, capability, tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS catalog_fts_src (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT ''
);
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
  id UNINDEXED, kind, title, summary, tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS cache_entries (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at REAL NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  at REAL NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS provider_receipts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  project_id TEXT NOT NULL,
  scene_id TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_hash ON provider_receipts(request_hash);
"""

_local = threading.local()
_init_lock = threading.Lock()
_initialized: set[str] = set()


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path), timeout=30, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def conn() -> sqlite3.Connection:
    path = settings().db_path
    key = str(path)
    cache: dict[str, sqlite3.Connection] = getattr(_local, "conns", None) or {}
    _local.conns = cache
    c = cache.get(key)
    if c is None:
        c = _connect(path)
        cache[key] = c
    if key not in _initialized:
        with _init_lock:
            if key not in _initialized:
                c.executescript(SCHEMA)
                c.execute(
                    "INSERT OR IGNORE INTO meta(key, value) VALUES('schema_version', ?)",
                    (str(SCHEMA_VERSION),),
                )
                _initialized.add(key)
    return c


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    c = conn()
    c.execute("BEGIN IMMEDIATE")
    try:
        yield c
        c.execute("COMMIT")
    except BaseException:
        c.execute("ROLLBACK")
        raise


def now() -> float:
    return time.time()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out: dict[str, Any] = {}
    for k in row.keys():
        v = row[k]
        if k.endswith("_json"):
            try:
                out[k[:-5]] = json.loads(v) if v else {}
            except json.JSONDecodeError:
                out[k[:-5]] = {}
        else:
            out[k] = v
    return out


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def record_metric(name: str, value: float, project_id: str | None = None, **detail: Any) -> None:
    conn().execute(
        "INSERT INTO metrics(project_id, at, name, value, detail_json) VALUES(?,?,?,?,?)",
        (project_id, now(), name, float(value), dumps(detail)),
    )


def reset_for_tests() -> None:
    """Fecha conexões (usado por testes com VRS_DATA_DIR isolado)."""
    cache = getattr(_local, "conns", None) or {}
    for c in cache.values():
        try:
            c.close()
        except Exception:
            pass
    _local.conns = {}
    _initialized.clear()
