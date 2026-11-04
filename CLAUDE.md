# Agentes no Video Reverse Studio

Leia e siga `AGENTS.md`. O servidor é local, CPU, sem APIs pagas e sem downloads automáticos de modelos. Use o mesmo núcleo por UI, MCP ou CLI.

1. Rode `./scripts/doctor.sh` e corrija dependências realmente ausentes sem mudar a política de gastos.
2. Verifique o serviço em `http://127.0.0.1:8765/api/health`; se necessário, `./scripts/start.sh`. Não mate processos desconhecidos nem exponha o servidor fora do loopback.
3. Use os modos Biblioteca, Clonar Vídeo/Link e Criar do Zero. O clonador é heurístico e a nova narração define os tempos. Consulte `skills/vrs-hypit/SKILL.md`.
4. Faça a revisão com os frames reais e registre limitações. Não declare qualidade auditiva sem escuta.
5. Execute frontend check/test/build e pytest antes de publicar alterações.
