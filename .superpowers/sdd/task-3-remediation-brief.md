# Tarefa 3R - Contrato completo e editor seguro da landing

## Motivo

A revisao independente reprovou a Tarefa 3 porque o editor escondia parte dos controles pedidos e podia salvar defaults sobre um rascunho real quando a carga falhasse. Corrigir pela raiz: contrato versionado, normalizacao, admin e testes coerentes.

## Escopo permitido

- Modificar `apps/api/src/modules/platform/landing-settings.ts`
- Modificar `apps/api/src/modules/platform/landing-settings.spec.ts`
- Modificar `apps/admin/src/app/landing/page.tsx`
- Modificar `apps/admin/src/app/globals.css` somente se indispensavel
- Modificar `docs/LANDING_CONTENT_OPERATIONS.md`
- Criar/atualizar `.superpowers/sdd/task-3-remediation-report.md`

Nao alterar migrations, service/controller, marketing, deploy ou arquivos fora desta lista. Nenhum commit, push, deploy, reset ou clean.

## Contrato final a suportar

Amplie de modo aditivo e seguro o documento normalizado para que estes controles sejam persistidos no JSON versionado:

1. `hero.trialText` (copy segura, maximo 140) e `supportEmail` (e-mail valido, opcional/publico).
2. Cada `showcaseSlides[]` deve ter `alt` (copy segura) e `isVisible` (boolean). Preserve retrocompatibilidade de slides existentes, criando defaults seguros ao normalizar.
3. Apresentacao de planos: plano destacado (`starter | pro | enterprise`) e labels de CTA por plano, no maximo 80 caracteres. O codigo continua dono de preco, limites, modulos e slug.
4. Prova social: titulo editavel seguro e visibilidade continua sob controle de `visibility`.
5. Visibilidades independentes: `showProduct`, `showMigration`, `showPlans`, `showTestimonials`, `showSegments`, `showSecurity`, `showFaq` e `showCalculator`. Defaults devem preservar a landing atual.
6. CTA final e links de rodape: copy/URLs seguras, em quantidade fixa/limitada, sempre paths internos ou HTTPS validados. Nenhuma configuracao aceita HTML, CSS, script, `javascript:`, protocolo relativo, barra invertida ou URL de imagem insegura.

Todos os campos adicionais devem entrar em `PublicLandingSettings` quando destinados a pagina publica e sair do campo `admin`.

## Editor seguro

1. Corrigir carregamento: buscar rascunho e revisoes de forma independente. Se o rascunho falhar, manter editor bloqueado, mostrar erro operacional e nao permitir salvar/publicar com defaults. Falha do historico nao pode descartar o rascunho carregado.
2. Validar estruturalmente toda resposta 2xx recebida antes de renderizar. Payload malformado deve mostrar estado operacional, nao derrubar React.
3. Adicionar `dirty state`: apos qualquer edicao local, publicar fica bloqueado com orientacao para salvar primeiro; apos salvar, liberar publicacao. Restaurar limpa o dirty state e recarrega o rascunho efetivo.
4. Campos obrigatorios devem bloquear salvar quando vazios ou invalidos; mostrar mensagem proxima ao campo e nao depender do fallback silencioso da API.
5. `Atualizar historico` precisa de carregamento e tratamento visivel de erro.
6. Usar slug estavel ASCII para IDs de tabs e relacionamentos ARIA; nenhuma ID pode conter espaco.
7. Completar as seis abas do briefing: Geral, Produto, Planos, Prova social, Secoes e rodape e Historico. Cada controle deve persistir de verdade no contrato acima ou nao deve ser exibido.

## Testes exigidos

Adicione testes puros em `landing-settings.spec.ts` para todos os defaults/normalizacao dos novos campos, URLs inseguras e retrocompatibilidade. Execute:

```powershell
pnpm --filter @sgc/api test -- landing-settings.spec.ts
pnpm exec tsc --noEmit --project apps/admin/tsconfig.json
pnpm exec eslint apps/admin/src/app/landing/page.tsx
pnpm --filter @sgc/admin build
pnpm exec prettier --check apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md
git diff --check -- apps/api/src/modules/platform/landing-settings.ts apps/api/src/modules/platform/landing-settings.spec.ts apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md
```

Registre resultados exatos e qualquer bloqueio no relatorio.
