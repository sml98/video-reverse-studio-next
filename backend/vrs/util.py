"""Utilidades: hashes, caminhos seguros, subprocessos e sanitização de erros."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any, Iterable, Sequence

from .config import settings


class VRSError(Exception):
    """Erro de domínio com mensagem segura para mostrar ao usuário."""

    def __init__(self, message: str, *, code: str = "error", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def sha256_text(*parts: Any) -> str:
    h = hashlib.sha256()
    for p in parts:
        if not isinstance(p, (str, bytes)):
            p = json.dumps(p, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        h.update(p.encode("utf-8") if isinstance(p, str) else p)
        h.update(b"\x00")
    return h.hexdigest()


def safe_join(base: Path, rel: str | os.PathLike[str]) -> Path:
    """Resolve `rel` dentro de `base`; rejeita absolutos, `..` e symlinks externos."""
    rel_s = str(rel)
    if not rel_s or rel_s.startswith(("/", "\\")) or re.match(r"^[a-zA-Z]:", rel_s) or "\x00" in rel_s:
        raise VRSError("Caminho inválido: precisa ser relativo ao projeto.", code="bad_path")
    if any(part == ".." for part in Path(rel_s).parts):
        raise VRSError("Caminho inválido: '..' não é permitido.", code="bad_path")
    base_r = base.resolve()
    target = (base_r / rel_s).resolve()
    if target != base_r and base_r not in target.parents:
        raise VRSError("Caminho fora do projeto.", code="bad_path")
    return target


_SECRET_PATTERNS = [
    re.compile(r"(?i)bearer\s+[a-z0-9._\-]+"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password|passwd|authorization|bearer)\s*[:=]\s*(?:bearer\s+)?\S+"),
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"(?i)(?:key|token)=[A-Za-z0-9._\-]{8,}"),
]


def sanitize(text: str, limit: int = 1200) -> str:
    """Remove possíveis segredos e caminhos pessoais longos de mensagens de erro."""
    t = str(text or "")
    for pat in _SECRET_PATTERNS:
        t = pat.sub("[redigido]", t)
    for name, value in os.environ.items():
        if value and len(value) >= 12 and re.search(r"(?i)key|token|secret|pass", name):
            t = t.replace(value, "[redigido]")
    t = t.replace(str(Path.home()), "~")
    if len(t) > limit:
        t = t[: limit // 2] + " … " + t[-limit // 2 :]
    return t.strip()


def run(
    argv: Sequence[str],
    *,
    timeout: float = 600,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
    input_bytes: bytes | None = None,
) -> subprocess.CompletedProcess:
    """Executa um programa (sem shell) com timeout; erros saem sanitizados."""
    if not argv or not isinstance(argv[0], str):
        raise VRSError("Comando inválido.")
    full_env = os.environ.copy()
    full_env.setdefault("OMP_NUM_THREADS", str(settings().threads))
    if env:
        full_env.update(env)
    try:
        proc = subprocess.run(
            list(argv),
            cwd=str(cwd) if cwd else None,
            env=full_env,
            input=input_bytes,
            capture_output=True,
            timeout=timeout,
        )
    except FileNotFoundError as e:
        raise VRSError(f"Programa não encontrado: {argv[0]}", code="missing_tool") from e
    except subprocess.TimeoutExpired as e:
        raise VRSError(f"Tempo esgotado ({int(timeout)} s) em {Path(argv[0]).name}.", code="timeout") from e
    if check and proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace")[-2000:] or proc.stdout.decode("utf-8", "replace")[-2000:]
        raise VRSError(f"{Path(argv[0]).name} falhou: {sanitize(err)}", code="tool_failed")
    return proc


def which(name: str) -> str | None:
    return shutil.which(name)


def write_json(path: Path, data: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return path


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def chunks(seq: Iterable[Any], n: int) -> Iterable[list[Any]]:
    buf: list[Any] = []
    for x in seq:
        buf.append(x)
        if len(buf) == n:
            yield buf
            buf = []
    if buf:
        yield buf
