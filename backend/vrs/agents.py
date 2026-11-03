"""Adaptadores de agente intercambiáveis (somente quando escolhidos explicitamente).

- mcp: o agente atual conectado por MCP/CLI é o diretor; nada é iniciado aqui.
- claude: Claude Code CLI oficial (`claude -p`), se instalado/autenticado.
- codex: Codex CLI oficial, se instalado (argv configurável; não testado nesta máquina).
- generic: contrato argv/JSON com placeholders, sem shell.
- openai: endpoint compatível, só com VRS_OPENAI_CONSENT=1 (rede/custo explícitos).
Antigravity: use o servidor MCP do VRS (integrations/) ou um argv configurado (VRS_AGENT_ARGV).
Não há fallback silencioso entre adaptadores.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

from .contracts import Storyboard, json_schemas
from .util import VRSError, sanitize

TIMEOUT = float(os.environ.get("VRS_AGENT_TIMEOUT", "900"))
PLACEHOLDERS = {"{prompt_file}", "{schema_file}", "{output_file}", "{prompt_text}"}


def build_prompt(task: dict[str, Any]) -> str:
    return (
        "Você é o diretor do Video Reverse Studio. Responda SOMENTE com um objeto JSON válido "
        "no schema vrs.storyboard/1 (sem Markdown, sem comentários).\n"
        "Adapte o exemplo do modelo à ideia do usuário com conteúdo original. "
        "Use apenas preset_id e parâmetros conhecidos (veja example_storyboard). "
        "Narração curta; durações em segundos; liste fontes e incertezas.\n\n"
        f"TAREFA:\n{json.dumps(task, ensure_ascii=False)}\n"
    )


def parse_agent_json(text: str) -> dict[str, Any]:
    """Remove <think>…</think> e cercas Markdown; exige JSON completo e storyboard válido."""
    t = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S | re.I).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", t, flags=re.S)
    if fence:
        t = fence.group(1).strip()
    start = t.find("{")
    if start < 0:
        raise VRSError("O agente não retornou JSON.", code="agent_bad_output")
    depth, in_str, esc, end = 0, False, False, -1
    for i in range(start, len(t)):
        ch = t[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end < 0:
        raise VRSError("JSON do agente incompleto (truncado); nada foi aceito.", code="agent_incomplete")
    try:
        data = json.loads(t[start : end + 1])
    except json.JSONDecodeError as e:
        raise VRSError(f"JSON do agente inválido: {e.msg}", code="agent_bad_output") from e
    if "storyboard" in data and isinstance(data["storyboard"], dict):
        data = data["storyboard"]
    Storyboard.model_validate(data)
    return data


def _run_argv(argv: list[str], *, stdin: str | None, cancel: Callable[[], bool] | None, cwd: Path) -> tuple[str, str]:
    if not argv or not shutil.which(argv[0]):
        raise VRSError(f"Programa do agente não encontrado: {argv[0] if argv else '?'}", code="agent_missing")
    proc = subprocess.Popen(argv, cwd=str(cwd), stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    t0 = time.time()
    if stdin is not None:
        assert proc.stdin
        proc.stdin.write(stdin)
        proc.stdin.close()
    while proc.poll() is None:
        if cancel and cancel():
            proc.kill()
            raise VRSError("Execução do agente cancelada.", code="cancelled")
        if time.time() - t0 > TIMEOUT:
            proc.kill()
            raise VRSError(f"Agente excedeu {int(TIMEOUT)} s.", code="timeout")
        time.sleep(0.5)
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise VRSError(f"Agente terminou com código {proc.returncode}: {sanitize(err or out, 600)}", code="agent_failed")
    return out, err


def _expand_argv(template: list[str], files: dict[str, str]) -> list[str]:
    out = []
    for a in template:
        if not isinstance(a, str):
            raise VRSError("argv do agente precisa ser lista de strings.")
        for k, v in files.items():
            a = a.replace("{" + k + "}", v)
        if re.search(r"\{[a-z_]+\}", a):
            raise VRSError(f"Placeholder desconhecido no argv: {a}")
        out.append(a)
    return out


def run_adapter(mode: str, task: dict[str, Any], *, cancel: Callable[[], bool] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt = build_prompt(task)
    usage: dict[str, Any] = {"adapter": mode, "prompt_bytes": len(prompt.encode())}
    with tempfile.TemporaryDirectory(prefix="vrs-agent-") as td:
        tdp = Path(td)
        pf, sf, of = tdp / "prompt.txt", tdp / "schema.json", tdp / "output.json"
        pf.write_text(prompt, encoding="utf-8")
        sf.write_text(json.dumps(json_schemas()["storyboard.schema.json"], ensure_ascii=False), encoding="utf-8")
        files = {"prompt_file": str(pf), "schema_file": str(sf), "output_file": str(of), "prompt_text": prompt}
        if mode == "claude":
            argv = ["claude", "-p", "--output-format", "json", "--no-session-persistence", "--tools", ""]
            out, _ = _run_argv(argv, stdin=prompt, cancel=cancel, cwd=tdp)
            try:
                env = json.loads(out)
                text = env.get("result") or ""
                if isinstance(env.get("structured_output"), dict):
                    text = json.dumps(env["structured_output"])
                u = env.get("usage") or {}
                usage.update({"input_tokens": u.get("input_tokens"), "output_tokens": u.get("output_tokens"), "total_cost_usd_reported": env.get("total_cost_usd")})
            except json.JSONDecodeError:
                text = out
        elif mode in ("codex", "generic"):
            raw = os.environ.get("VRS_CODEX_ARGV" if mode == "codex" else "VRS_AGENT_ARGV", "")
            if not raw and mode == "codex":
                raw = json.dumps(["codex", "exec", "--skip-git-repo-check", "--output-last-message", "{output_file}", "{prompt_text}"])
            if not raw:
                raise VRSError("Configure VRS_AGENT_ARGV (lista JSON com {prompt_file}/{schema_file}/{output_file}).", code="agent_not_configured")
            try:
                template = json.loads(raw)
            except json.JSONDecodeError as e:
                raise VRSError("VRS_AGENT_ARGV precisa ser uma lista JSON.") from e
            argv = _expand_argv(template, files)
            out, _ = _run_argv(argv, stdin=None, cancel=cancel, cwd=tdp)
            text = of.read_text(encoding="utf-8") if of.exists() and of.stat().st_size else out
        elif mode == "openai":
            text, u = _openai(prompt)
            usage.update(u)
        else:
            raise VRSError(f"Modo '{mode}' não executa adaptador (o agente conectado dirige via MCP/CLI).", code="not_adapter")
    usage["output_bytes"] = len(text.encode())
    return parse_agent_json(text), usage


def _openai(prompt: str) -> tuple[str, dict[str, Any]]:
    if os.environ.get("VRS_OPENAI_CONSENT") != "1":
        raise VRSError("Endpoint compatível com OpenAI exige VRS_OPENAI_CONSENT=1 (consentimento de rede/custo).", code="no_consent")
    base = os.environ.get("VRS_OPENAI_BASE_URL", "").rstrip("/")
    model = os.environ.get("VRS_OPENAI_MODEL", "")
    key = os.environ.get("VRS_OPENAI_API_KEY", "")
    if not base or not model:
        raise VRSError("Configure VRS_OPENAI_BASE_URL e VRS_OPENAI_MODEL no .env.", code="agent_not_configured")
    import httpx

    headers = {"Authorization": f"Bearer {key}"} if key else {}
    r = httpx.post(f"{base}/chat/completions", json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.4}, headers=headers, timeout=TIMEOUT)
    if r.status_code != 200:
        raise VRSError(f"Endpoint respondeu HTTP {r.status_code}.", code="agent_failed")
    j = r.json()
    return j["choices"][0]["message"]["content"], {"usage": j.get("usage", {})}


def available() -> list[dict[str, Any]]:
    return [
        {"id": "auto_local", "label": "Diretor Local Autônomo (Instantâneo na CPU)", "available": True, "note": "Adapta o modelo à sua ideia em português na própria CPU e inicia o render do MP4 imediatamente sem fila externa."},
        {"id": "mcp", "label": "Agente conectado (MCP/CLI)", "available": True, "note": "O agente que você usa (ex.: Antigravity) dirige pelo servidor MCP do VRS; a fila mostra quando aguarda por ele."},
        {"id": "claude", "label": "Claude Code CLI", "available": bool(shutil.which("claude")), "note": "Usa sua conta/autenticação do Claude Code; pode consumir sua cota."},
        {"id": "codex", "label": "Codex CLI", "available": bool(shutil.which("codex")), "note": "Não encontrado nesta máquina." if not shutil.which("codex") else "argv padrão não testado aqui; ajuste VRS_CODEX_ARGV."},
        {"id": "generic", "label": "CLI genérico (argv/JSON)", "available": bool(os.environ.get("VRS_AGENT_ARGV")), "note": "Configure VRS_AGENT_ARGV."},
        {"id": "openai", "label": "Endpoint compatível OpenAI", "available": bool(os.environ.get("VRS_OPENAI_BASE_URL")) and os.environ.get("VRS_OPENAI_CONSENT") == "1", "note": "Exige consentimento explícito de rede/custo."},
        {"id": "draft", "label": "Sem agente (rascunho do modelo)", "available": True, "note": "Renderiza o exemplo do modelo como rascunho editável — não adapta à sua ideia."},
    ]
