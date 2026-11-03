"""Configuração central. Tudo é local; o servidor só escuta em loopback."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Loopback fixo. Não há opção para 0.0.0.0 — acesso remoto exige solução
# explícita e segura configurada fora desta instalação.
HOST = "127.0.0.1"
PORT = 8765
# Porta alternativa só em loopback (ex.: 8766 quando 8765 está ocupada); host nunca muda.
try:
    RUN_PORT = int(os.environ.get("VRS_PORT", PORT))
except ValueError:
    RUN_PORT = PORT
ALLOWED_ORIGINS = {f"http://{HOST}:{p}" for p in {PORT, RUN_PORT}} | {f"http://localhost:{p}" for p in {PORT, RUN_PORT}}


def _load_dotenv(path: Path) -> None:
    """Carrega .env simples sem sobrescrever o ambiente e sem imprimir valores."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(ROOT / ".env")


def _int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    root: Path
    data: Path
    threads: int
    render_concurrency: int
    frontend_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "frontend_dir", self.root / "frontend")

    # --- diretórios derivados -------------------------------------------
    @property
    def projects(self) -> Path:
        return self.data / "projects"

    @property
    def inputs(self) -> Path:
        return self.data / "inputs"

    @property
    def outputs(self) -> Path:
        return self.data / "outputs"

    @property
    def library(self) -> Path:
        return self.data / "library"

    @property
    def cache(self) -> Path:
        return self.data / "cache"

    @property
    def db_path(self) -> Path:
        return self.data / "vrs.sqlite3"

    @property
    def tools(self) -> Path:
        return self.root / ".tools"

    @property
    def voices_dir(self) -> Path:
        return self.tools / "voices"

    @property
    def asr_dir(self) -> Path:
        return self.tools / "asr"

    def ensure(self) -> "Settings":
        for p in (self.projects, self.inputs, self.outputs, self.library, self.cache):
            p.mkdir(parents=True, exist_ok=True)
        return self


def load_settings() -> Settings:
    data = Path(os.environ.get("VRS_DATA_DIR", ROOT / "data")).expanduser().resolve()
    return Settings(
        root=ROOT,
        data=data,
        threads=_int_env("VRS_THREADS", 2),
        render_concurrency=_int_env("VRS_RENDER_CONCURRENCY", 1),
    ).ensure()


_settings: Settings | None = None


def settings() -> Settings:
    global _settings
    if _settings is None or str(_settings.data) != str(
        Path(os.environ.get("VRS_DATA_DIR", ROOT / "data")).expanduser().resolve()
    ):
        _settings = load_settings()
    return _settings


def limit_threads(n: int | None = None) -> None:
    """Limita threads de bibliotecas numéricas (CPU/RAM modestas)."""
    value = str(n or settings().threads)
    for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ.setdefault(var, value)
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
