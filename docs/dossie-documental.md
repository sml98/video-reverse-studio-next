# Dossiê documental

Modelo `dossie-documental`, cena `vrs-dossier`. Disponível em **Criar → Biblioteca de Presets → Dossiê documental**, ou na seleção de direção visual. Use o editor de parâmetros da cena para trocar mídia, textos, dados e enquadramento.

O modelo combina mídia em moldura branca, papel editorial, marcações coral, anotações conectadas, contador numérico, lupa com ampliação por máscara e entrada de plano em perspectiva. São componentes originais do FrameRise inspirados na linguagem de um dossiê; não recuperam o projeto do vídeo de referência. A câmera atua sobre planos 2D. Não há geometria volumétrica, avatar ou atuação esquelética neste preset.

## Composições

| `mode` | Comportamento |
| --- | --- |
| `frame` | Foto ou vídeo numa moldura inclinada. Sem mídia, apresenta um cartão editorial com o título e texto. |
| `lens` | Documento editável, imagem opcional, lupa móvel com ampliação do mesmo conteúdo e anotação numérica/textual. |
| `closing` | Documento em perspectiva com título editorial de fechamento. |

O exemplo **Um arquivo sem assinatura** é uma narrativa fictícia nova em cinco cenas, já preenchidas com imagens e animações. O selo de ficção está habilitado. Os números são elementos da história demonstrativa, não alegações históricas. Inclui uma fotografia de Carol M. Highsmith em domínio público, mapa e anotação originais, clipe de mapa animado, narração local PT-BR, trilha e foley. A foto da biblioteca é cenário ilustrativo, sem afirmar que o evento fictício ocorreu ali. A procedência está em `data/library/packs/vrs-dossier/SOURCES.md`. Nenhum trecho do vídeo de referência é distribuído.

## Parâmetros

- Documento: `title`, `eyebrow`, `documentId`, `documentText`, `documentImage`, `credit`, `fictional`.
- Moldura: `media`, `mediaType` (`image` ou `video`), `fit`, `videoStartSeconds`, `videoLoopSeconds`. Zero no último campo desliga a repetição; forneça um trecho longo o bastante para cobrir a cena. O vídeo toca sem o áudio original; a mixagem de narração/trilha/SFX continua no motor do app.
- Anotação: `calloutLabel`, `calloutText`, `showCounter`, `value`, `prefix`, `suffix`, `decimals`, `counterSeconds`.
- Sincronização: `cueWord`, `cueOccurrence` e `cueSeconds`. Com uma palavra explícita, o tempo vem das palavras da nova narração. Palavra ausente desativa a revelação, sem redirecionar o efeito. Com `cueWord` vazio, usa o tempo em segundos. Casas decimais e ocorrência são arredondadas para baixo.
- Lupa: `focusFromX/Y`, `focusToX/Y` são coordenadas relativas ao documento; `zoom` controla a ampliação. A segunda cópia do conteúdo é transladada para manter o ponto focal sob o centro da lente.
- Acabamento: `entry` (`perspective`, `slide`, `none`), `rotation`, `motion`, `paperColor`, `accent`, `closingTitle`.
- Som: `soundEnabled` e `soundLevel` ligam e regulam papel, clique de foco e contagem. A revelação sonora usa o mesmo gatilho do painel; se a palavra sumir do roteiro, o som de revelação também é desativado. `auto_sfx=false` nas opções do projeto desliga os efeitos automáticos. A trilha vem da receita, com volume e ducking no plano.

Os layouts horizontal, vertical e quadrado reposicionam documento e anotações. Não se limitam a recortar um vídeo horizontal. Revise os novos enquadramentos quando inserir mídia real ou textos longos.

O tema usa legendas `cinema`, grupos curtos e destaque coral. Destaque por palavra exige tempos derivados de áudio; o exemplo narrado usa os tempos do Piper. SFX adicionais podem ser inseridos pelas âncoras de palavra existentes (`anchors[].sfx`). O preset não identifica nem extrai a voz, a música ou os efeitos da referência. A voz padrão é Piper Faber; não há alegação de reprodução da voz original nem de revisão auditiva humana.

## Exemplo completo reproduzível em CPU

Com os packs e a voz Piper já instalados:

```sh
.venv/bin/vrs index
.venv/bin/vrs examples --niches dossie-documental
.venv/bin/vrs worker --drain  # somente quando o serviço não tiver um worker ativo
```

O comando de exemplos enfileira a produção pelo mesmo motor do app; um worker já ativo consome a fila automaticamente. O pacote inclui fotografia, ilustrações, clipe e SFX locais; a receita já os referencia por `lib:`. A geração de voz usa o modelo instalado, sem download automático de pesos nem chamadas pagas. Para trocar o tema, mantenha a estrutura e substitua o conteúdo. As imagens desta ficção não são uma seleção automática para qualquer outro assunto.

## Prévia técnica opcional

```sh
.venv/bin/python scripts/preview-dossier.py --output data/outputs/dossier-preview
.venv/bin/python scripts/preview-dossier.py --aspect vertical --output data/outputs/dossier-vertical
```

Este script separado gera um mapa fictício PNG e um clipe MP4 animado original, o plano editável, a procedência e uma prévia visual **silenciosa de 20 segundos** para inspeção do mecanismo. Não é o exemplo completo do catálogo e não chama TTS, serviços externos nem APIs pagas. `--prepare-only` grava os insumos sem renderizar.

Para uma narrativa nova: substitua roteiro, títulos, mídias, valores e fontes; sintetize a nova voz pelo fluxo normal do app e gere novos tempos. O estilo não busca automaticamente imagens corretas para qualquer história. Use fontes e licenças adequadas ao tema.

## Validação

`npm test`, `npm run build` no frontend; `.venv/bin/python -m pytest tests/test_acceptance.py -q` na raiz. Há verificações de segurança dos parâmetros, expansão nos três formatos, cor das legendas, sincronização de palavras repetidas/removidas e transformação óptica da lupa. A revisão visual deve usar quadros extraídos do MP4, além dos testes.
