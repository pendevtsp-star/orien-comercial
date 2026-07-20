# Task 3 - Editor operacional da landing

## Escopo entregue

- `apps/admin/src/app/landing/page.tsx`: substitui o formulario reduzido por um editor com as abas Geral, Produto, Planos, Prova social, Secoes e rodape e Historico.
- `apps/admin/src/app/globals.css`: adiciona estilos responsivos para abas, campos, slides, botoes com icones e estados de carregamento.
- `docs/LANDING_CONTENT_OPERATIONS.md`: registra o procedimento manual para carga, rascunho, publicacao, preview, URL invalida, historico e restauracao.

## Comportamento implementado

- Estado local `LandingSettings` espelha o contrato atual de draft da API, sem `any`.
- O cliente preserva `credentials: "include"` e trata JSON malformado com uma mensagem operacional generica.
- Respostas 200 fora do formato esperado e itens de historico malformados sao rejeitados
  antes de chegar ao estado da tela, evitando quebra de renderizacao ou mensagens de
  parse ao operador.
- Setters genericos e imutaveis atualizam hero, CTAs, visibilidade e slides.
- Salvar rascunho usa `PATCH /platform/landing`; publicar usa `POST /platform/landing/publish` apos confirmacao; historico usa `GET /platform/landing/revisions`; restauracao usa `POST /platform/landing/revisions/:id/restore` apos confirmacao.
- Preview abre `NEXT_PUBLIC_MARKETING_URL` (ou `https://useorien.com.br`) em nova aba com `noopener,noreferrer`.
- As CTAs, links e URLs de imagem recebem validacao cliente para caminhos internos ou HTTPS antes do salvamento.
- O produto aceita no maximo quatro slides. A presenca do slide no array e a visibilidade suportada pelo contrato atual.

## Validacao executada

| Comando                                                                                                                                                              | Resultado                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm exec prettier --check apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md .superpowers/sdd/task-3-report.md` | Passou                                                 |
| `pnpm exec tsc --noEmit --project apps/admin/tsconfig.json`                                                                                                          | Passou                                                 |
| `pnpm exec eslint apps/admin/src/app/landing/page.tsx`                                                                                                               | Passou                                                 |
| `pnpm --filter @sgc/admin build`                                                                                                                                     | Passou; rota `/landing` gerada                         |
| `git diff --check -- apps/admin/src/app/landing/page.tsx apps/admin/src/app/globals.css docs/LANDING_CONTENT_OPERATIONS.md .superpowers/sdd/task-3-report.md`        | Passou; apenas avisos de normalizacao LF/CRLF do Git   |
| `pnpm --filter @sgc/admin lint`                                                                                                                                      | Nao executavel: o pacote nao possui script `lint`      |
| `pnpm --filter @sgc/admin typecheck`                                                                                                                                 | Nao executavel: o pacote nao possui script `typecheck` |

Nao ha harness de testes no pacote admin. A checklist manual obrigatoria foi adicionada, mas a execucao end-to-end nao foi feita porque este workspace nao tinha a API autenticada em execucao nesta tarefa.

## Pendencias do contrato da API

O contrato publicado em `apps/api/src/modules/platform/landing-settings.ts` nao expoe alguns campos exigidos pelo briefing. Eles nao foram simulados nem enviados pelo admin para evitar inventar uma API paralela:

- Geral: texto de trial e e-mail de suporte.
- Produto: alt text e toggle individual de visibilidade do slide.
- Planos: destaque de plano e CTAs especificas de plano.
- Prova social: titulo da secao.
- Secoes e rodape: toggles independentes de produto, migracao e seguranca, alem de CTA final e links de rodape.

Para tornar esses controles operacionais, a Task 2 precisa versionar esses campos no schema, normalizacao e contrato publico/draft. O editor atual limita-se aos campos realmente aceitos: hero, CTAs, WhatsApp, slides, visibilidades existentes, depoimentos moderados e revisoes.

## Observacao de ambiente

O `next build` emitiu apenas um aviso preexistente sobre inferir `C:\Users\maxue\package-lock.json` como raiz por haver lockfiles multiplos. O build concluiu com sucesso e nao houve alteracao de configuracao, Git, deploy ou arquivos fora do escopo da Task 3.
