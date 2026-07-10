# ADR-0001: Monorepo TypeScript com NestJS, Next.js, PostgreSQL e Drizzle

## Status

Aceita.

## Contexto

O produto precisa nascer multitenant, seguro e preparado para gestao comercial real, sem criar uma copia por cliente.

## Decisao

Usar monorepo TypeScript com Next.js para painel e marketing, NestJS para API, PostgreSQL como banco principal, Redis para filas/cache futuras e Drizzle + SQL migrations para controle fino de schema, constraints e RLS.

## Consequencias

- Mais controle sobre isolamento e SQL.
- Mais responsabilidade na escrita de migrations.
- Pacotes compartilhados reduzem divergencia de contratos.
- Futuro bridge/silo continua possivel sem reescrever o produto.
