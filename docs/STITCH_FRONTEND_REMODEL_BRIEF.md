# Briefing Para Remodelagem Visual No Stitch

Este documento serve como contexto para uma IA de design, como Stitch, remodelar visualmente o frontend da Orien sem alterar regras de negócio, backend, permissões, integrações ou arquitetura. A intenção é criar uma proposta visual mais profissional, clara e moderna para depois aplicarmos no código do projeto.

## Prompt Pronto Para Usar No Stitch

Você é uma IA de design de produto SaaS. Quero que remodele visualmente a plataforma Orien, um SaaS brasileiro de gestão comercial para pequenos e médios negócios, mantendo a identidade premium da marca e melhorando drasticamente UX/UI.

O objetivo do produto é permitir que proprietário e gerente tenham a operação do estabelecimento na palma da mão: vendas, PDV, estoque, financeiro, compras, fiscal, fidelidade, relatórios e operação diária. O sistema precisa parecer profissional, confiável, simples de operar, seguro e adequado para uso real em lojas.

Não redesenhe como landing genérica. O sistema é uma ferramenta operacional densa. Priorize clareza, hierarquia, produtividade, legibilidade, navegação por perfil, estados vazios úteis, foco em teclado no PDV e painéis gerenciais acionáveis.

Crie propostas visuais para:

- Landing page pública da Orien.
- Login e recuperação/troca de senha.
- Shell autenticado com menu lateral e header.
- Dashboard/Visão geral por perfil.
- Central da Loja.
- PDV modo produção.
- Vendas.
- Produtos e cadastro guiado de produto.
- Estoque e entrada por compra/XML.
- Compras e fornecedores.
- Financeiro.
- Relatórios e documentos.
- Fiscal/NFC-e em homologação.
- Espaço/portal do contador.
- Fidelidade.
- Suporte.
- Configurações, integrações e impressoras.
- Backoffice da plataforma Orien.

Mantenha a marca Orien:

- Nome: Orien.
- Domínio: useorien.com.br.
- Proposta: Gestão inteligente para negócios em crescimento.
- Paleta base: azul noite `#0B1D3D`, azul profundo `#133A7C`, azul real `#2563EB`, ouro `#F5C34A`, cinza claro `#F1F3F6`, branco suave `#FAFAFA`.
- Também existe tema alternativo amarelo/dourado/preto, chamado Solaris, mas sem quebrar contraste.
- Tipografia desejada: títulos com serif sofisticada no estilo Playfair Display; UI/corpo com Inter ou similar.
- Tom visual: premium, confiável, claro, operacional, brasileiro, sem parecer banco genérico nem ERP antigo.

O que pode mexer:

- Layout, composição, hierarquia visual, responsividade e espaçamento.
- Aparência de cards, tabelas, filtros, tabs, botões, formulários, modais, toasts, badges, menus e estados vazios.
- Organização do menu lateral e agrupamento dos módulos.
- Microcopy visual e textos curtos de orientação.
- Propostas de componentes e padrões para telas densas.
- Design dos documentos emitidos: relatórios, comprovantes, etiquetas e e-mails.
- Landing page, seções comerciais, carrosséis, planos, FAQ, prova social e CTAs.

O que não deve mexer:

- Regras de negócio.
- Permissões/RBAC.
- Fluxos fiscais, Asaas, SMTP, Resend, WhatsApp ou integrações.
- Contratos de API.
- Nomes técnicos de rotas internas.
- Estrutura multitenant.
- Banco de dados.
- Fluxos de segurança.
- Cópia literal de interfaces de concorrentes.

Entregue:

