# Roteiro de Evolucao Comercial do Orien

**Status:** planejamento aprovado para orientar rodadas futuras.  
**Escopo:** Orien Comercial como SaaS multitenant.  
**Regra de produto:** nenhuma capacidade deste roteiro e exclusiva de um cliente, segmento ou empresa piloto.

## 1. Objetivo

Evoluir o Orien para operacao comercial e financeira mais precisa sem duplicar modulos
existentes, quebrar rotas usadas no PWA ou enfraquecer isolamento, auditoria e regras de
permissao.

O resultado esperado e permitir que cada tenant configure seu modelo comercial por loja:
precos, documentos, pagamentos, taxas, aprovacoes e relatorios. O backend permanece a fonte
de verdade para toda regra critica.

## 2. Base ja existente

O planejamento parte das capacidades que ja existem no produto:

- vendas, PDV, caixa, estoque, compras, financeiro e relatorios;
- orcamentos e pedidos com conversao em venda;
- fidelidade, credito ao cliente, comissoes e metas;
- dashboards por funcao e widgets configuraveis;
- fiscal por loja, provedor Focus NFe, fila idempotente, webhook e Espaco do Contador;
- RBAC, escopo de filial, RLS, auditoria, busca global e PWA;
- componentes compartilhados como DataTable, filtros, paginacao e controles de tema.

Nenhuma rodada deve recriar fidelidade, crediario, comissoes ou orcamentos como um segundo
sub-sistema. A regra e evoluir contratos e fluxos existentes de forma compativel.

## 3. Principios obrigatorios

1. **Multitenancy por padrao.** Tabelas de negocio terao `tenant_id`; recursos de loja,
   `branch_id`; consultas usarao contexto transacional com RLS.
2. **Politica critica no backend.** Preco minimo, desconto, taxa, conversao comercial e
   cancelamento nunca dependem apenas da interface.
3. **Compatibilidade antes de reorganizacao.** URLs atuais, favoritos, links salvos e PWA
   permanecem estaveis. Mudancas de navegacao usam agrupamento visual ou redirects graduais.
4. **Uma verdade por conceito.** Venda comercial, documento fiscal, pagamento, liquidacao e
   documento auxiliar possuem estados distintos, relacionados e auditaveis.
5. **Configuracao por tenant.** Nenhuma referencia a empresas piloto entra em regra, seed
   padrao, interface publica ou documento de produto.
6. **Teste antes de migrar.** Toda migration vem com teste de isolamento, validacao de
   retrocompatibilidade e plano de reversao operacional.

## 4. Bloco I - Politica de preco e margem

### Resultado

Cada produto pode ter uma politica comercial configuravel por tenant e, quando habilitado,
sobrescrita por loja ou tabela de preco.

### Capacidades

- preco de referencia, preco minimo e preco maximo;
- motivo obrigatorio e auditoria para excecao de minimo/maximo;
- limite de desconto por perfil e fluxo de aprovacao quando excedido;
- uso opcional por loja, segmento de cliente, quantidade e periodo;
- margem prevista exibida antes da conclusao da venda;
- alertas de margem negativa ou abaixo do limite configurado.

### Decisao de modelagem

Nao adicionar somente tres colunas isoladas em `products`. Criar uma politica de preco
versionada, com produto, tenant, escopo opcional de filial, vigencia, limites e ator da
alteracao. O preco praticado continua gravado como snapshot no item da venda.

### Aceite

- usuario sem permissao nao consegue vender abaixo do minimo por API;
- alteracao de preco produz evento humano na auditoria;
- uma loja nao le politica privada de outro tenant;
- historico de venda preserva o preco e a regra aplicada naquele instante.

## 5. Bloco II - Documentos comerciais, orcamentos e DAV

### Resultado

Orcamento, pedido e DAV passam a ser variacoes de um mesmo fluxo comercial, sem concorrer
com NFC-e/NF-e nem duplicar itens, estoque e pagamento.

### Capacidades

