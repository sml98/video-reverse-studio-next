# FrameRise

Aplicativo pessoal completo de criação e engenharia reversa de vídeos programáticos em **CPU** para Ubuntu, dirigido pelo seu agente de IA (via MCP, CLI ou receita editorial local).

**Fluxo central**:
> **Escolher um preset → assistir à prévia → usar o roteiro do exemplo, colar um roteiro próprio ou desenvolver um tema com um agente → renderizar na CPU → revisar → exportar MP4 e projeto editável.**

O catálogo atualizado inclui **FrameRise Chibi · apresentação v5**, com original e adaptação nativa separados, personagem, cenários, digitação, cliques, timeline, trilha, efeitos e legendas. Veja [instalação da voz, fluxo e limitações](docs/framerise-chibi.md).

## Arquitetura em um único produto

- **Um único servidor local**: `http://127.0.0.1:8765` (FastAPI + SPA React/Remotion + fila SQLite).
- **Três interfaces sobre o mesmo núcleo (`backend/vrs/`)**:
  1. **Web App em Português (Modo Escuro Padrão)**: Criar vídeo, Meus projetos, Biblioteca (com visualizador 3D Three.js), Configurações e Editor/Player interativo por projeto.
  2. **Servidor MCP stdio (`python -m vrs.mcp_server`)**: ferramentas compatíveis com aliases de direção para direção pelo agente escolhido.
  3. **CLI (`vrs`)**: `status`, `doctor`, `niches`, `scenes`, `library`, `create`, `projects`, `project`, `agent-task`, `submit-storyboard`, `render`, `review`, `approve`, `export`, `examples`, `worker`, `serve`.
- **Motor visual unificado**: 80 componentes de cenas (`vrs-*` e RenderComp MIT `rc-*`) no motor Remotion 4, com efeitos via `WordAnchor` e legendas entre o player interativo e o MP4.
- **Voz local em CPU**: Piper ONNX (`faber`, `cadu`, `jeff` PT-BR) com tempos fonéticos (`tts_phonemes`); Supertonic 3 opcional (`F2`, `F4`, `F5`, português) com pesos já instalados e tempos estimados por ASR. Não há download automático de modelos.

## Comandos rápidos

```bash
# Verificar saúde completa do ambiente
./scripts/doctor.sh

# Iniciar servidor persistente em http://127.0.0.1:8765
./scripts/start.sh

# Parar servidor
./scripts/stop.sh

# Executar suíte de testes (Vitest + Pytest em armazenamento isolado)
./scripts/smoke-test.sh
```

Consulte:
- [`AGENTS.md`](AGENTS.md) — Regras operacionais do agente e limites de segurança.
- [`docs/LICENSES.md`](docs/LICENSES.md) — Licenças e procedência de código, fontes, vozes e pacotes.
- [`docs/SOGNI-UNLIMITED.md`](docs/SOGNI-UNLIMITED.md) — Política estrita Sogni Unlimited-only.
- [`docs/TERMUX-MOBILE.md`](docs/TERMUX-MOBILE.md) — Uso mobile e arquitetura Termux.

## Estúdio Pandora e âncoras por palavra

A interface oferece Biblioteca de Presets, Clonar Vídeo/Link e Criar do Zero com mix visual. Inclui o preset `pandora`, efeitos no tempo das palavras, B-roll em vídeo, recorte de fundo simples e variantes de gancho/voz. Veja [o funcionamento e as limitações](docs/PANDORA-HYPIT.md). A clonagem é heurística; não executa o runtime externo Hypit nem promete recuperar projetos ou lip-sync fonético.
