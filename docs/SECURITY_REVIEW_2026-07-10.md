# Revisao de Seguranca e Observabilidade - 2026-07-10

## Escopo

Revisao preparatoria para beta sobre dependencias de producao, segredos rastreados, autenticacao, cookies, CORS, isolamento por tenant, erros e telemetria HTTP.

## Resultado

- Nenhum segredo, chave privada ou arquivo `.env` foi encontrado no Git.
- Cookies de sessao permanecem `HttpOnly`, `SameSite=Lax` e `Secure` em producao.
- CORS de producao permanece restrito a `WEB_APP_URL` com credenciais.
- Guards de autenticacao, tenant e permissao continuam aplicados aos modulos operacionais.
- Erros inesperados nao retornam stack trace ao cliente e incluem `requestId`.
- Logs HTTP estruturados agora registram metodo, caminho sem query string, status, duracao e `requestId`.
- Healthcheck agora informa servico, versao e uptime sem expor configuracao sensivel.

## Achado corrigido

O `pnpm audit --prod` identificou `GHSA-72gw-mp4g-v24j` em `multer 2.1.1`, severidade alta, por possibilidade de negacao de servico com nomes de campos profundamente aninhados. O projeto fixa `multer 2.2.0` por override no workspace.

Uma nova auditoria do lockfile confirmou zero vulnerabilidades criticas ou altas. Permanecem duas moderadas transitivas: PostCSS pelo Next.js e `uuid` pelo ExcelJS. Os vetores vulneraveis nao sao expostos diretamente no uso atual; devem ser atualizados quando as dependencias superiores publicarem versoes compativeis.

## Riscos residuais antes do beta

- Executar o scan completo do Codex Security quando o fluxo externo estiver estavel.
- Validar isolamento entre dois tenants por teste E2E automatizado na infraestrutura publicada.
- Configurar agregacao externa de logs, alerta de indisponibilidade e politica de retencao.
- Configurar HTTPS antes de convidar usuarios externos.
- Testar restauracao de backup e resposta a incidente.

## Criterio

Nenhum achado critico conhecido. O achado alto de dependencia foi corrigido. Os riscos residuais constam como bloqueadores no checklist de beta.
