# Relatórios comerciais e financeiros no backend

Os relatórios novos usam um dataset canônico por requisição. A resposta JSON, o CSV, o HTML
e o PDF são renderizações das mesmas colunas e linhas; nenhuma exportação refaz cálculos no
frontend.

## Documentos comerciais

- `GET /api/v1/reports/commercial-documents`
- `GET /api/v1/reports/commercial-documents/csv`
- `GET /api/v1/reports/commercial-documents/document`
- `GET /api/v1/reports/commercial-documents/pdf`

Permissão: `sales.read`.

O dataset contém orçamento, pedido e DAV. Ele não representa documento fiscal e não fabrica
situação de NFC-e/NF-e quando não existe emissão homologada.

## Financeiro bruto, taxas e líquido

- `GET /api/v1/reports/financial-net`
- `GET /api/v1/reports/financial-net/csv`
- `GET /api/v1/reports/financial-net/document`
- `GET /api/v1/reports/financial-net/pdf`

Permissão: `financial.read`.

Bruto, taxa total e líquido vêm diretamente dos snapshots imutáveis de `sale_payments`
(`gross_amount`, `total_fee_amount` e `net_amount`). Registros legados sem snapshot retornam esses campos
como `null` no JSON e `Não informado` nos documentos; o sistema não estima taxa comercial.

## Filtros

Os endpoints aceitam os filtros opcionais abaixo:

- `startDate` e `endDate` no formato `YYYY-MM-DD`, com intervalo máximo de 366 dias;
- `branchId`, `sellerId` e `customerId` como UUID;
- `documentType`: `quote`, `order` ou `dav`;
- `status`, validado conforme o relatório solicitado;
- `acquirerId` como UUID e `cardBrand` para o relatório financeiro.

Um usuário restrito a uma filial não pode selecionar outra filial. Usuários globais podem
filtrar uma filial do próprio tenant; o próprio `tenant_id` continua presente em todas as
queries e o contexto RLS é ativado por `DatabaseService.tenantQuery`.

## Formatos e localização

- CSV gerado no backend em UTF-8 com BOM, separador `;` e valores em pt-BR;
- valores monetários formatados em BRL nos documentos;
- fronteiras de período aplicadas no timezone configurado em `tenant_settings/regional`, com
  fallback para `America/Sao_Paulo`;
- PDF e HTML carregam a identidade documental do tenant.
