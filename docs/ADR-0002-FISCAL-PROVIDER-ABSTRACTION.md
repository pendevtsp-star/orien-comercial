# ADR-0002: Abstração do provedor fiscal

## Status

Aceita em 13 de julho de 2026 e atualizada na versão 1.2.0. A Focus NFe é o primeiro
adaptador de homologação. Produção continua bloqueada até a aprovação contábil e o aceite
formal do piloto fiscal.

## Contexto

A Orien precisa emitir NF-e e NFC-e para múltiplos tenants e filiais sem acoplar o PDV diretamente a uma API externa. O cadastro atual já possui uma fila de documentos fiscais, mas ainda não transmite documentos com validade fiscal à SEFAZ.

## Decisão

- O PDV solicita a emissão ao orquestrador fiscal da Orien.
- O orquestrador valida empresa, filial, produto, pagamento e idempotência.
- Um contrato `FiscalProvider` traduz a solicitação para Focus NFe, Spedy ou outro provedor homologado.
- Webhooks atualizam o documento fiscal de forma idempotente.
- O estado comercial da venda e o estado fiscal permanecem separados e auditáveis.
- Nenhuma credencial fiscal será armazenada em texto puro ou enviada ao navegador.
- O token principal, o certificado A1 e o CSC usam referências distintas no cofre criptografado.
- A referência da venda é idempotente no provedor e no banco da Orien.
- Falhas transitórias entram em fila de nova tentativa; rejeições fiscais exigem ação humana.

## Prontidão do produto

Um produto é considerado apto quando possui NCM, origem, CFOP interno e interestadual, CST ou CSOSN, CST PIS e CST COFINS. Produtos sujeitos a ICMS-ST também exigem CEST. A revisão do contador é registrada separadamente da completude técnica.

## Consequências

- A integração inicial exige mais modelagem, porém permite trocar de provedor sem reescrever o PDV.
- Rejeições da SEFAZ devem ser traduzidas para mensagens operacionais sem esconder o código técnico no histórico.
- Homologação, contingência, cancelamento, inutilização e download de XML/DANFE precisam de testes contratuais próprios.

## Primeiro adaptador

A Focus NFe foi selecionada para o primeiro ciclo porque publica contratos específicos para
NFC-e e NF-e, autenticação HTTP Basic, ambientes separados, consulta, cancelamento e
contingência. A Spedy permanece compatível com a abstração e será reavaliada após acesso à
documentação contratual completa e definição comercial.
