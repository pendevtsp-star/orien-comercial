# UX operacional e ações em lote

## Componentes compartilhados

- `LoadingState`: estado acessível com `aria-live`, espaço mínimo estável e animação
  desativada quando o sistema operacional solicita movimento reduzido.
- `BulkActionBar`: resumo da seleção, ativação/desativação explícita, confirmação em duas
  etapas e feedback anunciado por leitores de tela.
- As telas continuam reutilizando `Input`, `Select` e `DataTable` de `@sgc/ui`.

## Contratos HTTP

Todos os lotes aceitam no máximo 100 IDs, rejeitam campos desconhecidos e executam em uma
única transação. Se um registro não existir ou estiver fora da filial autorizada, nada é
alterado.

### Produtos

`POST /api/v1/products/bulk/status`

Permissão: `products.update`.

```json
{ "ids": ["uuid"], "isActive": false, "reason": "Revisão opcional" }
```

### Clientes

`POST /api/v1/customers/bulk/status`

Permissão: `customers.update`.

```json
{ "ids": ["uuid"], "isActive": true }
```

### Equipe

`POST /api/v1/memberships/bulk/status`

Permissão: `users.manageMemberships`.

```json
{ "membershipIds": ["uuid"], "status": "disabled" }
```

O próprio acesso e o perfil Proprietário não podem ser desativados em lote. Cada registro
alterado recebe evento de auditoria com ator, lote, estado anterior, estado final e motivo.
