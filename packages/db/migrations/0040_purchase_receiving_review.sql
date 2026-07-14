INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.8.0',
  'Conferência operacional de recebimento',
  'O recebimento de compras passa a permitir ajustes de quantidade e custo por item antes de atualizar estoque e custo médio operacional.',
  ARRAY[
    'Conferência por item com edição de quantidade recebida e custo confirmado.',
    'Resumo do total que será lançado antes da confirmação da entrada.',
    'Produtos criados a partir da NF-e usam o nome conferido pelo operador.',
    'A auditoria de recebimento registra também o total confirmado da entrada.'
  ],
  ARRAY['owner','admin','manager','stock']
)
ON CONFLICT (version) DO NOTHING;