1. Um design system resumido: cores, tokens, tipografia, grid, radius, sombras, estados.
2. Uma proposta de navegação lateral mais simples e agrupada por perfil.
3. Um layout premium para a landing page.
4. Um layout operacional para o painel autenticado.
5. Um layout de PDV modo produção com foco em teclado, scanner e fechamento rápido.
6. Um layout de dashboard/central da loja com indicadores acionáveis.
7. Padrões para formulários densos, tabelas, filtros, tabs e estados vazios.
8. Sugestões de melhorias visuais por tela.
9. Versões desktop e mobile para as telas críticas.
10. Observações do que deve ser mantido para implementação segura no código.

## Resumo Do Produto

Orien é um SaaS de gestão comercial multitenant para empresas brasileiras, com foco em varejo, distribuidoras, serviços e negócios com múltiplas lojas.

O produto já está em fase de piloto real com cliente. A prioridade visual agora é sair da sensação de MVP e chegar a uma experiência percebida como produto profissional, estável e confiável.

Principais módulos existentes:

- Dashboard/Visão geral.
- Central da Loja.
- PDV.
- Vendas.
- Produtos.
- Clientes.
- Fidelidade.
- Estoque.
- Fornecedores.
- Compras.
- Financeiro.
- Relatórios.
- Fiscal/NFC-e em homologação.
- Espaço do contador.
- Suporte.
- Alertas.
- Tarefas.
- Auditoria.
- Integrações.
- Impressoras.
- Configurações.
- Assinatura.
- Preferências.
- Backoffice da plataforma Orien.
- Landing page pública.

## Stack E Arquitetura Relevante Para Frontend

Monorepo TypeScript com pnpm:

- `apps/web`: painel autenticado e portal externo do contador.
- `apps/marketing`: landing pública, checkout público, termos, privacidade e avaliações.
- `apps/admin`: backoffice administrativo da Orien.
- `apps/api`: API NestJS.
- `packages/ui`: componentes compartilhados.
- `packages/types`: schemas Zod e tipos compartilhados.
- `packages/documents`: renderização de documentos, PDFs, e-mails e padrões visuais.
- `packages/db`: schema, migrations e seed.

Tecnologias visuais:

- Next.js.
- React.
- Tailwind CSS.
- Componentes próprios em `packages/ui`.
- Ícones Lucide.
- Design responsivo desktop/mobile.
- PWA instalável.

## Identidade Visual Atual

Referência da marca:

- Logo com símbolo de bússola/ponteiro.
- Marca Orien.
- Tagline: Gestão inteligente para negócios em crescimento.
- Visual premium com azul noite, dourado e branco suave.
- Títulos serifados com aparência editorial sofisticada.
- UI operacional com Inter.

Paleta base:

- Azul noite: `#0B1D3D`.
- Azul profundo: `#133A7C`.
- Azul real: `#2563EB`.
- Ouro: `#F5C34A`.
- Cinza claro: `#F1F3F6`.
- Branco suave: `#FAFAFA`.

Temas existentes/planejados:

- Orien: azul, ouro e branco.
- Safira: azuis mais vivos.
- Esmeralda: verdes.
- Grafite: neutro escuro.
- Rubi: vermelho.
- Solaris: amarelo/dourado/preto.

Importante:

- O tema escolhido deve afetar seletores, abas, botões ativos e elementos de destaque.
- O tema não deve prejudicar contraste.
- O menu lateral precisa acompanhar a cor ativa do tema.

## Princípios De UX

- Operação diária primeiro, decoração depois.
- Telas densas devem ser limpas, compactas e previsíveis.
- A interface deve ajudar o usuário leigo sem expor jargão técnico demais.
- O PDV precisa ser rápido, com teclado, scanner e poucos cliques.
- Gerente e proprietário precisam ver alertas acionáveis, não só números soltos.
- Estoquista não deve ver financeiro se não tiver permissão.
- Cada perfil deve ver apenas módulos úteis para sua rotina.
- Erros técnicos nunca devem aparecer para o usuário final.
- Estados vazios devem explicar o próximo passo.
- Navegação deve reduzir confusão entre telas parecidas.
- A experiência mobile precisa evitar campos estourados.

