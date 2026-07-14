INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.6.0',
  'Fluxo fiscal ponta a ponta por venda',
  'Vendas, Central Fiscal e Espaço do Contador passam a mostrar o ciclo fiscal completo com menos navegação e mais contexto operacional.',
  ARRAY[
    'Detalhe fiscal por venda com chave, protocolo, rejeição, XML, DANFE e linha do tempo.',
    'Espaço do Contador com métricas de documentos, contingência, cancelamentos e inutilizações recentes.',
    'Cadastro de produtos com presets fiscais assistidos e aviso de conferência contábil antes da produção.'
  ],
  ARRAY['owner','admin','manager','cashier','seller','accountant']
)
ON CONFLICT (version) DO NOTHING;
