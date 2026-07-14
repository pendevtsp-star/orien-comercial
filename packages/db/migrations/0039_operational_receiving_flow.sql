INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.7.0',
  'Recebimento de compras mais operacional',
  'Compras e estoque ficaram mais conectados para o recebimento por XML ou chave da NF-e, com resumo de conferência antes de movimentar estoque.',
  '[
    "A tela de Compras agora direciona para o recebimento assistido por XML ou chave.",
    "O recebimento fiscal mostra resumo de itens vinculados, novos produtos, alertas e itens ignorados.",
    "A confirmação de entrada por chave deixa de depender de XML local quando a nota já foi pré-lida pelo provedor.",
    "O estoque só é atualizado após confirmação explícita dos itens vinculados ou cadastrados."
  ]'::jsonb,
  ARRAY['owner','admin','manager','stock']
)
ON CONFLICT (version) DO NOTHING;
