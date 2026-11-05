# FrameRise: catálogo e preset Chibi v5

A página Criar vídeo usa a identidade FrameRise em verde/lilás, busca sem acentos, categorias e prévias sob demanda. O catálogo possui 15 presets e 80 componentes. IDs `vrs-*`, contratos e comandos continuam compatíveis com projetos existentes.

## Original e preset nativo

- `data/examples/framerise-chibi/reference.mp4`: arquivo original enviado pelo usuário, 65,167 s; SHA256 `0713049f1e0e651cc3704f4798aa15cd9ebdd31eb9e2a1ab5f9a6b22d2f20fe9`.
- `example.mp4`: adaptação renderizada pelo motor do aplicativo, 71,467 s, 720×1280, 30 fps. A fala foi preservada sem acelerar para impor a duração original.
- `storyboard.json`, `plan.json`, `assets/`, `voice/`, legendas e palavras acompanham o exemplo. Caminhos são relativos.
- O original foi composto fora do aplicativo. O preset nativo reconstrói seu estilo e não promete equivalência quadro a quadro.

O componente `vrs-framerise-chibi` contém 15 modos: hello, brand, prompt, script, voice, scenes, styles, before, after, cuts, edit, sound, mascot, finish e cta. Há oito poses, cinco cenários, digitação, ponteiro/cliques, listas de etapas, prévia, timeline e modal de exportação. A tela dentro do vídeo é uma demonstração visual do fluxo, não uma captura da interface real.

Parâmetros editáveis: modo, título, nome da marca, prompt, CTA, nome do arquivo, cenário, poses, prévias, reação à fala, movimento, momento da ação, cores, rodapé e som/volume. As poses são ilustrações alternadas com movimentos de câmera e transformações, sem rig esquelético ou sincronização labial fonética. O preset admite vertical e horizontal; o exemplo publicado foi revisado em vertical.

## Novo conteúdo

1. **Usar roteiro do preset** mantém o exemplo completo. Receitas conhecidas não passam novamente por importação/análise do próprio vídeo.
2. **Tenho um roteiro** organiza o texto informado, em ordem, sem repetir frases para preencher a duração. Remove fatos, números, imagens temáticas e fontes do exemplo anterior. Escolha imagens próprias para o novo assunto.
3. **Desenvolver um tema** encaminha a tarefa a um agente conectado. O montador local não pesquisa fatos nem escreve uma narrativa sem um roteiro.

Uploads, links externos e clonagem estrutural continuam usando análise da referência. Projetos e trabalhos existentes são preservados.

## Voz local opcional

Supertonic 3 F2, F4 e F5 aparecem somente quando `onnxruntime` e os pesos locais estão disponíveis. Instale a dependência com `pip install -e '.[supertonic]'` e aponte `FRAMERISE_SUPERTONIC_MODELS` para uma pasta já instalada contendo `onnx/` e `voice_styles/`. O caminho padrão é `.tools/supertonic3-models`. O aplicativo não baixa pesos automaticamente. Piper continua disponível.

Inferência somente CPU, código do provedor MIT e pesos Open RAIL-M. Consulte `reference-voice-provenance.json` para origem e revisões do material usado. A língua do modelo é `pt`, sem seletor exclusivo de sotaque brasileiro. Não há alteração de pitch. O alinhamento por ASR preserva o texto aprovado, com precisão declarada `asr_estimated`, sem alegar alinhamento fonético forçado.

## Validação realizada

26 testes Python, 16 testes frontend e build TypeScript/Vite passaram. Um projeto de oito segundos foi criado pela interface com roteiro novo, sintetizado e renderizado. A adaptação completa foi decodificada e teve quadros reais inspecionados: 15 cenas com movimento, sem achados do gate técnico, áudio integrado em -16 LUFS e pico verdadeiro -1,4 dBFS. Kinocut fornece métricas heurísticas adicionais; não substitui revisão editorial.

Não foi possível fazer escuta crítica humana da voz neste ambiente. Naturalidade, sotaque e adequação à personagem precisam ser avaliados pelo usuário na prévia. Os assets e créditos estão em `data/library/packs/framerise-chibi/SOURCES.md`; pesos dos modelos não estão no Git.
