---
name: vrs-produce
description: Síntese de voz local em CPU, expansão determinística, renderização incremental por cena e mixagem FFmpeg no Video Reverse Studio.
---

# Produção Determinística em CPU (`vrs-produce`)

## Ferramentas de produção

- **Enviar storyboard e enfileirar render**:
  - MCP: `vrs_submit_storyboard(project_id, storyboard, render=True)`
  - CLI: `.venv/bin/vrs submit-storyboard <project_id> <arquivo.json>`
- **Edição incremental de uma única cena (cache por cena)**:
  - MCP: `vrs_patch_scene(project_id, scene_id, patch, render=True)`
  - Apenas a cena alterada é re-renderizada pelo Remotion; as demais cenas são reaproveitadas do cache `data/cache/scenes/`!
- **Drenar fila no CLI**:
  - `.venv/bin/vrs worker --once` ou `.venv/bin/vrs worker --drain`

## O que o motor executa automaticamente

1. Sintetiza cada `scene.narration` em CPU com Piper ONNX (`faber`, `cadu` ou `jeff`), aplica fade anti-clique de 8 ms e extrai os tempos fonéticos (`tts_phonemes`) de cada palavra em milissegundos (`{"id","word","start","end"}`).
2. Ajusta a duração de cada cena para nunca cortar a fala (`max(scene.duration, audio_duration + 0.55s)`).
3. Importa qualquer `lib:<resource_id>` referenciado nos parâmetros para `assets/library/` do projeto e grava `provenance.json` com SHA256 e licença.
4. Renderiza cada cena em MP4 com `gl="swangle"`, `concurrency=2` e `NODE_OPTIONS=--max-old-space-size=1536`.
5. Mixa narração + SFX + trilha no FFmpeg, gera `captions.srt` e `captions.vtt`, e executa a revisão automática + gate Kinocut.
