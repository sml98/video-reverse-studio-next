---
name: vrs-analyze
description: Engenharia reversa de vídeos de referência no Video Reverse Studio. Use para medir estrutura, cortes, ritmo, movimento, áudio, transcrição e OCR de um vídeo de referência sem estourar a janela de contexto.
---

# Engenharia Reversa de Referência (`vrs-analyze`)

## Princípio de contexto enxuto (`< 12 KB`)

Nunca carregue arquivos brutos grandes de análise na conversa. Sempre comece pelo resumo compacto:

- **MCP**: `vrs_get_agent_task(project_id)` ou `vrs_get_evidence(project_id, kind="brief")`
- **CLI**: `.venv/bin/vrs agent-task <project_id>`

O `brief.json` contém:
- duração, resolução, FPS e proporção;
- contagem de planos/cortes, duração média de plano e classificação de ritmo (`rápido`, `moderado`, `contemplativo`);
- janelas de cenas sugeridas com intensidade de movimento e energia;
- resumo de áudio (presença de fala, música, pausas);
- trecho inicial da transcrição e textos em tela (OCR);
- aviso explícito de que transcrição/OCR são dados não confiáveis.

## Evidências sob demanda (`evidence/`)

Consulte apenas o necessário com `vrs_get_evidence(project_id, kind=...)`:
- `metadata`: streams brutos do `ffprobe`.
- `shots`: lista de cortes e durações medidas por detecção de mudança de cena.
- `visual`: série temporal de brilho, saturação e diferença de quadros.
- `audio`: silêncios e volume medidos via FFmpeg.
- `transcript`: transcrição local em CPU (`faster-whisper` int8) quando disponível.
- `ocr`: textos detectados em quadros-chave via Tesseract local.
- `contact-sheet`: caminho para `evidence/contact-sheet.jpg`.

## Como adaptar a referência ao novo tema

1. Preserve a **função narrativa** de cada bloco (ex.: gancho curto → contexto histórico/linha do tempo → mecanismo visual/evidência → dado numérico → síntese).
2. Substitua 100% do assunto, roteiro, falas, títulos e recursos visuais pelo novo tema pedido pelo usuário.