## Perfis De Usuário Do Sistema

Perfis operacionais do lojista:

- Proprietário.
- Administrador.
- Gerente.
- Vendedor.
- Caixa.
- Estoquista.
- Financeiro.
- Contador.
- Consulta/visualização.

Backoffice da Orien:

- Dono/operador da plataforma.
- Suporte interno.
- Financeiro interno.
- Operação da plataforma.

O backoffice não deve parecer igual ao painel do cliente lojista. Ele é uma central interna da Orien para tenants, cobranças, cupons, landing, suporte, webhooks, auditoria, saúde e equipe interna.

## Navegação Desejada

O menu lateral atual tem muitos itens e pode parecer poluído. A proposta deve simplificar com grupos recolhíveis e favoritos.

Sugestão de grupos:

- Favoritos.
- Operação: Central da Loja, PDV, Vendas, Caixa, Tarefas.
- Cadastros: Produtos, Clientes, Fornecedores, Lojas.
- Estoque e compras: Estoque, Compras, XML/NF-e de entrada, Impressoras/Etiquetas.
- Gestão: Dashboard, Financeiro, Relatórios, Fidelidade, Metas.
- Fiscal e contador: Fiscal, Espaço do contador, Documentos.
- Administração: Equipe, Permissões, Integrações, Configurações, Assinatura, Suporte.
- Plataforma Orien: só para usuários internos autorizados.

O menu deve:

- Esconder módulos sem permissão.
- Permitir favoritos editáveis.
- Destacar próxima ação útil.
- Ser confortável em desktop e mobile.
- Ter barra de rolagem visualmente discreta e elegante.

## Telas Críticas E Direção Visual

### Landing Page

Precisa parecer premium e pronta para venda.

Conteúdos desejados:

- Hero claro com teste grátis de 7 dias sem cartão.
- CTAs: começar teste grátis, falar no WhatsApp, ver planos.
- Prova visual real/sanitizada de PDV, estoque, financeiro e dashboard.
- Carrossel interativo.
- Comparativo de planos.
- Segmentos atendidos: varejo, distribuidoras, serviços e multi-lojas.
- Avaliações/depoimentos de usuários.
- Calculadora de ganho operacional.
- Como funciona: cadastro, configuração, venda e acompanhamento.
- Segurança e LGPD.
- FAQ sobre migração, leitor de código, emissão fiscal, pagamento, cancelamento.
- Termos, privacidade, reembolso/cancelamento e contato.
- Checkout com Pix e cartão.
- Cupom de desconto.

Evitar:

- Landing vazia com números ilustrativos demais.
- Visual genérico de SaaS americano.
- Blocos excessivamente grandes que escondem o produto real.

### Login

Problemas já observados:

- Precisa manter alinhamento fino.
- Campo de senha deve ter mostrar/ocultar.
- Manter conectado.
- Mensagens de sessão expirada claras.
- Visual premium, mas simples.

### Shell Autenticado

Header:

- Mostrar tenant ativo.
- Mostrar filial/escopo.
- Mostrar usuário e perfil logado.
- Busca global com Ctrl/Cmd + K.
- Notificações.
- Acesso rápido a ajuda.

Sidebar:

- Agrupada.
- Favoritos.
- Itens ativos acompanhando tema.
- Menos poluição visual.
- Scroll refinado.
- Logo Orien integrada.

### Dashboard E Central Da Loja

Existe confusão entre Visão geral e Central da Loja. A proposta deve diferenciar:

- Dashboard: análise gerencial consolidada, comparativos, metas, curva ABC, margem, giro, inadimplência, previsão de caixa.
- Central da Loja: operação do dia, caixas abertos, vendas do dia, estoque crítico, contas vencendo, operadores ativos, pendências e alertas.

Central da Loja deve ser acionável:

- “3 itens abaixo do mínimo”.
- “Caixa aberto há 9 horas”.
- “R$ X vence hoje”.
- “Compra aguardando recebimento”.
- “Operador com divergência”.

