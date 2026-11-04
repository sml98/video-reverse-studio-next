# Estúdio: presets, referência e mix visual

A criação oferece três modos. Biblioteca usa receitas de cenas; Clonar Vídeo/Link importa uma referência, mede seus cortes e propõe uma estrutura para a narrativa fornecida; Criar do Zero reparte o tempo planejado entre motion, apresentador, animação e B-roll. O formato inicial é vertical, com alternativas horizontal e quadrado.

## Implementação e limites

- `SceneAnchor` participa dos contratos Python/Zod, expansão, assets, SFX, Player e MP4. Os efeitos usam palavras da narração corrente. Alterar texto recalcula tempos; IDs antigos são convertidos em gatilhos textuais antes da nova síntese. Gatilhos ausentes são ignorados pelo renderizador.
- O motor local usa cortes, paleta, OCR, transcrição e picos medidos como sugestões heurísticas. Não executa o runtime do projeto Hypit, não recupera uma edição original e não reescreve fatos semanticamente com LLM. O texto fornecido é distribuído entre cenas. Microcortes ficam como sugestões de efeitos dentro de blocos, evitando fragmentar a fala.
- `vrs-pandora-cutout` aceita mídia de fundo, apresentador PNG, contador numérico ilustrativo, cards e stickers. Se faltar mídia de B-roll, o plano conserva um visual de rascunho até selecionar uma imagem/vídeo. Não se escolhe filmagem aleatória para fingir evidência de um assunto.
- Os percentuais são normalizados e alocados por frames planejados. Se a narração exceder o orçamento, a cena é estendida e avisada. A proporção final pode mudar; a voz nunca é acelerada para forçar a divisão.
- O seletor de visema usa grafemas dentro dos tempos medidos por palavra. Diferencia bilabiais, labiodentais e vogais, mas não tem tempos fonéticos internos e não equivale a Rhubarb/forced alignment de fonemas. PNGs de apresentador recebem movimento 2.5D; não ganham um rig de boca.
- Recorte: preserva alpha existente ou aplica flood-fill às regiões de cor semelhante conectadas às bordas, com máscara suavizada. Serve para fundos simples. O extra `cutout` permite instalar rembg separadamente, mas uploads não baixam pesos; segmentação por modelo não foi configurada nesta entrega.
- Variantes preservam o projeto original. O cache só reutiliza cenas cujos inputs são idênticos. Trocar voz no corpo exige novos tempos e renders. Limite de 12 combinações por solicitação.

## Interfaces

MCP: `hypit_clone_workflow`, `generate_hypit_variants`, `clone_reference_style`, `auto_direct_project`, `reframe_project`, `manage_scene`, além dos aliases documentados em `skills/vrs-hypit/SKILL.md`.

CLI: `niches`, `scenes`, `library`, `projects`, `project`, `approve`, `hypit-clone`, `agent-task` e `submit-storyboard` estão implementados. `approve` registra uma revisão humana/agente; não deve ser usado para fabricar aprovação.

HTTP: `POST /api/projects/{pid}/hypit-clone`, `/hypit-variants`, `/cutout-upload`. A criação aceita `studio_sliders` e `clone_full` em JSON ou upload multipart. Endpoints continuam protegidos por Host/Origin e loopback.

Para desenvolvimento: `npm --prefix frontend run check`, `npm --prefix frontend test`, `npm --prefix frontend run build`, `.venv/bin/pytest -q`. Os testes usam armazenamento isolado. `./scripts/run-mcp.sh` resolve a raiz dinamicamente.

## Duas instalações locais

A porta padrão permanece 8765. Se outra instalação já a ocupa, use `VRS_PORT=8766 ./scripts/start.sh` e acesse `http://127.0.0.1:8766`. Use o mesmo `VRS_PORT` para parar o serviço. Os PID files são separados por porta. Não encerre a instalação antiga para liberar a porta.
