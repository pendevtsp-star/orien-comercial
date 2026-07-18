# Workflows de qualidade e seguranca

Orien executa quatro workflows independentes do deploy. Falha de analise nao altera VPS: deploy continua protegido por validacao, backup, migration e health checks proprios.

## Semgrep

Executa SAST para TypeScript/JavaScript e regras OWASP. No baseline, findings ficam no SARIF e nao travam deploy por passivo historico. Depois da triagem, crie `SECURITY_ENFORCE=true` nas variaveis do repositorio para tornar findings bloqueantes. SARIF fica como artefato e, quando Code Scanning estiver habilitado, na aba Security.

## Trivy

Escaneia dependencias, possiveis segredos, Dockerfiles e Compose. Por padrao, registra findings sem bloquear releases: cria linha de base segura para projeto ja existente.

Depois de triagem, crie variavel de repositorio `SECURITY_ENFORCE=true` para fazer workflow falhar em findings de severidade configurada. Nunca use `master` como versao da action. Orien usa `aquasecurity/trivy-action@v0.36.0`, release imutavel posterior ao incidente de comprometimento de tags de 2026.

## CodeQL

Analisa JavaScript/TypeScript com consultas `security-extended` e `security-and-quality`. Para repositorios privados, habilite Code Scanning em Settings > Security > Code security and analysis, se GitHub solicitar.

## Cobertura

Mede testes unitarios da API, onde estao fluxos de backend com cobertura relevante. Linha de base inicial e 15% de linhas. Medicao deve crescer por testes, nao por reduzir limite. Relatorios JSON e LCOV ficam no artefato `api-coverage` por 30 dias.

## Agendamento

Scans de seguranca rodam em pull requests, pushes para `master`/`main`, manualmente e aos domingos em horarios separados. Cobertura roda em pull requests, pushes e manualmente.

## Operacao

1. Consulte Actions para erro de execucao.
2. Consulte Security para findings SARIF, quando habilitado.
3. Corrija finding, adicione teste de regressao e publique novo commit.
4. Depois de triagem de vulnerabilidades existentes, habilite `SECURITY_ENFORCE=true`.
