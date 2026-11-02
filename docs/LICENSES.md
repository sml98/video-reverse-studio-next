# Licenças, Procedência e Componentes Vendored

## 1. Componentes de Cena Remotion (`RenderComp/free-remotion-templates`)

- **Repositório upstream**: `https://github.com/RenderComp/free-remotion-templates`
- **Commit pinado**: `f648980e528defb7594e24c6447055f0540f340b`
- **Licença**: MIT (`frontend/src/vendor/rendercomp/LICENSE`)
- **Diretório local**: `frontend/src/vendor/rendercomp/` (50 componentes em 8 categorias integrados ao mesmo motor Remotion, sem servidor ou aplicação separada).

## 2. Pacotes da Biblioteca Local (`data/library/packs/`)

| Pacote | Tipo | Licença | Origem |
|---|---|---|---|
| `kenney-halloween` | Props/recortes 2D | CC0 1.0 | Kenney.nl (Holiday Kit / Graveyard Kit) |
| `kenney-background-elements` | Cenários e camadas 2D | CC0 1.0 | Kenney.nl |
| `kenney-nature-kit` | Árvores, rochas e plantas 2D | CC0 1.0 | Kenney.nl |
| `kenney-ui-audio` | Efeitos sonoros (SFX) | CC0 1.0 | Kenney.nl |
| `open-peeps` | Personagens ilustrados 2D (poses) | CC0 1.0 | Pablo Stanley — Open Peeps |
| `poly-haven` | Texturas PBR | CC0 1.0 | Poly Haven |
| `quaternius-standard` | Biblioteca esquelética 3D (`.glb`) | CC0 1.0 | Quaternius Universal Animation Library |
| `nasa-documentary` | Vídeo documental de referência | Public Domain (NASA) | NASA Goddard Space Flight Center |

Cada importação para um projeto registra SHA256, tamanho, pacote e licença em `projects/<id>/provenance.json`.

## 3. Fontes Tipográficas (`frontend/public/fonts/`)

- `Inter.ttf`, `PlayfairDisplay.ttf`, `Anton.ttf`, `Nunito.ttf`, `JetBrainsMono.ttf` — todas sob **SIL Open Font License 1.1** (`*-OFL.txt` incluído em `frontend/public/fonts/`).

## 4. Modelos de Voz Locais em CPU (`.tools/voices/`)

- `pt_BR-faber-medium.onnx`, `pt_BR-cadu-medium.onnx`, `pt_BR-jeff-medium.onnx` — Piper TTS (Rhasspy), com seus respectivos arquivos `MODEL_CARD` preservados em `.tools/voices/<id>/MODEL_CARD`.

## 5. Gate de Verificação Independente (`.tools/kinocut-venv/`)

- `kinocut==1.16.5` (MIT) instalado em ambiente Python 3.12 isolado e chamado exclusivamente como gate de verificação pós-render.
