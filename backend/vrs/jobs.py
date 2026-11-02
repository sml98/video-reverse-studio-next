"""Fila persistente (SQLite) com um worker por vez (lease com heartbeat).

Estados: queued → running → done | failed | cancelled ; awaiting_agent quando a
próxima etapa depende do agente externo (MCP/CLI). Jobs continuam sem navegador.
Ao reiniciar: jobs locais idempotentes 'running' voltam para a fila (com cache e
checkpoints); jobs com chamadas externas são marcados como interrompidos e NÃO
são repetidos automaticamente.
"""
from __future__ import annotations

import os
import socket
import threading
import time
import traceback
from typing import Any, Callable

from . import db
from .util import VRSError, new_id, sanitize

HEAVY = {"render", "analyze", "examples", "voice_preview", "import_link", "create_pipeline"}
EXTERNAL = {"agent_run", "provider_generate"}
LEASE_S = 30
_handlers: dict[str, Callable[["JobCtx"], dict[str, Any]]] = {}


def handler(kind: str):
    def deco(fn):
        _handlers[kind] = fn
        return fn

    return deco


class Cancelled(Exception):
    pass


class JobCtx:
    def __init__(self, row: dict[str, Any]):
        self.id = row["id"]
        self.project_id = row["project_id"]
        self.kind = row["kind"]
        self.params = row.get("params") or {}
        self.checkpoints = row.get("checkpoints") or {}

    def progress(self, step: str, progress: float) -> None:
        db.conn().execute("UPDATE jobs SET step = ?, progress = ?, updated_at = ? WHERE id = ?", (step[:200], max(0.0, min(1.0, float(progress))), db.now(), self.id))
        if self.cancelled():
            raise Cancelled()

    def checkpoint(self, name: str, value: Any) -> None:
        self.checkpoints[name] = value
        db.conn().execute("UPDATE jobs SET checkpoints_json = ?, updated_at = ? WHERE id = ?", (db.dumps(self.checkpoints), db.now(), self.id))

    def cancelled(self) -> bool:
        r = db.conn().execute("SELECT state FROM jobs WHERE id = ?", (self.id,)).fetchone()
        return bool(r and r["state"] == "cancelled")


def _ensure_handlers() -> None:
    if not _handlers:
        from . import workflow  # noqa: F401  (registra os handlers)


def enqueue(kind: str, project_id: str | None = None, params: dict[str, Any] | None = None, *, state: str = "queued") -> dict[str, Any]:
    _ensure_handlers()
    if kind not in _handlers and state == "queued":
        raise VRSError(f"Tipo de job desconhecido: {kind}")
    jid = new_id("j")
    t = db.now()
    db.conn().execute(
        "INSERT INTO jobs(id, project_id, kind, state, params_json, resumable, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)",
        (jid, project_id, kind, state, db.dumps(params or {}), 0 if kind in EXTERNAL else 1, t, t),
    )
    return get(jid)


def get(jid: str) -> dict[str, Any]:
    r = db.row_to_dict(db.conn().execute("SELECT * FROM jobs WHERE id = ?", (jid,)).fetchone())
    if not r:
        raise VRSError("Job não encontrado.", code="not_found", status=404)
    return r