### PDV Modo Produção

Prioridade máxima.

Deve ter:

- Tela limpa e focada.
- Scanner sempre disponível.
- Busca manual ultrarrápida por nome, SKU ou código.
- Navegação por teclado com setas e Enter.
- Atalhos visíveis discretos.
- Teclado numérico.
- Troco automático.
- Forma de pagamento predefinida: Pix, Dinheiro, Cartão de Crédito, Cartão de Débito, Boleto/crediário, Outros.
- Pagamento parcial.
- Fechamento claro.
- Reimpressão.
- Comprovante térmico compacto.
- Opção de emitir NFC-e quando fiscal ativo.
- Status offline/sincronização claro.

Importante:

- PDV não pode depender apenas de leitor de código de barras.
- Scanner USB/Bluetooth funciona como teclado.
- Produto selecionado ou escaneado deve permitir quantidade prática, não um a um.

### Produtos

Cadastro atual precisa virar fluxo guiado:

- Scanner/código de barras.
- Consulta de base de produto.
- SKU automático se não existir.
- Nome, preço, custo, categoria.
- Imagem do produto com upload, preview, recorte/otimização.
- Estoque inicial.
- Dados fiscais quando necessário.

Melhorias desejadas:

- Busca de produto por código de barras em provedores.
- Confirmação humana antes de salvar dados comerciais.
- Catálogo por camadas: GS1/GTIN licenciado, bases de distribuidores, base colaborativa própria.

### Estoque, Compras E XML

Fluxo de XML/NF-e de entrada já existe e deve parecer operacional.

Desejado:

- Upload/consulta de XML.
- Tela de divergências por cor.
- Produto não cadastrado: criar produto direto no item.
- Produto cadastrado: vincular automaticamente por GTIN/SKU.
- Custo diferente: mostrar alerta.
- Quantidade suspeita: mostrar alerta.
- Fornecedor novo: criar ou vincular.
- Preço sugerido editável e persistente.
- Gerar entrada de estoque.
- Gerar contas a pagar.
- Relatório de conferência.

### Financeiro

Deve ser claro para:

- Contas a receber.
- Contas a pagar.
- Baixa manual.
- Parcelamento.
- Categorias.
- Conciliação por status.
- Fluxo de caixa.
- Vendas por forma de pagamento.
- Cancelamento, devolução e estorno.

Filtros precisam ser fortes:

- Pix.
- Cartão.
- Boleto.
- Dinheiro.
- Aberto.
- Pago.
- Vencido.
- Período.
- Loja.

### Vendas

Telas de vendas e PDV não devem parecer duplicadas.

Sugestão:

- PDV: operação de venda em tempo real.
- Vendas: histórico, gestão, comprovantes, cancelamentos, devoluções, emissão fiscal, auditoria e filtros.

Ações da venda precisam ser compactas e alinhadas:

- Ver comprovante.
- Imprimir.
- Térmico.
- Emitir NFC-e.
- Status fiscal.
- Troca/devolução.
- Histórico.
- Cancelar.

Status deve estar em português:

- Vendida.
- Cancelada.
- Parcial.
- Devolvida.
- Pendente fiscal.

### Relatórios E Documentos

Há relatórios em PDF, CSV e HTML.

Documentos devem ter identidade:

- Logo da empresa.
- Dados comerciais/fiscais.
- Identidade Orien discreta.
- Layout profissional.
- Versão para PDF grande.
- Versão térmica compacta.
- Relatórios: vendas, estoque, financeiro, gerencial.
- Comprovante de venda.
- Etiquetas com código de barras.
- E-mails operacionais.

### Fiscal

NFC-e/NF-e ainda depende de provedor fiscal. O sistema já tem modo homologação e abstração de provedor.

Precisa comunicar:

