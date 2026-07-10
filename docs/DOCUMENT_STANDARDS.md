# Document Standards

## Objetivo

Todo documento emitido pelo SaaS deve parecer parte do mesmo produto e, ao mesmo tempo, carregar a identidade da empresa contratante quando houver configuracao por tenant.

Na ausencia de configuracao do tenant, o padrao visual base deve usar a identidade da Orien: azul noite `#0B1D3D`, dourado `#F5C34A`, superficies claras e hierarquia tipografica mais institucional para titulos.

## Escopo inicial padronizado

- comprovantes de venda
- relatorios operacionais de estoque
- relatorios financeiros
- convites e e-mails operacionais

## Regras

- usar a camada compartilhada `@sgc/documents`
- aplicar branding do tenant salvo em `tenant_settings` com a chave `branding`
- sempre incluir:
  - nome da empresa
  - cores primaria e de destaque
  - rodape padrao
  - data/hora de emissao
  - contexto do documento
- nunca devolver HTML cru montado ad hoc em controllers sem passar pela base visual compartilhada

## Extensao futura

- PDF com a mesma identidade visual
- faturas de assinatura
- orcamentos
- pedidos de compra
- fiscal quando a integracao homologada entrar
