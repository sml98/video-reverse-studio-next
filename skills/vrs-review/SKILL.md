---
name: vrs-review
description: Revisão técnica, de movimento, de áudio e de quadros reais extraídos do MP4 no Video Reverse Studio.
---

# Revisão Técnica, Visual e de Movimento (`vrs-review`)

Nunca aprove um vídeo apenas porque o comando de render terminou com código `0`.

## Como revisar um render (`renders/vN/`)

1. Consulte o relatório estruturado:
   - MCP: `vrs_get_review(project_id, version)`
   - CLI: `.venv/bin/vrs review <project_id>`
2. Verifique os 4 gates automáticos:
   - `technical.passed`: arquivo existe, streams H.264 + AAC válidos, dimensões e duração batem com o plano.
   - `kinocut_gate.passed`: verificação independente pelo ambiente isolado Kinocut (`kino`).
   - `motion.passed`: diferença real entre quadros medida por cena (`average_diff`), garantindo que o vídeo não é uma imagem estática.
   - `audio`: duração de narração e medição `ebur128` (`input_i` LUFS e `input_tp` dBTP).
3. Inspecione visualmente os quadros reais extraídos:
   - `renders/vN/contact-sheet.jpg` e `renders/vN/frame-1.jpg` … `frame-6.jpg`.
   - Confira contraste, legibilidade, margens seguras, ausência de sobreposição entre legendas e elementos centrais, e coerência com o tema pedido.
4. Registre a revisão de conteúdo:
   - MCP: `vrs_record_content_review(project_id, version, decision="approved", notes=[...])`
   - CLI: `.venv/bin/vrs approve <project_id> --version <N> --decision approved --note "..."`
