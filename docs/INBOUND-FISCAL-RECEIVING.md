# Recebimento fiscal de compras

## Fluxo operacional

1. O usuário escolhe a loja e envia o XML da NF-e ou informa a chave de 44 dígitos.
2. Na consulta por chave, a Focus NFe pode retornar apenas o resumo até que a empresa registre ciência da operação.
3. O Orien compara GTIN, SKU, custo, quantidade e NCM com o catálogo da empresa.
4. Cada item deve ser vinculado, cadastrado ou ignorado antes do recebimento.
5. O recebimento cria a entrada de compra, atualiza custos e estoque na mesma transação e registra auditoria.
6. Um pedido de compra aprovado pode ser vinculado e atualizado automaticamente.

## Manifestações

- `ciencia`: a empresa reconhece que tomou conhecimento, sem confirmar a compra.
- `confirmacao`: a operação foi realizada.
- `desconhecimento`: a empresa não reconhece a emissão.
- `nao_realizada`: a operação era conhecida, mas não aconteceu; exige justificativa.

As manifestações são enviadas ao provedor fiscal e armazenadas com usuário, horário, protocolo e resposta sanitizada.

## Segurança e consistência

- XML limitado a 8 MB e rejeição de `DOCTYPE`/entidades externas.
- Chave única por tenant para impedir recebimento duplicado.
- Dados do XML são relidos no backend; preço, quantidade e tributação não dependem do navegador.
- Estoque, custo, pedido, documento fiscal e auditoria são confirmados na mesma transação.
- Todas as tabelas novas usam RLS por tenant.

## Fechamento contábil

O Espaço do Contador gera um ZIP mensal contendo:

- resumo CSV das NF-e recebidas;
- resumo CSV das notas de saída;
- XML de entrada armazenado;
- XML de saída já baixado do provedor.

Depois da conferência, a competência pode ser marcada como fechada. Uma nova geração do pacote não remove o histórico do fechamento.