def list_jobs(project_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    if project_id:
        rows = db.conn().execute("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?", (project_id, limit)).fetchall()
    else:
        rows = db.conn().execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [db.row_to_dict(r) for r in rows]  # type: ignore[misc]


def cancel(jid: str) -> dict[str, Any]:
    db.conn().execute("UPDATE jobs SET state = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ? AND state IN ('queued','running','awaiting_agent')", (db.now(), db.now(), jid))
    return get(jid)


def set_awaiting_agent(project_id: str, step: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Registra honestamente que a fila aguarda o agente externo (sem iniciar outro modelo)."""
    existing = db.conn().execute("SELECT id FROM jobs WHERE project_id = ? AND state = 'awaiting_agent'", (project_id,)).fetchone()
    if existing:
        db.conn().execute("UPDATE jobs SET step = ?, updated_at = ? WHERE id = ?", (step, db.now(), existing["id"]))
        return get(existing["id"])
    j = enqueue("agent_direction", project_id, params or {}, state="awaiting_agent")
    db.conn().execute("UPDATE jobs SET step = ? WHERE id = ?", (step, j["id"]))
    return get(j["id"])


def resolve_awaiting(project_id: str, result: dict[str, Any] | None = None) -> None:
    db.conn().execute("UPDATE jobs SET state = 'done', progress = 1, result_json = ?, finished_at = ?, updated_at = ? WHERE project_id = ? AND state = 'awaiting_agent'", (db.dumps(result or {}), db.now(), db.now(), project_id))


def recover_interrupted() -> dict[str, int]:
    """Chamado na inicialização do worker."""
    c = db.conn()
    t = db.now()
    requeued = c.execute("UPDATE jobs SET state = 'queued', step = 'retomando após reinício', attempts = attempts + 1, updated_at = ? WHERE state = 'running' AND resumable = 1 AND attempts < 3", (t,)).rowcount
    failed = c.execute("UPDATE jobs SET state = 'failed', error = 'Interrompido por reinício; não repetido automaticamente (operação externa ou tentativas esgotadas).', finished_at = ?, updated_at = ? WHERE state = 'running'", (t, t)).rowcount
    return {"requeued": requeued, "failed": failed}


# ---------------------------------------------------------------------------
# Worker com lease
# ---------------------------------------------------------------------------
class Worker:
    def __init__(self, name: str = "main"):
        self.name = name
        self.owner = f"{socket.gethostname()}:{os.getpid()}:{threading.get_ident()}"
        self._stop = threading.Event()
        self.thread: threading.Thread | None = None

    def acquire(self) -> bool:
        with db.tx() as c:
            r = c.execute("SELECT owner, heartbeat FROM worker_lease WHERE name = ?", (self.name,)).fetchone()
            now = db.now()
            if r and r["owner"] != self.owner and now - r["heartbeat"] < LEASE_S:
                return False
            c.execute("INSERT INTO worker_lease(name, owner, heartbeat) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, heartbeat = excluded.heartbeat", (self.name, self.owner, now))
            return True

    def heartbeat(self) -> None:
        db.conn().execute("UPDATE worker_lease SET heartbeat = ? WHERE name = ? AND owner = ?", (db.now(), self.name, self.owner))

    def release(self) -> None:
        db.conn().execute("DELETE FROM worker_lease WHERE name = ? AND owner = ?", (self.name, self.owner))

    def _claim(self) -> dict[str, Any] | None:
        with db.tx() as c:
            r = c.execute("SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at LIMIT 1").fetchone()
            if not r:
                return None
            c.execute("UPDATE jobs SET state = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?", (db.now(), db.now(), r["id"]))
        return get(r["id"])

    def run_one(self) -> bool:
        _ensure_handlers()
        row = self._claim()
        if not row:
            return False
        ctx = JobCtx(row)
        hb_stop = threading.Event()

        def hb():
            while not hb_stop.wait(5):
                self.heartbeat()

        t = threading.Thread(target=hb, daemon=True)
        t.start()
        try:
            fn = _handlers.get(row["kind"])
            if not fn:
                raise VRSError(f"Sem handler para {row['kind']}")
            result = fn(ctx) or {}
            if not ctx.cancelled():
                db.conn().execute("UPDATE jobs SET state = 'done', progress = 1, step = 'concluído', result_json = ?, finished_at = ?, updated_at = ? WHERE id = ?", (db.dumps(result), db.now(), db.now(), ctx.id))
        except Cancelled:
            pass
        except VRSError as e:
            db.conn().execute("UPDATE jobs SET state = 'failed', error = ?, finished_at = ?, updated_at = ? WHERE id = ?", (sanitize(str(e)), db.now(), db.now(), ctx.id))
        except Exception as e:  # erro inesperado: mensagem sanitizada + traço curto
            tb = traceback.format_exc(limit=4)
            db.conn().execute("UPDATE jobs SET state = 'failed', error = ?, finished_at = ?, updated_at = ? WHERE id = ?", (sanitize(f"{type(e).__name__}: {e}\n{tb}", 1500), db.now(), db.now(), ctx.id))
        finally:
            hb_stop.set()
        return True

    def loop(self) -> None:
        while not self._stop.is_set():
            if not self.acquire():
                self._stop.wait(5)
                continue
            self.heartbeat()
            if not self.run_one():
                self._stop.wait(1.0)
        self.release()

    def start(self) -> "Worker":
        def boot():
            while not self._stop.is_set() and not self.acquire():
                self._stop.wait(5)
            if self._stop.is_set():
                return
            recover_interrupted()
            self.loop()

        self.thread = threading.Thread(target=boot, name="vrs-worker", daemon=True)
        self.thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()


def worker_alive() -> bool:
    r = db.conn().execute("SELECT heartbeat FROM worker_lease WHERE name = 'main'").fetchone()
    return bool(r and db.now() - r["heartbeat"] < LEASE_S)


def drain(timeout: float = 3600) -> int:
    """Executa a fila no processo atual (CLI/testes) até esvaziar."""
    w = Worker()
    if not w.acquire():
        raise VRSError("Outro worker está ativo (serviço local). Os jobs serão processados por ele.", code="worker_busy")
    recover_interrupted()
    n = 0
    t0 = time.time()
    try:
        while time.time() - t0 < timeout and w.run_one():
            n += 1
            w.heartbeat()
    finally:
        w.release()
    return n
