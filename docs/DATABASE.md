# Database

Banco principal: PostgreSQL 17.

## Migrations

Migrations SQL ficam em `packages/db/migrations` e sao aplicadas com:

```powershell
pnpm db:migrate
```

## Seed

```powershell
pnpm db:seed
```

O seed cria tenant demo, usuario administrador, roles, permissions, filial matriz, categoria e cliente exemplo.

## RLS

Tabelas de negocio sensiveis usam policy `tenant_isolation` baseada em `app.current_tenant_id`.
Queries devem executar dentro de uma transacao que defina esse contexto.

## Backup

Backups devem ser automatizados com `pg_dump`, criptografia, retencao definida e teste periodico de restore.
