# Operacao do Conteudo da Landing

Use esta lista no ambiente autenticado do backoffice antes de publicar uma alteracao de conteudo.

## Checklist manual

- [ ] Abra `/landing` como operador autenticado. Confirme a carga do rascunho e as seis abas: Geral, Produto, Planos, Prova social, Secoes e rodape e Historico.
- [ ] Simule a falha de `GET /platform/landing`. Confirme que o editor permanece bloqueado, exibe uma mensagem operacional e nao apresenta acoes de salvar ou publicar com valores iniciais.
- [ ] Simule a falha de `GET /platform/landing/revisions` com o rascunho valido. Confirme que o editor continua disponivel, a aba Historico mostra erro legivel e Atualizar historico permite nova tentativa com indicador de carregamento.
- [ ] Em Geral, altere titulo, texto de teste e e-mail de suporte. Salve, recarregue a pagina e confirme que o rascunho permanece.
- [ ] Limpe um campo obrigatorio, use copy com markup ou informe e-mail invalido. Confirme a mensagem proxima ao campo e que o salvamento nao envia requisicao.
- [ ] Edite uma CTA, CTA final, link de rodape ou URL de imagem com `javascript:alert(1)`, `//host`, barra invertida ou URL com `%2f`. Confirme que a mensagem do campo bloqueia o salvamento.
- [ ] Em Produto, adicione um slide valido com titulo, descricao, texto alternativo e URL permitida. Altere sua visibilidade, salve e confirme que o limite de quatro slides impede uma quinta inclusao.
- [ ] Em Planos, altere o plano destacado e os tres rotulos de CTA. Confirme que nao ha campos de preco, limite, modulo ou slug.
- [ ] Em Prova social, altere o titulo e a visibilidade. Confirme que a moderacao continua acessivel pela tela de depoimentos.
- [ ] Em Secoes e rodape, altere todas as visibilidades independentes, CTA final e links de rodape. Salve o rascunho e confirme a mensagem de sucesso.
- [ ] Depois de qualquer edicao local, confirme que Publicar alteracoes fica bloqueado com a orientacao para salvar primeiro. Salve e confirme que a publicacao volta a ficar disponivel.
- [ ] Clique em Visualizar e confirme que a URL de marketing abre em nova aba, sem navegar o backoffice atual.
- [ ] Clique em Publicar alteracoes e cancele a confirmacao. Confirme que nenhuma mensagem de publicacao aparece. Em seguida confirme a publicacao e valide a mensagem de sucesso.
- [ ] Abra Historico. Confirme que a nova revisao mostra data, operador quando disponivel e titulo da hero.
- [ ] Clique em Restaurar esta versao e cancele. Confirme que nenhuma alteracao acontece. Confirme a restauracao, verifique que o rascunho efetivo foi recarregado, o dirty state foi limpo e a lista de revisoes foi atualizada.
- [ ] Durante uma resposta 2xx malformada da API, confirme que a tela mostra estado operacional legivel e nao derruba o React.

## Limites do contrato

O JSON versionado normaliza copy sem markup, URLs internas ou HTTPS e imagens com a mesma regra de URL segura. O documento publico inclui hero, texto de teste, e-mail de suporte, slides, apresentacao de planos, titulo de prova social, visibilidades, CTA final e links de rodape; metadados `admin` nunca sao retornados publicamente.

Precos, limites, modulos e slugs de planos continuam sob responsabilidade do codigo e catalogo de planos. Os links de rodape sao limitados a quatro itens e os slides a quatro itens.
