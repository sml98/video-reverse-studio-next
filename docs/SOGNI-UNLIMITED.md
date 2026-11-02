# Política Estrita Sogni Unlimited (`unlimited_subscription_only`)

O Video Reverse Studio funciona **100% sem Sogni** usando animação por código (Remotion), gráficos nativos, biblioteca local CC0 e síntese de voz local em CPU (Piper ONNX).

Quando o usuário opta por habilitar o Sogni, o módulo [`backend/vrs/sogni.py`](../backend/vrs/sogni.py) aplica sete travas obrigatórias antes de qualquer chamada externa:

1. **Desabilitado por padrão**: `VRS_SOGNI_ENABLED=false` por padrão; exige habilitação explícita na configuração e no projeto.
2. **Proibição de créditos/tokens**: `allow_credits` é bloqueado. Valores como `spark`, `sogni`, `credits`, `paid`, `token` ou `auto` são rejeitados com erro `sogni_credits_forbidden`.
3. **Integridade do launcher**: exige binário local com hash SHA256 pinado em `VRS_SOGNI_LAUNCHER_SHA256`.
4. **Cobertura confirmada por assinatura Unlimited**: exige `subscription_active=True`, `tier="unlimited"`, `covered_by_unlimited=True`, `estimated_credit_cost == 0` e `estimated_token_cost == 0`. Se a cobertura for incerta ou ausente, bloqueia com `sogni_coverage_uncertain`.
5. **Autorização por operação (`SogniGrant`)**: exige concessão explícita vinculada a `project_id`, `scene_id` e `operation`, com teto de `max_generations <= 4`.
6. **Recibo durável antes da chamada**: grava recibo `pending` em `renders/sogni-receipts/<grant_id>.json` antes de invocar o launcher.
7. **Sem reenvio cego em falha ambígua**: se o processo falhar ou expirar após o início, o recibo muda para `ambiguous_locked` e bloqueia novas tentativas automáticas.
