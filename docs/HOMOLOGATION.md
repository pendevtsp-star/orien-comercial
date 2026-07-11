# Homologacao privada

## Ambiente

Use apenas dados ficticios ou autorizados pelos participantes. O painel de teste deve ser acessado por `app.useorien.com.br` apos a ativacao HTTPS.

## Massa padrao

O comando `ops/seed-homologation.sh` cria Comercio Horizonte e Casa Aurora, cada um com Matriz e Loja Centro. Para cada empresa existem contas de Proprietario, Administrador, Gerente, Vendedor, Caixa, Estoquista e Financeiro.

As credenciais sao geradas localmente na VPS em `/srv/apps/orien_comercial/ops/homologation-credentials.txt`, com permissao `600`. Todas as contas exigem troca de senha no primeiro acesso.

## Roteiro por perfil

- Proprietario: identidade da empresa, equipe, lojas e auditoria.
- Administrador: produtos, clientes, estoque, vendas e financeiro.
- Gerente: operar apenas a filial autorizada e aprovar fluxos locais.
- Vendedor: cliente, leitura de codigo e venda sem acesso financeiro sensivel.
- Caixa: abertura, suprimento, sangria, fechamento e divergencia.
- Estoquista: compra, recebimento, inventario, transferencia e estoque baixo.
- Financeiro: contas, baixa, conciliacao, fluxo de caixa e cobrancas.

## Registro de aceite

Cada participante deve registrar data, perfil, navegador/dispositivo, fluxo testado, resultado e `requestId` em caso de falha. Incidentes bloqueantes suspendem a inclusao de novas empresas ate a correcao e reteste.
