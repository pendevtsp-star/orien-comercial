# Artefatos de release e observabilidade

## Objetivo

O pipeline impede que credenciais, certificados, backups, cookies, uploads e dados locais sejam rastreados pelo Git ou enviados no contexto de build Docker. Migrations SQL e source maps de observabilidade continuam permitidos.

## Gate automatizado

Execute `pnpm security:artifacts`. O comando:

1. classifica todos os arquivos rastreados por `git ls-files`;
2. falha se encontrar artefato sensível;
3. valida se `.dockerignore` mantém todas as famílias obrigatórias fora do contexto Docker.

O gate roda no CI e antes da validação de uma release de produção. Nunca use a lista de exclusão como substituto para rotação de um segredo que já tenha sido exposto.

## Inspeção de imagem

Depois de construir uma imagem, inspecione o conteúdo sem iniciar a aplicação:

```bash
docker create --name orien-image-audit IMAGE:TAG
docker export orien-image-audit | tar -tf - | grep -E '(\.env|\.pfx|\.p12|\.pem|\.key|backups?|uploads?|cookies?)'
docker rm orien-image-audit
```

O comando de busca deve terminar sem listar dados sensíveis. Remova apenas o contêiner temporário criado para a inspeção.

## Source maps e Sentry

Source maps não são tratados como segredos pela política porque são necessários para simbolizar erros. Eles devem ser enviados ao projeto Sentry correspondente durante a release e eliminados dos artefatos públicos quando a aplicação não precisar servi-los.

Associe cada upload ao mesmo `release` e `environment` usados por API, web, marketing e admin. Valide no Sentry se um erro controlado aponta para arquivo e linha TypeScript corretos antes de promover a release.