- tipos comerciais: orcamento, pedido e DAV;
- numeracao por tenant/loja, validade, cliente, vendedor, observacoes e documento visual;
- reserva de estoque configuravel, com expiracao e liberacao auditavel;
- estados: rascunho, enviado, aprovado, reservado, convertido, vencido, cancelado;
- conversao idempotente em venda; uma origem nao pode gerar duas vendas;
- compartilhamento de documento por PDF/WhatsApp quando o canal estiver configurado;
- filtros e relatorio de pendencias, conversoes e perdas.

### Decisao de modelagem

Evoluir a estrutura existente de orcamentos/pedidos com um campo de tipo comercial e maquina
de estados. Nao criar um modulo `davs` paralelo. Venda e documento fiscal continuam entidades
separadas: uma venda pode gerar NFC-e, NF-e ou nao gerar documento fiscal, conforme regra da
operacao e configuracao fiscal.

### Aceite

- reserva nao reduz saldo definitivo de estoque ate a venda/recebimento definido pela regra;
- conversao respeita preco, permissao, estoque e idempotencia;
- DAV e documento auxiliar comercial, nunca substituto de documento fiscal;
- cancelamento libera reserva e registra ator, horario e motivo.

## 6. Bloco III - Recebiveis, taxas e conciliacao liquida

### Resultado

O financeiro passa a distinguir valor vendido, taxa, valor liquido e data prevista/efetiva de
recebimento.

### Capacidades

- cadastro de adquirentes e regras por meio de pagamento, bandeira e numero de parcelas;
- taxa percentual/fixa, antecipacao e prazo de recebimento;
- previsao automatica de liquido ao finalizar venda;
- liquidacao parcial ou total, divergencia e conciliacao por lote/extrato;
- contas a receber com bruto, taxas, liquido, status e vinculo com venda;
- relatorios de taxas, receita bruta/liquida, recebiveis futuros e divergencias.

### Decisao de modelagem

Usar entidades de regra de taxa e liquidacao financeira. Nao gravar somente `card_fee` na
venda, pois uma venda pode ter pagamentos mistos, parcelas e liquidados em datas diferentes.

### Aceite

- nenhuma alteracao de taxa modifica historico liquidado;
- totais de venda, contas a receber e caixa permanecem reconciliaveis;
- permissao financeira controla configuracao, baixa e conciliacao;
- relatorio explica diferenca entre bruto, taxa e liquido.

## 7. Bloco IV - Relatorios gerenciais e documentos

### Resultado

Relatorios conectam os novos dados comerciais, fiscais e financeiros sem prometer informacao
que ainda nao foi homologada pelo provedor fiscal.

### Capacidades

- vendas por tipo comercial e situacao;
- vendas versus faturamento fiscal, com pendencias e rejeicoes;
- taxa por adquirente, bandeira, periodo e loja;
- bruto, liquido, comissao e margem;
- orcamentos/DAVs por status, conversao e validade;
- exportacao CSV e PDF com identidade do tenant e assinatura discreta Orien;
- filtros por periodo, filial, vendedor e cliente quando autorizado.

### Aceite

- PDF, CSV e interface retornam o mesmo conjunto filtrado;
- valores respeitam timezone e moeda BRL;
- dados fiscais aparecem somente quando existirem e forem autorizados para o perfil;
- nenhuma exportacao ultrapassa o escopo de filial do usuario.

## 8. Bloco V - Refatoracao de dominio e persistencia

### Resultado

Reduzir acoplamento sem trocar comportamento do produto.

### Ordem

1. Extrair repositos tipados de vendas, financeiro e estoque, sempre recebendo `TenantContext`;
2. Separar do servico de vendas os casos de uso de pagamento, fidelidade e comissao;
3. Separar regras de credito do modulo operacional apenas se os contratos atuais ficarem
   ambiguos; o recurso ja existe e nao deve ser recriado;
4. Criar testes de contrato para cada repositorio e teste de regressao de endpoints.

### Restricoes

- consultas de negocio continuam usando o contexto `tenant_id + id` e RLS;
- repositorios nao retornam segredo, certificado ou payload fiscal sensivel;
- refactor nao muda endpoint publico sem camada de compatibilidade;
- cada extracao entra em commit isolado de uma feature de produto.

