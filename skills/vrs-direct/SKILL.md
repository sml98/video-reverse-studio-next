---
name: vrs-direct
description: Direção criativa e storyboard original no motor local VRS.
---

# Direção e storyboard

Consulte `get_brief`, `search_scenes`, `get_scene_preset` e `search_library` antes de escrever. Os aliases `vrs_get_agent_task`, `vrs_search_catalog`, `vrs_get_scene_spec`, `vrs_search_library` continuam aceitos.

Envie por `submit_preset_storyboard(project_id, storyboard_json)` ou `vrs submit-storyboard PROJECT storyboard.json`. O contrato real está em `schemas/storyboard.schema.json`.

```json
{
  "schema": "vrs.storyboard/1",
  "title": "Uma ideia ganha forma",
  "nicheId": "pandora",
  "aspect": "vertical",
  "voice": "faber",
  "captions": "hormozi",
  "theme": {"background":"#111015","primary":"#C3FF5F","secondary":"#9C7BFF","text":"#F1EDDF"},
  "scenes": [{
    "presetId":"vrs-pandora-cutout",
    "duration":5,
    "narration":"Uma ideia pode ganhar forma.",
    "params":{"title":"Uma ideia ganha forma","metricValue":1,"metricLabel":"Exemplo ilustrativo","cards":[]},
    "anchors":[{"word":"ideia","occurrence":1,"spanWords":1,"effect":"badge_flash","label":"SUA IDEIA"}]
  }]
}
```

`preset_id`/`parameters` são canônicos; `presetId`/`params` são aliases de entrada. `theme` aceita as cores e a fonte enumerada do contrato; `primary`, `secondary` e `text` são normalizados para `accent`, `accent2` e `foreground`. Não envie campos de estilo de versões antigas como `surface`, `fontHeading`, `fontBody`, `fps` ou `visualLanguage` na raiz do storyboard.

A referência orienta ritmo e estrutura; a narrativa é original. Não copie fatos, imagens ou assunto de uma referência para outro tema. Dados numéricos precisam de fonte ou indicação de ilustração. Frases próprias usam `authorship="autoral"` ou `"sem_atribuicao"`. A duração final acompanha a voz natural; reduza o texto em vez de acelerar a fala. Âncoras recebem tempos da nova narração e são omitidas quando o gatilho deixa de existir.
