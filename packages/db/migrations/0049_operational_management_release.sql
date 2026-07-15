INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.17.0',
  'Central da Loja e tarefas operacionais',
  'A rotina do gerente passa a reunir alertas acionáveis, operadores ativos, margem sob revisão e tarefas atribuídas.',
  ARRAY[
    'A Central da Loja mostra operadores ativos, caixa, estoque crítico, contas, compras e integrações que exigem atenção.',
    'Tarefas podem ter loja, responsável, prazo, prioridade e recorrência.',
    'A auditoria traduz eventos fiscais, financeiros, descontos e cancelamentos para linguagem operacional.'
  ],
  ARRAY['owner','admin','manager','finance','stock']
)
ON CONFLICT (version) DO NOTHING;
