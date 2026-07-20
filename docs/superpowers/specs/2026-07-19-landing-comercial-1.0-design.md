# Landing Comercial 1.0

## Objetivo

Transformar a landing da Orien em uma experiencia comercial coesa, com prova visual do produto, conversao para teste gratuito e controle operacional pelo backoffice. A marca continua Orien: azul noite, azul real, ouro e tipografia de display apenas para titulos.

## Decisao

Adotar uma landing de pagina unica, com conteudo comercial configuravel no backoffice e estrutura visual protegida no codigo. O backoffice controla comunicacao; o codigo controla acessibilidade, seguranca, responsividade e hierarquia de conversao.

## Jornada publica

1. Hero apresenta proposta, teste de 7 dias sem cartao e CTA para checkout.
2. Prova de produto exibe capturas sanitizadas de PDV, estoque, financeiro e Central da Loja em carrossel acessivel.
3. Secoes de beneficio explicam operacao, migracao assistida, segmentos e seguranca.
4. Planos comparam usuarios, lojas, modulos, suporte e CTA contextual.
5. Prova social mostra somente depoimentos aprovados.
6. FAQ, termos, privacidade, cancelamento e canal de contato reduzem objecoes antes do checkout.

## Conteudo controlado no backoffice

O backoffice tera uma unica area "Landing" com abas simples:

### Geral

- Selo superior, titulo, descricao e CTA principal/secundario.
- Texto do teste gratuito, mensagem de WhatsApp e numero publicado.
- URL de demonstracao, quando houver.

### Prova do produto

- Ordem e visibilidade dos quatro slides oficiais: PDV, estoque, financeiro e Central da Loja.
- Titulo, descricao, legenda e imagem sanitizada por slide.
- Imagens so podem ser publicadas apos validacao de formato, tamanho e ausencia de dados de clientes reais.

### Planos e conversao

- Visibilidade, destaque, descricao curta e CTA dos planos cadastrados.
- Texto de apoio de checkout/trial e selo de confianca.
- Nenhum preco ou limite e aceito apenas no frontend: a fonte continua o catalogo de planos da API.

### Prova social

- Exibir/ocultar secao, titulo e texto de contexto.
- Depoimentos aprovados, ordem, destaque e foto opcional.
- Nenhum depoimento e publicado sem autorizacao registrada.

### Secoes e rodape

- Visibilidade e textos de migracao, segmentos, seguranca, FAQ e CTA final.
- Links de termos, privacidade, cancelamento e contato.
- WhatsApp fica oculto quando nao ha numero configurado.

## Guardrails

- O backoffice nao edita CSS, HTML arbitrario ou scripts.
- URLs passam por allowlist de protocolo HTTPS; imagens passam por upload sanitizado.
- Conteudo tem limites de tamanho, preview e historico de configuracao.
- Alteracoes registram ator, data e versao; publicacao permite restaurar uma versao anterior.
- A landing usa defaults seguros se a API estiver indisponivel.

## Capturas sanitizadas

- Capturar somente tenant demonstracao local, sem PII, documentos reais, dados de pagamento ou tokens.
- Aplicar dados realistas ficticios e revisar manualmente antes de publicar.
- Otimizar para WebP/AVIF, com `alt` editorial e fallback grafico.

## UX e responsividade

- Hero orientado a conversao, sem excesso de metricas decorativas.
- Carrossel navegavel por botoes, teclado, toque e indicadores; respeita `prefers-reduced-motion`.
- Comparativo de planos vira tabela horizontal navegavel no desktop e cartoes comparaveis no mobile.
- CTA persistente no mobile apenas quando nao cobrir conteudo ou controles do navegador.

## Contrato tecnico

- Evoluir `platform_landing_settings` mantendo compatibilidade com valores existentes.
- Expor apenas configuracao publica sanitizada em `GET /public/landing`.
- Usar endpoint autenticado de backoffice para leitura, preview, salvamento, publicacao e restauracao.
- Preservar o fluxo de checkout atual: trial de 7 dias sem cartao; pagamento posterior via checkout do Asaas.

## Testes e verificacao

- Testes de API para sanitizacao, defaults, publicacao e rollback de configuracao.
- Testes de componente para CTA, secoes desativadas, carrossel e acessibilidade por teclado.
- Build, lint, typecheck, testes do workspace e QA visual local em desktop e mobile.
- Nenhuma publicacao no GitHub ou VPS sem autorizacao explicita apos a validacao.

## Fora do escopo

- Redesign vindo do Stitch: sera aplicado como camada visual posterior, sem alterar o contrato de conteudo.
- Integrações externas (Sentry, WhatsApp oficial, email corporativo, provedor fiscal) permanecem fora desta rodada.
