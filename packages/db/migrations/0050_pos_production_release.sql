INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.18.0',
  'PDV e caixa em modo produção',
  'O balcão ganha conferência cega mais segura, quantidades rápidas e fechamento guiado.',
  ARRAY[
    'O fechamento não revela o valor esperado antes da contagem e mostra a divergência somente após a confirmação.',
    'O caixa não pode ser fechado com uma venda ainda em montagem.',
    'Itens do carrinho possuem atalhos para quantidades comuns, além do leitor, teclado e busca manual.'
  ],
  ARRAY['owner','admin','manager','seller','cashier']
)
ON CONFLICT (version) DO NOTHING;
