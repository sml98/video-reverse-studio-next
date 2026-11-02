# Referência Rápida de Cenas VRS (`vrs-*`) e Pacotes Locais

## Cenas VRS nativas (17 componentes com movimento narrativo)

| Preset ID | Uso principal | Parâmetros principais (`params`) |
|---|---|---|
| `vrs-title` | Abertura / capítulo | `label`, `title`, `subtitle`, `style` (`cinematic`/`bold`/`minimal`), `backgroundAsset` |
| `vrs-kinetic-quote` | Frase tipográfica animada | `text`, `emphasis`, `author`, `authorship` (`autoral`/`citacao_verificada`/`sem_atribuicao`), `style` |
| `vrs-timeline` | Linha do tempo progressiva | `title`, `events` (`[{year, label, detail}]`) |
| `vrs-mechanism` | Diagrama causa → efeito | `title`, `nodes` (`[{label, icon, sub}]`), `note` |
| `vrs-bar-chart` | Gráfico de barras animado | `title`, `unit`, `bars` (`[{label, value}]`), `footnote` |
| `vrs-line-chart` | Curva / série temporal | `title`, `unit`, `points` (`[{label, value}]`), `highlightIndex` |
| `vrs-stat` | Número de impacto | `kicker`, `value`, `suffix`, `prefix`, `caption`, `delta` |
| `vrs-comparison` | Comparação lado a lado | `title`, `leftTitle`, `leftPoints`, `rightTitle`, `rightPoints`, `verdict` |
| `vrs-steps` | Etapas numeradas | `title`, `steps` (`[{title, detail}]`), `result` |
| `vrs-checklist` | Lista verificada | `title`, `items` (`[string]`) |
| `vrs-meme-punch` | Setup → expectativa → punchline | `tag`, `setup`, `expectation`, `punchline`, `propAsset` |
| `vrs-cta-endcard` | Chamada para ação | `badge`, `headline`, `benefit`, `action`, `subnote` |
| `vrs-story-stage` | Palco de história ilustrada | `heading`, `characterName`, `poseAsset`, `propAsset`, `speech`, `outcome`, `style` |
| `vrs-map-route` | Mapa estilizado com rota | `title`, `fromLabel`, `fromX`, `fromY`, `toLabel`, `toX`, `toY`, `note` |
| `vrs-object-stage` | Cartões de objetos/recortes | `title`, `items` (`[{asset, label, caption}]`) |
| `vrs-video-clip` | Clipe de vídeo com legenda | `videoAsset`, `caption`, `kicker`, `trimStart` |
| `vrs-code-terminal` | Terminal digitado ao vivo | `title`, `lines` (`[string]`), `result` |

## Referência de recursos locais (`lib:<resource_id>`)

Em qualquer parâmetro `asset`, `poseAsset`, `propAsset`, `backgroundAsset` ou `items[].asset`, passe `"lib:<resource_id>"`. O expansor importa automaticamente o arquivo da biblioteca para o projeto, registra SHA256 e licença em `provenance.json` e substitui pelo ID de asset local.

Exemplos de recursos verificados:
- Halloween (`kenney-halloween`): `lib:kenney-halloween.pumpkincarved-ne`, `lib:kenney-halloween.ghost-ne`, `lib:kenney-halloween.crypt-ne`, `lib:kenney-halloween.firebasket-ne`, `lib:kenney-halloween.coffin-ne`, `lib:kenney-halloween.altarstone-ne`
- Personagens 2D (`open-peeps`): `lib:open-peeps.peep-1`, `lib:open-peeps.peep-12`, `lib:open-peeps.peep-25`, `lib:open-peeps.peep-standing-5`
- Cenários/Natureza (`kenney-background-elements`, `kenney-nature-kit`): `lib:kenney-background-elements.castle`, `lib:kenney-background-elements.pyramid`, `lib:kenney-nature-kit.tree-oak-ne`
- Efeitos sonoros (`kenney-ui-audio`): `lib:kenney-ui-audio.click1`, `lib:kenney-ui-audio.switch2`, `lib:kenney-ui-audio.rollover2`
- Vídeo NASA domínio público (`nasa-documentary`): `lib:nasa-documentary.sunlight-asteroids`
