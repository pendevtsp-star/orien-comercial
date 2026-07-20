# Task 4R4 - Relatorio de validacao

## Alteracoes

- A prova social de marketing nao exibe estrelas, nota ou `aria-label` de avaliacao.
- A introducao agora diz somente: `Relatos compartilhados por clientes da Orien.`
- Os testes verificam que a secao e omitida sem depoimentos publicados e que, quando publicada, nao apresenta estrelas, nota ou alegacao generalizante.
- `isAllowedHref` do admin foi mantida com a mesma regra e exportada como funcao pura para paridade verificavel sem renderizar a pagina.

## Matriz direta do admin

Sem harness de testes no admin e sem adicionar dependencias, a verificacao abaixo extrai a funcao pura do arquivo-fonte e a executa no Node. A matriz aprovada cobre caminhos internos, HTTPS, `http:`, protocolo relativo, `javascript:`, espaco inicial e caminho com barra invertida:

```powershell
$source = Get-Content -Raw 'apps/admin/src/app/landing/page.tsx'
$start = $source.IndexOf('export function isAllowedHref')
$end = $source.IndexOf('function isOptionalHref', $start)
$predicate = $source.Substring($start, $end - $start).Replace('export function isAllowedHref(value: string)', 'function isAllowedHref(value)')
$matrix = @'
const cases = [['/', true], ['/checkout?plan=pro', true], ['/contato#form', true], ['https://useorien.com.br', true], ['https://evil.example', true], ['http://useorien.com.br', false], ['//evil.example', false], ['javascript:alert(1)', false], [' /contato', false], ['/contato\\evil', false]];
for (const [value, expected] of cases) {
  const actual = isAllowedHref(value);
  if (actual !== expected) throw new Error(`${value}: expected ${expected}, received ${actual}`);
}
console.log(`isAllowedHref matrix passed (${cases.length} cases)`);
'@
($predicate + $matrix) | node --input-type=commonjs
```

Resultado: `isAllowedHref matrix passed (10 cases)`.

## Validacoes executadas

- `pnpm --filter @sgc/marketing test` - 7 arquivos, 12 testes aprovados.
- `pnpm --filter @sgc/marketing lint` - aprovado.
- `pnpm --filter @sgc/marketing typecheck` - aprovado.
- `pnpm --filter @sgc/marketing build` - aprovado.
- `pnpm --filter @sgc/admin build` - aprovado. Aviso nao bloqueante: Next inferiu a raiz a partir de `C:\Users\maxue\package-lock.json` devido a lockfiles multiplos.
- Matriz direta de `isAllowedHref` - 10 casos aprovados.

Nenhuma dependencia foi instalada e nao houve commit, push, deploy, reset ou clean.