- Ambiente de homologação/produção.
- Status SEFAZ.
- Configuração fiscal por loja.
- Certificado/CSC/provedor.
- Produtos bloqueados por falta de dado fiscal.
- Aprovação do contador.
- Emissão após venda.
- Cancelamento fiscal.
- Inutilização.

Não prometer emissão fiscal final se integração ainda não estiver fechada.

### Espaço E Portal Do Contador

Área interna do lojista:

- Gerar acesso externo do contador.
- Definir e-mail autorizado.
- Definir competência inicial/final.
- Definir validade.
- Ver histórico de acessos/downloads.
- Revogar acesso.
- Gerar pacote mensal.
- Fechar competência.

Portal externo do contador:

- Login com e-mail + código.
- Consulta por competência.
- Exportação CSV/PDF/XML.
- Documentos fiscais.
- Entradas.
- Financeiro.
- Estoque baixo.
- Histórico auditável.

### Fidelidade

Deve evoluir para central orientada a resultado:

- Regras por categoria, produto, loja e período.
- Níveis: Bronze, Prata, Ouro.
- Expiração de pontos.
- Aviso antes de vencer.
- Recompensas: desconto, produto brinde, cashback/crédito e cupom.
- Resgate no PDV.
- Aprovação para valores altos.
- Trilha de auditoria.
- Painel de ROI: pontos emitidos, resgatados, clientes recorrentes e receita influenciada.
- Campanhas automáticas: aniversário, primeira compra, retorno após inatividade e metas de consumo.

### Suporte

Central de suporte do cliente:

- Abrir chamado.
- Categoria, prioridade, descrição.
- Anexos.
- Histórico de mensagens.
- Status.
- Página de origem/requestId quando houver erro.

Backoffice:

- Visualizar chamados.
- Responder.
- Acompanhar tenant.
- Notas internas.
- Auditoria.

### Integrações

Integrações existentes/planejadas:

- Asaas para assinatura SaaS e recebimentos do lojista.
- SMTP do lojista.
- Resend/SMTP da plataforma.
- WhatsApp oficial.
- Fiscal: Focus NFe ou Spedy, ainda em decisão.
- Sentry/observabilidade.

UI deve mostrar:

- Status.
- Sandbox/homologação/produção.
- Teste de conexão.
- Último erro.
- Logs.
- Reprocessar/retry quando fizer sentido.

Para usuários leigos, esconder termos técnicos demais e usar textos simples.

### Backoffice Orien

Não é o painel do lojista.

Deve ter:

- Visão geral da plataforma.
- Tenants.
- Detalhe do tenant.
- Cobrança SaaS.
- Trial/vitalício/cancelamento.
- Cupons.
- Landing page.
- Webhooks.
- Suporte.
- Equipe interna.
- Saúde operacional.
- Auditoria.
- MFA/TOTP.
- Login como suporte com trilha auditada.

Visual:

- Mais administrativo, premium, escuro ou semi-escuro.
- Não confundir com o painel do cliente.

## Problemas Visuais Já Observados

- Campos estourados no mobile.
- Tabelas e ações desalinhadas em algumas telas.
- Cards/hero informativos ocupam espaço demais em telas operacionais.
- Abas precisam indicar estado ativo com clareza e acompanhar o tema.
- Alguns termos em inglês ainda aparecem.
- Menu lateral pode parecer poluído.
- Algumas telas parecem duplicadas: PDV/Vendas, Dashboard/Central da Loja, Operações avançadas/Estratégia comercial.
- Logo de empresa em documentos precisa integrar melhor, sem recorte branco artificial.
- Upload de imagem de produto precisa de refinamento.
- Aba de impressoras precisa suportar múltiplas impressoras por loja e finalidade.
- Landing precisa parecer mais robusta e vendável.

## Restrições Técnicas Para A Proposta

