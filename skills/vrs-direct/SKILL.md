---
name: vrs-direct
description: Direção criativa, escrita de roteiro e montagem de StoryboardSpec no Video Reverse Studio.
---

# Direção Criativa e Storyboard (`vrs-direct`)

## Contrato compacto (`StoryboardSpec`)

O agente cria o `StoryboardSpec` enxuto; o aplicativo valida contra `schemas/storyboard.schema.json`, sintetiza a voz local, extrai tempos de palavras e expande para `FilmPlan`.

Estrutura essencial:
```json
{
  "title": "Título original",
  "nicheId": "documentario",
  "visualLanguage": "documentary-data",
  "aspect": "landscape",
  "fps": 30,
  "voice": "faber",
  "captions": "word",
  "theme": {
    "background": "#0b0e14",
    "surface": "#131926",
    "primary": "#f59e0b",
    "secondary": "#a855f7",
    "text": "#f8fafc",
    "muted": "#94a3b8",
    "fontHeading": "Playfair Display",
    "fontBody": "Inter"
  },
  "scenes": [
    {
      "id": "abertura",
      "role": "contexto",
      "presetId": "vrs-title",
      "title": "Abertura",
      "duration": 8,
      "narration": "Texto falado em português claro e natural.",
      "transition": "fade",
      "sfx": "lib:kenney-ui-audio.switch2",
      "params": {
        "label": "ORIGENS HISTÓRICAS",
        "title": "De onde veio o Halloween?",
        "subtitle": "Do festival celta Samhain à cultura pop moderna",
        "style": "cinematic"
      },
      "anchors": [
        { "word": "Samhain", "occurrence": 1, "effect": "highlight" }
      ]
    }
  ]
}
```

## Diretrizes de qualidade editorial

1. **Adaptação real ao novo tema**: se a referência era sobre asteroides da NASA e o pedido do usuário é sobre a origem do Halloween, nenhuma cena pode falar de asteroides nem exibir imagens de asteroides. Use a referência apenas para calibrar duração por cena, alternância entre título/linha do tempo/objetos/gráfico e cadência da narração.
2. **Movimento narrativo**: combine variedade visual (`vrs-title`, `vrs-timeline`, `vrs-object-stage`, `vrs-bar-chart`/`vrs-stat`, `vrs-map-route`, `vrs-mechanism`, `vrs-kinetic-quote`) em vez de repetir o mesmo cartão estático.
3. **Integridade de autoria**: em `vrs-kinetic-quote`, use `authorship="autoral"` ou `"sem_atribuicao"` quando a frase foi criada para o vídeo. Só preencha `author` + `authorship="citacao_verificada"` quando a citação for historicamente verificada.
