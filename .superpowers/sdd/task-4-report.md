# Tarefa 4 - Landing publica configuravel

## Arquivos alterados

- `apps/marketing/src/lib/landing-settings.ts`
- `apps/marketing/src/components/landing-hero.tsx`
- `apps/marketing/src/components/landing-product-showcase.tsx`
- `apps/marketing/src/components/landing-plan-comparison.tsx`
- `apps/marketing/src/components/landing-section.tsx`
- `apps/marketing/src/components/landing-social-proof.tsx`
- `apps/marketing/src/components/landing-hero.test.tsx`
- `apps/marketing/src/components/landing-product-showcase.test.tsx`
- `apps/marketing/src/components/landing-plan-comparison.test.tsx`
- `apps/marketing/src/components/landing-social-proof.test.tsx`
- `apps/marketing/src/app/page.tsx`
- `apps/marketing/src/app/globals.css`

## Decisoes

- A pagina inicial agora e um Server Component e faz uma unica leitura de `GET /public/landing` por meio de `getLandingSettings`.
- A resposta publica e revalidada no marketing sem `any`: textos, URLs, imagens HTTPS, WhatsApp, testimonials, toggles e limites de colecao recebem normalizacao defensiva. Falha, timeout, payload malformado ou resposta nao-2xx usam `fallbackLandingSettings`, sem expor detalhes tecnicos ao visitante.
- O fallback tipado usa `Teste gratuito de 7 dias, sem cartao` e `/checkout?plan=pro` como CTA principal.
- Hero, vitrine de produto, comparativo de planos, secoes compartilhadas e prova social foram separados em componentes. Precos, nomes, limites e suporte dos planos permanecem no catalogo local; a configuracao publica controla somente destaque e labels das CTAs.
- A vitrine filtra slides invisiveis, aplica estrutura de carousel acessivel e nao fabrica screenshots ou dados operacionais. Imagens configuradas so renderizam quando HTTPS e normalizadas.
- Depoimentos continuam vindo exclusivamente da configuracao publica ja moderada pela API. WhatsApp so renderiza para numeros com 10 a 15 digitos.
- Os toggles publicos condicionam as secoes no render do servidor. Foram removidos o fetch client-side duplicado, os atributos globais de visibilidade e o pseudo-elemento CSS que trocava o texto da hero.

## Validacao

| Comando                                    | Resultado                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `pnpm --filter @sgc/marketing test`        | Passou: 4 arquivos e 4 testes.                                                 |
| `pnpm --filter @sgc/marketing lint`        | Passou.                                                                        |
| `pnpm --filter @sgc/marketing typecheck`   | Passou.                                                                        |
| `pnpm --filter @sgc/marketing build`       | Passou; rota `/` server-rendered.                                              |
| `git diff --check -- apps/marketing`       | Passou; apenas avisos preexistentes de normalizacao LF/CRLF do Git no Windows. |
| `Invoke-WebRequest http://127.0.0.1:3001/` | HTTP 200; fallback da hero presente e texto antigo de pseudo-elemento ausente. |

## Riscos pendentes

- Nao houve chamada contra uma API publicada com configuracao real nesta tarefa; o fallback server-side foi exercitado pela rota local e a integracao real depende da disponibilidade de `GET /public/landing`.
- O Vitest do pacote nao tem plugin React e preserva JSX no `tsconfig`, por isso testes de componente nao podem importar TSX diretamente sem alterar configuracao fora do escopo. Os testes cobrem as entradas normalizadas usadas por hero, vitrine, planos e WhatsApp; `typecheck` e `next build` validam a compilacao dos componentes TSX.
- A navegacao completa e os assets locais do carousel permanecem para a Tarefa 5, conforme o brief.

Nenhum commit, push, deploy, reset ou clean foi executado. Alteracoes sujas fora do escopo foram preservadas.
