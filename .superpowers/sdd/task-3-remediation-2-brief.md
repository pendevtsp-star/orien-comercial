# Tarefa 3R2 - Robustez de concorrencia, validacao e acessibilidade

## Origem

Segunda revisao independente reprovou a Task 3R. Corrija exatamente estes quatro achados sem ampliar escopo:

1. Resposta de save antiga pode apagar edicao local nova e liberar publicacao.
2. Guard de resposta 2xx deve validar contrato integral, nao apenas tipos superficiais.
3. Validacao cliente deve ter exatamente os limites e restricoes do backend.
4. Padrao ARIA das tabs precisa ser completo.

## Escopo permitido

- `apps/admin/src/app/landing/page.tsx`
- `apps/admin/src/app/globals.css` somente se indispensavel
- `.superpowers/sdd/task-3-remediation-2-report.md`

Nao alterar API, docs, migrations, marketing, deploy ou outros arquivos. Nao commit/push/deploy/reset/clean.

## Solucao exigida

### Save concorrente

- Durante save, desabilite os inputs e as acoes que alteram settings **ou** use uma geracao de edicao (`useRef` monotonica) que garanta que uma resposta so aplica `setSettings`/`setDirty(false)` se nenhuma edicao ocorreu desde o request. Prefira desabilitar de forma clara, com `aria-busy` e texto de carregamento, pois elimina perda de dados na UI.
- Publicar continua bloqueado enquanto ha dirty state ou save em curso.

### Validacao integral sem duplicacao fragil

- Como o admin nao pode importar fonte TypeScript da API em runtime, crie um validador local estrito alinhado ao contrato exposto. Ele deve validar: objeto sem campos estruturais invalidos, limites de copy, `safeCopy` sem `<>{}`, URL interna/HTTPS segura, URL de imagem HTTPS quando exigida, e-mail maximo 254, maximos de arrays, booleans, enum de plano e todos os campos aninhados.
- Rejeite payload 2xx invalido antes de inserir no estado, mostrando erro operacional. Nao normalize cliente a partir de valores malformados; falhar fechado.
- Centralize os limites como constantes locais para nao haver divergencia entre o guard e `validationErrors`.

### Validacao do formulario

- `validationErrors()` deve cobrir todos os campos editaveis e limites do contrato, inclusive `slide.eyebrow`, `supportEmail`, URLs de slide, copy de rodape/CTA e arrays. Nenhum valor aceito no form pode ser silenciosamente descartado pelo backend por violar o contrato.
- Campos invalidos precisam ter mensagem compreensivel e bloquear salvar/publicar.

### Tabs acessiveis

- Todos os `tabpanel` devem continuar montados; paines inativos usam `hidden` para preservar alvo de `aria-controls`.
- Implemente roving tabindex e teclas `ArrowLeft`, `ArrowRight`, `Home`, `End`, focando a aba ativa no deslocamento. IDs usam slug ASCII estavel.

## Validacao

Execute:

```powershell
pnpm exec tsc --noEmit --project apps/admin/tsconfig.json
pnpm exec eslint apps/admin/src/app/landing/page.tsx
pnpm --filter @sgc/admin build
pnpm exec prettier --check apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css
git diff --check -- apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css
```

No relatorio, indique explicitamente como cada um dos quatro achados foi corrigido e resultados dos comandos.
