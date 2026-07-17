# Release 1.22.0 - Operação Autônoma

## Entrega

- Central da Loja reforçada com execução por tarefa, visão multi-loja, margem e sugestão de reposição.
- Alertas operacionais com severidade, ciclo de resolução, escalonamento e conversão em tarefa rastreável.
- Integrações com regra padrão da empresa e permissão explícita por filial.
- Base de provedores fiscais com catálogo, contrato comum e Focus NFe como conector homologado.
- Spedy permanece visível como conector planejado, sem permissão para emissão até homologação técnica e credenciais.

## Segurança operacional

- Credenciais continuam criptografadas e não são retornadas pela API.
- O escopo de filial é validado antes de gravar uma exceção de integração.
- Alertas idempotentes usam fingerprint diária por regra e filial.

## Próximo passo externo

Para emissão fiscal real, cadastrar a credencial do provedor escolhido, concluir homologação por UF e executar uma venda NFC-e de teste antes de ativar produção.
