INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.11.0',
  'Resolução ativa de NF-e de compra',
  'Notas recebidas pendentes agora podem ser corrigidas e confirmadas diretamente pelo histórico, sem reimportar XML.',
  ARRAY[
    'Edição de vínculo, criação futura, quantidade e custo por item no detalhe da NF-e.',
    'Confirmação de recebimento diretamente pelo histórico da nota.',
    'Bloqueio de recebimento enquanto houver item pendente.',
    'Auditoria por item resolvido antes da movimentação de estoque.'
  ],
  ARRAY['owner','admin','manager','stock']
)
ON CONFLICT (version) DO NOTHING;
