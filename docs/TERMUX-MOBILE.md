# Uso Mobile e Arquitetura Termux (Android)

## 1. Acesso pelo celular na rede local (com túnel/autenticação explícita)

A interface web do Video Reverse Studio é responsiva (com barra inferior `mobile-nav` em telas `< 900px`) e permite escolher nichos, assistir aos exemplos, escrever a ideia, acompanhar as 6 etapas e baixar o MP4 pelo navegador mobile.

Por segurança, o servidor escuta exclusivamente em `127.0.0.1:8765`. Para acessar a partir do celular sem abrir `0.0.0.0`, use encaminhamento de porta via ADB USB ou SSH local:

```bash
# Via cabo USB (ADB reverse):
adb reverse tcp:8765 tcp:8765
# Depois abra http://127.0.0.1:8765 no navegador do celular.
```

## 2. Execução direta no Termux (Android ARM64)

Em um ambiente Termux no Android:
- **O que roda nativamente**: a API FastAPI, fila SQLite, expansão determinística `StoryboardSpec -> FilmPlan`, mixagem FFmpeg, geração de legendas `.srt`/`.vtt` e clientes de agente (MCP/CLI).
- **Limitações de renderização Chromium/Remotion em ARM64 Android**: o bundle headless do Chromium x86_64 usado pelo Remotion no desktop Ubuntu não é binário compatível com Android/Bionic sem proot-distro Debian/Ubuntu ARM64 + Chromium do pacote da distro (`--browser-executable /usr/bin/chromium`).
- **Recomendação**: use o celular como controlador/cliente de direção ou, dentro de `proot-distro login ubuntu`, aponte `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` com `--gl=swangle` e resolução `720p`.
