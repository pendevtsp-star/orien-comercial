# Checklist de Liberacao Beta

## Bloqueadores

- [ ] Dominio, DNS e HTTPS validados externamente.
- [x] Backup automatico executado e restauracao testada.
- [x] Fluxos E2E de login, compra, estoque, PDV, venda e financeiro aprovados.
- [x] Isolamento entre tenants e filiais aprovado.
- [ ] Leitor de codigo de barras e impressora termica validados em hardware real.
- [ ] Nenhum achado critico ou alto de seguranca aberto.
- [x] Health check, monitoramento local e log de falha configurados.
- [ ] Webhook externo de alerta configurado e testado.
- [ ] Termos, privacidade e DPA revisados por assessoria juridica.
- [ ] Canal oficial de suporte publicado.

## Aceite funcional

- [ ] Checklist de onboarding conclui loja, produtos, clientes, operador, estoque e venda teste.
- [ ] Status operacional por loja exibe caixa, estoque critico, recebiveis vencidos e tarefas.
- [ ] Matriz visual de permissoes confere o acesso real de cada perfil.
- [ ] Importacao assistida baixa modelo, valida arquivo, mostra erros e importa sem gravacao parcial.
- [ ] Integracoes exibem ambiente, credencial protegida, ultimo teste e mensagem operacional.
- [ ] Proprietario administra equipe e configuracoes.
- [ ] Gerente opera apenas as filiais permitidas.
- [ ] Vendedor cadastra cliente e conclui venda sem acesso financeiro indevido.
- [ ] Caixa abre, movimenta e fecha caixa.
- [ ] Estoquista recebe compra e confere saldo.
- [ ] Financeiro baixa e concilia lancamentos.
- [ ] Etiquetas exibem nome, codigo e preco corretamente.
- [ ] Documentos usam a identidade do tenant.

## Operacao do piloto

- [x] Empresas ficticias e perfis de homologacao preparados.
- [ ] Empresa piloto, responsavel e periodo definidos.
- [ ] Massa inicial importada e validada pelo cliente.
- [ ] Treinamento curto realizado.
- [ ] Criterios de sucesso e canal de feedback definidos.
- [ ] Plano de rollback e comunicacao de incidente registrado.
