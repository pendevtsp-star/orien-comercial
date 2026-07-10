# Multitenancy

Modelo inicial: pool multitenant em um PostgreSQL central com `tenant_id` nas tabelas de negocio.

## Regras

- Toda consulta de negocio deve filtrar `tenant_id`.
- Toda consulta a registro especifico deve usar `tenant_id + id`.
- Recursos por loja usam `branch_id`.
- Membership define tenant, role e opcionalmente filial.
- Usuario com `membership.branch_id` so acessa dados daquela filial, exceto registros globais permitidos.
- `DatabaseService.tenantQuery` deve ser usado para queries protegidas por RLS.

## Evolucao futura

- Bridge: schemas ou bancos separados para clientes maiores.
- Silo: infraestrutura dedicada para clientes enterprise.
- Migracoes futuras devem preservar IDs, auditoria e trilha de acesso.
