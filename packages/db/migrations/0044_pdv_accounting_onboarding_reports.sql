INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.12.0',
  'PDV, caixa e gestão mais operacionais',
  'A operação diária ganhou caixa mais claro, compra XML mais segura, onboarding ampliado e relatórios gerenciais com margem e riscos.',
  ARRAY[
    'PDV com painel visível para sangria, suprimento, resumo de pagamentos e fechamento por conferência cega.',
    'NF-e de compra cria produtos com preço de venda sugerido em vez de margem zerada.',
    'Onboarding passa a acompanhar impressora, pagamentos e preparação fiscal.',
    'Relatório gerencial agora mostra margem bruta, inadimplência, estoque crítico e descontos.'
  ],
  ARRAY['owner','admin','manager','cashier','stock','finance','accountant']
)
ON CONFLICT (version) DO NOTHING;
