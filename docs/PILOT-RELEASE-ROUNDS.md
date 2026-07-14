# Rodadas de evolução do piloto

## Regra de publicação

Cada rodada deve ser concluída localmente, validada por lint, testes, build, migration revisada e QA visual antes da publicação. A produção recebe apenas rodadas completas, com backup e nota de versão cadastrada na Central de Novidades.

## Rodada A: estabilização e fundação fiscal

- Perfil fiscal separado do cadastro comercial do produto.
- Validação de NCM, CEST, origem, CFOP, CST/CSOSN e alíquotas.
- Estado de prontidão fiscal: pendente, bloqueado ou apto.
- Auditoria antes/depois das alterações tributárias.
- Central de Novidades com leitura persistente por usuário e segmentação por perfil.

## Rodada B: homologação fiscal

- Prova técnica Focus NFe e Spedy.
- Contrato `FiscalProvider` e primeiro adaptador.
- Certificado A1, CSC, série e numeração por estabelecimento.
- NFC-e e NF-e em homologação, webhooks, rejeições e contingência.
- Retentativas automáticas, armazenamento de XML/DANFE e alertas operacionais.
- Dupla aprovação auditada antes de produção.

## Rodada C: compras e financeiro

- Notas recebidas, manifestação do destinatário e conferência de XML.
- Custos tributários e divergências de entrada.
- Conciliação por forma de pagamento, adquirente, lote e conta bancária.

## Rodada D: espaço do contador

- Fechamento mensal, pacote de XMLs, pendências fiscais e comentários.
- Exportações versionadas para EFD ICMS/IPI e EFD Contribuições.
- Primeira versão do Espaço do Contador entregue com revisão por loja/produto e exportação
  da conferência fiscal. Pacote mensal e arquivos SPED permanecem na rodada contábil seguinte.

## Rodada E: inteligência gerencial

- Indicadores fiscais, margem líquida, rejeições, ruptura e comparação entre lojas.
- Relatórios agendados e alertas acionáveis.