- Não assumir que backend será refeito.
- Não inventar novas entidades obrigatórias sem dizer que são futuras.
- Não quebrar rotas existentes.
- Não mudar permissões.
- Não expor dados sensíveis.
- Manter arquitetura multitenant.
- O sistema precisa funcionar em desktop, notebook, tablet e mobile.
- O PWA é instalável via Chrome/Edge e navegadores compatíveis.
- O PDV precisa funcionar bem em tela de caixa.

## Padrões De Componentes Desejados

Componentes principais:

- Button.
- Input.
- Select.
- Dialog.
- Table/DataTable.
- Badge.
- Toast/notice.
- PageHeader.
- EmptyState.
- MoneyInput.
- DateRangePicker.
- PermissionGate.
- Tabs.
- Segmented controls.
- Cards métricos.
- Timeline/auditoria.
- Command palette/busca global.

Estados:

- Carregando.
- Sem dados.
- Erro amigável.
- Sessão expirada.
- Permissão negada.
- Serviço indisponível.
- Integração desconectada.
- Offline/sincronizando.

## Arquivos Importantes Do Projeto

Painel autenticado:

- `apps/web/src/app/(app)/dashboard/page.tsx`
- `apps/web/src/app/(app)/store-central/page.tsx`
- `apps/web/src/app/(app)/pos/page.tsx`
- `apps/web/src/app/(app)/sales/page.tsx`
- `apps/web/src/app/(app)/products/page.tsx`
- `apps/web/src/app/(app)/stock/page.tsx`
- `apps/web/src/app/(app)/purchases/page.tsx`
- `apps/web/src/app/(app)/financial/page.tsx`
- `apps/web/src/app/(app)/reports/page.tsx`
- `apps/web/src/app/(app)/fiscal/page.tsx`
- `apps/web/src/app/(app)/accounting/page.tsx`
- `apps/web/src/app/(app)/loyalty/page.tsx`
- `apps/web/src/app/(app)/support/page.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/integrations/page.tsx`
- `apps/web/src/app/(app)/printers/page.tsx`

Shell e navegação:

- `apps/web/src/components/app-shell.tsx`
- `packages/ui/src`

Portal externo:

- `apps/web/src/app/contador/page.tsx`

Landing e marketing:

- `apps/marketing/src/app/page.tsx`
- `apps/marketing/src/app/checkout/page.tsx`
- `apps/marketing/src/app/checkout/status/page.tsx`
- `apps/marketing/src/app/landing/page.tsx`
- `apps/marketing/src/app/testimonials/page.tsx`
- `apps/marketing/src/app/termos/page.tsx`
- `apps/marketing/src/app/privacidade/page.tsx`

Backoffice:

- `apps/admin/src`

Documentos:

- `packages/documents/src/index.ts`

## Entrega Ideal Do Stitch

O ideal é receber da Stitch:

- Um redesign visual em alta fidelidade das telas críticas.
- Um guia de tokens e componentes.
- Uma proposta de menu/navegação.
- Exemplos desktop e mobile.
- Recomendações por tela.
- Um “antes/depois” conceitual.
- Indicação do que é apenas visual e do que exigiria funcionalidade nova.

Depois disso, aplicaremos no código por blocos:

1. Tokens, tema e componentes base.
2. Shell e navegação.
3. Landing.
4. Login e onboarding.
5. PDV.
6. Dashboard/Central da Loja.
7. Vendas/financeiro/estoque/compras.
8. Fiscal/contador/documentos.
9. Backoffice.
10. QA visual e responsividade.

## Pedido Final Para A Stitch

Crie uma remodelagem visual completa, premium e operacional para a Orien. Priorize clareza, uso real em loja, velocidade no PDV, confiança nos dados, responsividade e percepção de produto maduro. Preserve a identidade da marca, mas melhore hierarquia, navegação, densidade, estados e apresentação comercial. Não altere a lógica do produto; entregue uma proposta visual implementável em React/Next/Tailwind com componentes reutilizáveis.
