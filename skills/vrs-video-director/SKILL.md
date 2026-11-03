---
name: vrs-video-director
description: Diretor de vídeo para o Video Reverse Studio (VRS). Use ao criar, adaptar ou revisar storyboards (vrs.storyboard/1) e planos de filme (vrs.filmplan/1) com bonecos palito 2D, recorte estilo South Park, mundo Roblox 3D, avatares multi-plano com stickers die-cut, recortes de jornal com marca-texto, mockups 3D de dispositivos e gráficos animados sincronizados à voz local em CPU.
---

# Video Reverse Studio — Guia de Direção Audiovisual (2D / 2.5D / 3D)

Use esta skill sempre que dirigir um vídeo no **Video Reverse Studio (`vrs`)** via MCP, CLI ou API HTTP.

## 1. Motores de Cena Disponíveis (`preset_id`)

- **Personagens e Atuação Sincronizada (Lip-Sync por Fonemas)**:
  - `vrs-stickman-stage`: Boneco palito 2D articulado por juntas + traço vivo (`line-boil`) + quadro branco com desenho autotraçado (`action`: `explain_board`, `walk_talk`, `desk_podcast`, `shrug_panic`, `duet_debate`).
  - `vrs-southpark-stage`: Bonecos estilo recorte de papel (South Park) a 12fps com 6 bocas sincronizadas, inclinação da cabeça na sílaba e modo dueto (`mode`: `solo` ou `duet`, `environment`: `snow_town`, `classroom`, `courtroom`, `studio`).
  - `vrs-roblox-stage`: Mundo 3D em blocos estilo Roblox R6 (`Three.js`) com pista de Obby no céu, cidade ou acampamento (`action`: `obby_jump`, `wave_talk`, `walk_explore`, `duet_3d`).
  - `vrs-multiplane-stage`: Cenário 2.5D em 3 camadas de profundidade (fundo distante, meio-termo, bancada frontal) + até 2 avatares vivos + stickers die-cut com borda branca recortada (`stickers`).
- **Jornalismo Visual, Mockups e B-Roll**:
  - `vrs-news-highlight`: Recorte de jornal/estudo em perspectiva 2.5D estilo Vox com marca-texto fluorescente varrendo a citação-chave (`highlightText`).
  - `vrs-device-mockup`: Celular ou navegador flutuante em 2.5D com rolagem de interface, métrica em destaque e selo de notificação (`deviceType`: `phone` ou `browser`).
  - `vrs-video-broll`: Fundo de arquivo/HUD com moldura Picture-in-Picture (`pipAvatar`) reagindo à fala.
- ** Explicação, Dados e Retenção**:
  - `vrs-title`, `vrs-kinetic-quote`, `vrs-timeline`, `vrs-mechanism`, `vrs-bar-chart`, `vrs-line-chart`, `vrs-calc`, `vrs-comparison`, `vrs-steps`, `vrs-map-route`, `vrs-doc-montage`, `vrs-story-panel`, `vrs-meme`, `vrs-cta`, `vrs-stat`, `vrs-object-stage`, `vrs-3d-stage`, `vrs-parallax-photo`, `vrs-code-walkthrough`.

## 2. Áudio de Estúdio (Dueto de Vozes + BGM + SFX)

- **Dueto de Vozes (`voice: "duet"`)**:
  - Em cenas de diálogo (`duet_debate`, `mode: "duet"`, `duet_3d` ou `secondCharacter`), separe as falas em frases (`"Frase do personagem 1. Frase do personagem 2."`). O VRS alterna automaticamente entre as vozes locais `faber` e `cadu` (22050 Hz) sem cortar palavras.
- **Trilhas Instrumentais (`vrs-pro-audio`)**:
  - `lib:vrs-pro-audio.bgm-lofi-explain` (Ciência / Tutorial / Stickman)
  - `lib:vrs-pro-audio.bgm-quirky-comedy` (South Park / Meme)
  - `lib:vrs-pro-audio.bgm-blocky-gaming` (Roblox / Multiplane / CTA)
  - `lib:vrs-pro-audio.bgm-doc-suspense` (Documentário / História / Frases)
  - `lib:vrs-pro-audio.bgm-corp-finance` (Finanças / Negócios)
- **Stickers Die-Cut (`vrs-pro-stickers`)**:
  - `lib:vrs-pro-stickers.sticker-verificado`, `lib:vrs-pro-stickers.sticker-alerta-mito`, `lib:vrs-pro-stickers.sticker-foco-10x`, `lib:vrs-pro-stickers.sticker-urgente`, `lib:vrs-pro-stickers.sticker-aprovado`.
