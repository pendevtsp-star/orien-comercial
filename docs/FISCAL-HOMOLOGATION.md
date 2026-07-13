# Homologação fiscal Orien

## Escopo da versão 1.2.0

A Central Fiscal prepara cada loja para NFC-e e NF-e sem habilitar documentos com validade
jurídica. O primeiro adaptador é a Focus NFe no ambiente de homologação.

Fluxos disponíveis:

- configuração fiscal independente por loja;
- token do provedor, certificado A1 e CSC em cofre criptografado;
- checklist de dados da empresa e prontidão tributária dos produtos;
- revisão contábil de loja e produto com trilha de auditoria;
- emissão idempotente, consulta, cancelamento e contingência;
- fila de rejeições e falhas transitórias com nova tentativa explícita;
- histórico de eventos por documento fiscal.

## Decisão Focus NFe versus Spedy

| Critério                | Focus NFe                       | Spedy                            |
| ----------------------- | ------------------------------- | -------------------------------- |
| NFC-e e NF-e            | Contratos públicos específicos  | API unificada anunciada          |
| Sandbox/homologação     | URL e autenticação documentadas | Sandbox anunciado                |
| Consulta e cancelamento | Endpoints públicos detalhados   | Depende da referência contratual |
| Contingência NFC-e      | Fluxo offline documentado       | Precisa validação contratual     |
| Multiempresa            | Disponível por empresas/tokens  | Destacada como recurso nativo    |
| Escolha atual           | Primeiro adaptador              | Segundo candidato                |

A abstração `FiscalProvider` evita dependência permanente. A troca de fornecedor não altera
o PDV, a venda, a auditoria ou os estados internos dos documentos.

## Controles de segurança

- Produção é rejeitada pelo backend nesta versão.
- Credenciais nunca aparecem em listagens ou respostas da API.
- Nenhum payload fiscal completo é gravado em logs.
- Documentos e configurações usam `tenant_id`, `branch_id` e RLS.
- Emissão usa chave de idempotência por venda e tipo de documento.
- Cancelamento exige permissão específica e justificativa entre 15 e 255 caracteres.
- A venda não é revertida automaticamente por uma rejeição fiscal.

## Caminho para produção

1. Contratar o provedor e cadastrar a empresa emitente.
2. Vincular certificado A1, CSC e credenciamento estadual.
3. Revisar tributação de todos os produtos com o contador.
4. Emitir cenários de homologação: venda, desconto, CPF, cancelamento e contingência.
5. Validar DANFE, XML, numeração e escrituração com a contabilidade.
6. Registrar o aceite e liberar produção por loja com dupla confirmação.

## Operação de falhas

- `retry_pending`: indisponibilidade ou timeout; pode tentar novamente.
- `rejected`: provedor ou SEFAZ recusou; corrija o cadastro antes de retransmitir.
- `authorized`: documento autorizado no ambiente selecionado.
- `contingency`: emissão offline; deve ser acompanhada até autorização definitiva.
- `cancelled`: cancelamento confirmado pelo provedor.

Os códigos técnicos ficam no histórico. A interface mostra uma mensagem operacional em
português e preserva o código para suporte e contabilidade.
