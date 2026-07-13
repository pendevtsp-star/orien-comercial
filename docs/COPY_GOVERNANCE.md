# Governança de Texto

O produto usa português do Brasil como idioma principal. Textos novos de interface devem usar termos presentes em `packages/ui/src/copy/pt-br.ts` sempre que houver equivalência e devem ser revisados junto com a funcionalidade.

## Termos padronizados

- `Concluída`, `Em aberto` e `Cancelada` para estados de venda.
- `Loja`, nunca `filial`, na interface operacional; o termo técnico permanece apenas em APIs e banco.
- `Cliente`, `produto`, `caixa`, `comprovante` e `fidelidade` em frases curtas e diretas.
- Mensagens de erro descrevem a ação possível e nunca expõem detalhes técnicos.

## Verificação contínua

`pnpm lint:copy` valida o catálogo canônico com CSpell e dicionário PT-BR. A adoção dos textos existentes será incremental: cada módulo tocado deve migrar suas mensagens recorrentes para o catálogo antes de novas telas serem adicionadas.

Essa estratégia evita bloquear o CI por termos históricos enquanto impede que novos textos fora do padrão se acumulem.
