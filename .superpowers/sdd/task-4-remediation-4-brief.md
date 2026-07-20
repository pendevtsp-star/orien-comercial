# Tarefa 4R4 - Prova social estritamente factual

## Escopo

- `apps/marketing/src/components/landing-social-proof.tsx`
- `apps/marketing/src/components/landing-social-proof.test.tsx`
- `apps/admin/src/app/landing/page.tsx` somente se for possivel adicionar uma verificacao testavel sem nova dependencia
- `.superpowers/sdd/task-4-remediation-4-report.md`

Sem outros arquivos e sem commit/push/deploy/reset/clean.

## Requisitos

1. Remover estrelas e qualquer nota implicita. Nao ha rating no contrato.
2. Remover afirmacao generalizante sobre resultado. Usar introducao neutra que nao extrapole o conteudo dos depoimentos, por exemplo `Relatos compartilhados por clientes da Orien.`
3. Atualizar testes para assegurar ausencia de estrela/nota e de alegacao generalizante, e presenca apenas quando ha depoimentos publicados.
4. Para paridade admin: extraia o predicado de path seguro para funcao pura exportada apenas se o padrao local permitir, e adicione uma matriz de verificacao direta. Se nao houver harness admin, documente no report uma verificacao executavel que chama a funcao sem montar a pagina. Nao instale dependencias novas so para isso.
5. Rode marketing test/lint/typecheck/build e admin build/diff check. Relate.
