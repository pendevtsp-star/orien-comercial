# Operacao do beta privado

## Responsaveis

- Produto: recebe feedback, prioriza correcoes e comunica mudancas.
- Operacao: acompanha health check, backup, uso de disco e disponibilidade.
- Suporte: registra solicitacoes com tenant, usuario, horario, rota e `requestId`.

## Incidente

1. Confirme `https://api.useorien.com.br/health` e os containers em `docker compose ps`.
2. Preserve o `requestId`, o horario e a acao realizada; nao solicite senhas ou tokens ao usuario.
3. Se houver risco de dados, suspenda apenas o fluxo afetado, gere backup e registre a decisao.
4. Corrija em ambiente isolado, execute testes e faça deploy reversivel.
5. Comunique impacto, acao tomada e proximo prazo aos participantes afetados.

## Rollback

O rollback de aplicacao usa a imagem/commit anterior, sem remover volumes. Banco so pode receber rollback por migration explicitamente aprovada; nunca use `down -v`, `reset --hard` ou restaure backup sobre producao sem uma janela de incidente documentada.

## Feedback

Registre: perfil, empresa, dispositivo, fluxo, resultado esperado, resultado observado, screenshot e `requestId`. Classifique em bloqueante, alto, medio ou melhoria.
