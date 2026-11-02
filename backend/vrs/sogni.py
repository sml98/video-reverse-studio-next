"""Sogni como provedor OPCIONAL — somente assinatura Unlimited, nunca créditos.

Política aplicada ANTES de qualquer submissão (e testada):
  1. Desativado por padrão (VRS_SOGNI_ENABLED != "1" ⇒ bloqueado, sem nenhuma chamada).
  2. Autorização explícita por projeto + cena + operação (grant gravado no projeto).
  3. Launcher revisado e fixado por hash (VRS_SOGNI_LAUNCHER + VRS_SOGNI_LAUNCHER_SHA256).
  4. Verificação de cobertura: o launcher precisa confirmar assinatura Unlimited ativa e
     cobertura do modelo/operação/configuração EXATOS; qualquer incerteza ⇒ parar.
  5. Billing só por assinatura: Spark, SOGNI, token balance e modos 'auto' são proibidos;
     não existe caminho de código para fallback pago.
  6. Recibo durável antes da submissão; resultado ambíguo ⇒ bloqueio de reenvio.
  7. Limite/fair use ⇒ preservar projeto e informar; nunca trocar de modalidade.
Este módulo não inventa APIs: o launcher é um programa local do usuário que implementa
o contrato JSON abaixo usando o SDK/CLI oficial verificado na instalação.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from . import db, projects
from .util import VRSError, new_id, read_json, sanitize, sha256_file, sha256_text, write_json

FORBIDDEN_BILLING = {"spark", "sogni", "token", "tokens", "token_balance", "credits", "credit", "auto", "balance", "pay_as_you_go"}
ALLOWED_BILLING = {"subscription_unlimited"}


class SogniBlocked(VRSError):
    def __init__(self, msg: str):
        super().__init__(msg, code="sogni_blocked", status=403)


def enabled() -> bool:
    return os.environ.get("VRS_SOGNI_ENABLED") == "1"


def grant(pid: str, scene_id: str, operation: str) -> dict[str, Any]:
    path = projects.project_dir(pid) / "provider-grants.json"
    g = read_json(path, {}) or {}
    g.setdefault("sogni", []).append({"scene_id": scene_id, "operation": operation, "at": db.now()})
    write_json(path, g)
    projects.history(pid, "sogni_grant", scene=scene_id, operation=operation)
    return g


def _granted(pid: str, scene_id: str, operation: str) -> bool:
    g = read_json(projects.project_dir(pid) / "provider-grants.json", {}) or {}
    return any(x["scene_id"] == scene_id and x["operation"] == operation for x in g.get("sogni", []))


def _launcher() -> list[str]:
    path = os.environ.get("VRS_SOGNI_LAUNCHER", "")
    pinned = os.environ.get("VRS_SOGNI_LAUNCHER_SHA256", "")
    if not path or not pinned:
        raise SogniBlocked("Launcher Sogni revisado não configurado (VRS_SOGNI_LAUNCHER + hash fixado).")
    p = Path(path)
    if not p.is_file():
        raise SogniBlocked("Launcher Sogni não encontrado.")
    if sha256_file(p) != pinned.lower():
        raise SogniBlocked("Hash do launcher Sogni mudou; exige nova revisão de código.")
    return [str(p)]


def _call(argv: list[str], payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    proc = subprocess.run(argv, input=json.dumps(payload).encode(), capture_output=True, timeout=timeout)
    if proc.returncode != 0:
        raise VRSError(f"Launcher Sogni falhou: {sanitize(proc.stderr.decode('utf-8', 'replace'), 300)}", code="sogni_failed")
    return json.loads(proc.stdout.decode("utf-8"))


def check_coverage(request: dict[str, Any]) -> dict[str, Any]:
    """Pergunta ao launcher (sem submeter) se a assinatura Unlimited cobre exatamente o pedido."""
    rep = _call(_launcher() + ["--check"], {"action": "check_coverage", "request": request}, 120)
    billing = str(rep.get("billing", "")).lower()
    if billing in FORBIDDEN_BILLING or billing not in ALLOWED_BILLING:
        raise SogniBlocked(f"Billing '{billing or 'desconhecido'}' não é assinatura Unlimited; submissão bloqueada.")
    if rep.get("subscription") != "unlimited_active":
        raise SogniBlocked("Assinatura Unlimited ativa não confirmada; submissão bloqueada.")
    if rep.get("covered") is not True or rep.get("certain") is not True:
        raise SogniBlocked("Cobertura do modelo/operação/configuração exatos é incerta; nada foi submetido.")
    if rep.get("fair_use_limited"):
        raise SogniBlocked("Limite/fair use atingido; projeto preservado, sem troca de modalidade.")
    return rep


def submit(pid: str, scene_id: str, operation: str, request: dict[str, Any]) -> dict[str, Any]:
    if not enabled():
        raise SogniBlocked("Sogni está desativado (padrão). Nenhuma chamada foi feita.")
    if not _granted(pid, scene_id, operation):
        raise SogniBlocked("Sem autorização explícita para esta cena/operação neste projeto.")
    req = {**request, "billing": "subscription_unlimited"}
    for k in ("billing_mode", "payment", "fallback", "tokenType", "token_type"):
        v = str(req.get(k, "")).lower()
        if v and (v in FORBIDDEN_BILLING or k == "fallback"):
            raise SogniBlocked(f"Parâmetro '{k}={v}' poderia cobrar créditos; bloqueado.")
    rhash = sha256_text("sogni", pid, scene_id, operation, req)
    prior = db.conn().execute("SELECT * FROM provider_receipts WHERE request_hash = ? ORDER BY created_at DESC LIMIT 1", (rhash,)).fetchone()
    if prior and prior["state"] in ("submitted", "ambiguous"):
        raise SogniBlocked("Há submissão anterior com resultado ambíguo/pendente para este pedido; reenvio bloqueado.")
    if prior and prior["state"] == "done":
        return json.loads(prior["detail_json"])
    coverage = check_coverage(req)
    rid = new_id("r")
    t = db.now()
    db.conn().execute("INSERT INTO provider_receipts(id, provider, project_id, scene_id, operation, request_hash, state, detail_json, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (rid, "sogni", pid, scene_id, operation, rhash, "submitted", db.dumps({"coverage": coverage}), t, t))
    try:
        result = _call(_launcher() + ["--submit"], {"action": "submit", "receipt": rid, "request": req}, 1800)
    except Exception as e:
        db.conn().execute("UPDATE provider_receipts SET state = 'ambiguous', detail_json = ?, updated_at = ? WHERE id = ?", (db.dumps({"error": sanitize(str(e), 300)}), db.now(), rid))
        raise SogniBlocked("Resultado ambíguo; recibo gravado e reenvio bloqueado até verificação manual.") from e
    if str(result.get("billing", "")).lower() not in ALLOWED_BILLING:
        db.conn().execute("UPDATE provider_receipts SET state = 'ambiguous', detail_json = ?, updated_at = ? WHERE id = ?", (db.dumps(result), db.now(), rid))
        raise SogniBlocked("Launcher não confirmou billing por assinatura no resultado; tratado como ambíguo.")
    db.conn().execute("UPDATE provider_receipts SET state = 'done', detail_json = ?, updated_at = ? WHERE id = ?", (db.dumps(result), db.now(), rid))
    return result


def status() -> dict[str, Any]:
    return {"enabled": enabled(), "launcher_configured": bool(os.environ.get("VRS_SOGNI_LAUNCHER")), "policy": "somente assinatura Unlimited; créditos/Spark/SOGNI/auto bloqueados; sem fallback"}
