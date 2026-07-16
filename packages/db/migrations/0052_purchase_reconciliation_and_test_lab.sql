INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.20.0',
  'Conferência de pedidos e laboratório operacional',
  'O recebimento por XML passa a confrontar a nota com o pedido de compra selecionado antes da entrada no estoque.',
  ARRAY[
    'Comparação visual de quantidade e custo entre pedido e NF-e.',
    'Histórico recente do fornecedor durante a conferência.',
    'Massa isolada e removível para validar fluxos operacionais completos.'
  ],
  ARRAY['owner','admin','manager','stock','finance']
)
ON CONFLICT (version) DO NOTHING;
