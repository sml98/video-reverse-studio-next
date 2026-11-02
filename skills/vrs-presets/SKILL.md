---
name: vrs-presets
description: Consulta de nichos, modelos completos, cenas animadas (VRS + RenderComp) e biblioteca local de materiais no Video Reverse Studio.
---

# Catálogo de Nichos, Cenas e Materiais (`vrs-presets`)

## Regras de consulta em duas fases

1. **Busque resumos primeiro**:
   - `vrs_search_catalog(query="...", kind="niche" | "scene", limit=12)`
   - `vrs_search_library(query="...", kind="image" | "pose" | "sfx" | "video" | "anim_library", pack="...", limit=16)`
2. **Inspecione detalhes apenas dos escolhidos**:
   - `vrs_get_scene_spec(scene_id)` para ver o esquema exato de `params` antes de montar o storyboard.

## 8 Modelos completos por nicho

- `ciencia` — **Explicação científica**: pergunta → mecanismo visual → demonstração → conclusão.
- `documentario` — **Documentário**: contexto → capítulos/linha do tempo → evidências → síntese.
- `meme` — **Meme / humor**: preparação → expectativa → quebra/punchline.
- `cta` — **CTA / divulgação**: gancho → benefício real → chamada clara.
- `financas` — **Finanças / dados**: conceito → exemplo numérico → gráfico/cálculo → limites.
- `frases` — **Frases animadas**: filosofia, autoajuda, motivação, reflexão e textos autorais.
- `tutorial` — **Tutorial / educação**: objetivo → etapas → resultado.
- `historia` — **História ilustrada**: personagem/objetivo → evento → reação → desfecho.

Consulte `references/niches-and-scenes.md` para a tabela de presets `vrs-*` e convenções de `lib:<resource_id>`.
