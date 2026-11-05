# FrameRise Chibi v5

`reference.mp4` é o original enviado pelo usuário (65,167 s). `example.mp4` é a adaptação nativa editável (71,467 s), produzida com Remotion, voz local Supertonic F2, trilha, efeitos e legendas.

Abra o preset **FrameRise Chibi · apresentação v5** na página Criar vídeo. O visualizador permite alternar entre original e adaptação. A receita está em `backend/vrs/presets/niches/framerise-chibi.json`; o componente reutilizável está em `frontend/src/remotion/scenes/FrameRiseChibi.tsx`.

Este diretório inclui plano, storyboard, imagens, áudio por cena e narração agregada, palavras e legendas. Os recursos usam caminhos relativos. As ilustrações são do mesmo projeto do usuário e possuem origem documentada em `data/library/packs/framerise-chibi/SOURCES.md`. O código da cena é editável; os PNG são assets rasterizados, sem rig esquelético. A interface representada no vídeo é uma demonstração animada.

O exemplo original e a adaptação não são idênticos. Consulte `docs/framerise-chibi.md` para instalação opcional da voz, fluxo de criação, validações e limitações. A qualidade da voz foi medida tecnicamente, sem escuta crítica neste ambiente.
