INSERT INTO release_notes(version, title, summary, changes, audience_roles, priority, expires_at)
VALUES (
  '1.21.0',
  'Gestão multi-loja e rotina operacional',
  'A Central da Loja passa a comparar unidades e orientar decisões de operação, caixa e reposição.',
  ARRAY[
    'Comparativo por loja de vendas, caixa, estoque crítico, recebíveis, operadores e margem.',
    'PDV com leitura mais clara do turno, movimentações e sincronização pendente.',
    'Sugestões de compra mostram investimento estimado e margem para apoiar a reposição.',
    'Novidades agora expiram automaticamente, evitando acúmulo de avisos antigos.'
  ],
  ARRAY['owner', 'admin', 'manager'],
  'important',
  now() + interval '60 days'
)
ON CONFLICT (version) DO UPDATE
SET title=EXCLUDED.title,
    summary=EXCLUDED.summary,
    changes=EXCLUDED.changes,
    audience_roles=EXCLUDED.audience_roles,
    priority=EXCLUDED.priority,
    expires_at=EXCLUDED.expires_at;
