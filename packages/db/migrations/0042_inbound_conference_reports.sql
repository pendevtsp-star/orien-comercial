INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.10.0',
  'Conferência final de NF-e de compra',
  'Relatório visual e exportação CSV para validar entradas por XML/chave antes ou depois da movimentação de estoque.',
  ARRAY[
    'Relatório HTML imprimível da conferência de NF-e recebida.',
    'Exportação CSV com itens, vínculos, custos, quantidades e alertas.',
    'Checklist visual de pendências no histórico de notas recebidas.',
    'Resumo de valor conferido e itens vinculados no detalhe da nota.'
  ],
  ARRAY['owner','admin','manager','stock']
)
ON CONFLICT (version) DO NOTHING;
