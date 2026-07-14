# Homologação fiscal Orien

## Escopo da versão 1.3.0

A Central Fiscal prepara cada loja para NFC-e e NF-e sem habilitar documentos com validade
jurídica. O primeiro adaptador é a Focus NFe no ambiente de homologação.

Fluxos disponíveis:

- configuração fiscal independente por loja;
- token do provedor, certificado A1 e CSC em cofre criptografado;
- checklist de dados da empresa e prontidão tributária dos produtos;
- revisão contábil de loja e produto com trilha de auditoria;
- emissão idempotente, consulta, cancelamento e contingência;
- webhook Focus autenticado, sanitizado e idempotente;
- fila de rejeições e falhas transitórias com retentativa automática;
- XML, DANFE e XML de cancelamento armazenados pela Orien e baixados por rota protegida;
- alertas internos e por e-mail para gerente, proprietário e contador;
- Espaço do Contador com revisão, exportação e pendências por loja;
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

- Produção só é liberada depois de uma autorização em homologação, revisão do
  contador e segunda aprovação por outro usuário com `fiscal.activate`.
- Credenciais nunca aparecem em listagens ou respostas da API.
- Nenhum payload fiscal completo é gravado em logs.
- Documentos e configurações usam `tenant_id`, `branch_id` e RLS.
- Emissão usa chave de idempotência por venda e tipo de documento.
- Cancelamento exige permissão específica e justificativa entre 15 e 255 caracteres.
- A venda não é revertida automaticamente por uma rejeição fiscal.
- Qualquer alteração na configuração fiscal revoga a liberação anterior de produção.
- O worker usa trava Redis e limita retentativas para evitar processamento duplicado.

## Configuração do webhook Focus

1. Na Central Fiscal, selecione uma loja e gere o token do webhook.
2. Na Focus, informe a URL exibida pela Orien.
3. Configure o cabeçalho `X-Orien-Webhook-Token` com o token mostrado uma única vez.
4. Use entrega sequencial e mantenha a fila de sincronização ativa.
5. Selecione eventos de autorização, rejeição, cancelamento e atualização de NFC-e/NF-e.

O token é único para a integração fiscal do tenant e seu hash é armazenado no banco.

## Caminho para produção

1. Contratar o provedor e cadastrar a empresa emitente.
2. Vincular certificado A1, CSC e credenciamento estadual.
3. Revisar tributação de todos os produtos com o contador.
4. Emitir cenários de homologação: venda, desconto, CPF, cancelamento e contingência.
5. Validar DANFE, XML, numeração e escrituração com a contabilidade.
6. Registrar o aceite e liberar produção por loja com dupla confirmação.

Os cenários reais 4 e 5 dependem de certificado, CSC, credenciamento estadual e dados da
empresa emitente. Sem esses dados, a Orien valida contratos, filas e isolamento, mas não simula
uma autorização SEFAZ como se fosse real.

## Operação de falhas

- `retry_pending`: indisponibilidade ou timeout; pode tentar novamente.
- `rejected`: provedor ou SEFAZ recusou; corrija o cadastro antes de retransmitir.
- `authorized`: documento autorizado no ambiente selecionado.
- `contingency`: emissão offline; deve ser acompanhada até autorização definitiva.
- `cancelled`: cancelamento confirmado pelo provedor.

Os códigos técnicos ficam no histórico. A interface mostra uma mensagem operacional em
português e preserva o código para suporte e contabilidade.
