INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.9.0',
  'Conferência e histórico de NF-e de entrada',
  'O recebimento por XML/chave ganhou filtros operacionais, ações em lote e histórico detalhado dos itens da NF-e.',
  ARRAY[
    'Filtro de conferência por todos, com alerta, vinculados, novos produtos e ignorados.',
    'Ações rápidas para vincular itens encontrados e ignorar itens com alerta.',
    'Detalhe da NF-e recebida com itens, vínculos, custos, quantidades e divergências.',
    'Endpoint interno para consultar o histórico completo de uma NF-e de entrada.'
  ],
  ARRAY['owner','admin','manager','stock']
)
ON CONFLICT (version) DO NOTHING;