## 9. Bloco VI - UX operacional e design system

### Escopo aplicavel agora

- estender acoes em lote para produtos, clientes e equipe, com endpoints explicitos e
  auditoria; vendas so terao acoes seguras como exportar, imprimir e acompanhar;
- criar estado de carregamento compartilhado, acessivel e de tamanho estavel;
- consolidar componentes ja existentes em `packages/ui`, evitando duplicar Input, Select,
  DataTable, paginacao ou modal;
- revisar textos, foco por teclado, estados vazios e feedback de operacao;
- limitar transicoes a animacoes curtas e respeitar a preferencia de reduzir movimento.

### Fora de escopo nesta rodada

- migrar todas as URLs para uma nova arvore;
- redesenhar completamente o dashboard;
- trocar tema ou paleta global;
- transformar o PDV em wizard. O PDV permanece uma tela continua, rapida e guiada por
  teclado/leitor. Um fluxo assistido pode existir para venda consultiva fora do PDV.

### Dependencia de design

A remodelagem visual ampla deve esperar a direcao consolidada do Stitch. Depois disso, as
decisoes aprovadas entram por componentes e tokens, sem reescrever fluxos comerciais.

## 10. Bloco VII - Higiene de repositorio e release

### Capacidades

- revisar `.gitignore` e `.dockerignore` com base nos artefatos realmente gerados;
- bloquear certificados (`.pfx`, `.p12`, `.pem`, `.key`) e segredos locais fora do Git;
- preservar somente source maps necessarios ao processo de observabilidade, sem publicacao
  acidental de fonte;
- verificar que Docker nao envia documentos, uploads, dumps, testes temporarios ou ambiente
  local para a imagem;
- documentar variaveis novas apenas em `.env.example`, sem valores reais.

### Aceite

- `git check-ignore` confirma arquivos sensiveis;
- imagem Docker nao contem `.env`, uploads, backup ou certificado;
- pipeline continua capaz de gerar e associar artefatos de observabilidade definidos.

## 11. Qualidade transversal

Cada bloco deve incluir, conforme aplicavel:

- migration SQL revisada e reversivel operacionalmente;
- testes unitarios para regras e validacao;
- testes de integracao para tenant, filial, permissao e idempotencia;
- E2E para fluxos comerciais completos;
- `pnpm lint`, `pnpm test`, `pnpm test:e2e` e `pnpm build`;
- teste de banco limpo e seed de demonstracao;
- revisao de seguranca para precos, pagamentos, fiscal, upload ou webhook;
- QA visual desktop e mobile antes da publicacao.

## 12. Ordem recomendada

1. **Preparacao e contratos:** modelagem, migrations, testes de isolamento e repositorios
   minimos para preco/pagamento;
2. **Preco e recebiveis:** politica de preco, taxas, liquidacao e conciliacao;
3. **Documentos comerciais:** evolucao de orcamento/pedido para DAV e conversao protegida;
4. **Relatorios:** visoes bruta/liquida, documento comercial e fiscal;
5. **Refatoracao incremental:** extracao de dominio guiada por cobertura de testes;
6. **UX e higiene:** acoes em lote, loading, acessibilidade, ignores e QA visual;
7. **Remodelagem visual Stitch:** aplicacao por componentes depois da direcao de design
   aprovada.

## 13. Dependencias externas e decisoes do proprietario

- Token de homologacao Focus, empresa emitente, certificado A1, CSC e contador para ativacao
  fiscal real;
- contrato e regras comerciais das adquirentes para taxas e prazos corretos;
- definicao de quais documentos comerciais cada tenant usara;
- direcao visual final do Stitch antes de uma revisao ampla de frontend;
- dados anonimizados de demonstracao para E2E e QA visual.

## 14. Itens explicitamente adiados

- nova hierarquia de URLs para modulos;
- modulo DAV separado;
- redesenho amplo de dashboard antes da remodelagem visual;
- animacoes decorativas;
- implementacao de recursos dependentes de provedor fiscal em producao antes da homologacao.

Esses itens podem ser reavaliados no futuro, mas nao devem competir com confiabilidade
operacional, fiscal e financeira.
