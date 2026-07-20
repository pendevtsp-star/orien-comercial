# Tarefa 4R3 - Copy comercial e paridade final

## Escopo

- `apps/api/src/modules/platform/landing-settings.ts`
- `apps/api/src/modules/platform/landing-settings.spec.ts` se necessario
- `apps/marketing/src/components/landing-social-proof.tsx`
- `apps/marketing/src/components/landing-product-showcase.tsx`
- testes marketing afetados
- `apps/admin/src/app/landing/page.tsx`
- `.superpowers/sdd/task-4-remediation-3-report.md`

Sem outros arquivos, sem commit/push/deploy/reset/clean.

## Requisitos

1. Trocar o default de titulo de prova social por uma frase verdadeira e neutra, por exemplo `Histórias de quem organiza melhor a operação`, sem declarar recomendação antes de haver prova.
2. Remover copy de bastidores da landing: nada sobre autorização de publicação, backoffice, números decorativos ou próxima etapa. Substitua por copy comercial útil ou omita.
3. Alinhar o validador de URLs/caminhos no admin com API/marketing, rejeitando traversal simples/codificado, backslash, protocolo relativo e path normalizado. O form nunca pode aceitar valor que backend substitui silenciosamente.
4. Corrigir rótulos visíveis para `Seções e rodapé` e `Histórico`.
5. Acrescentar testes para título default/sem bastidores e valores de traversal rejeitados.
6. Executar testes API/marketing, typechecks/builds API/marketing/admin e diff check. Relatar.
