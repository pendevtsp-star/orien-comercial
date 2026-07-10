# Deploy VPS Orien

## Estrutura isolada

```text
/srv/apps/orien_comercial/
  app/       # clone do repositorio
  data/      # volumes PostgreSQL e Redis
  backups/   # dumps e arquivos de restore
  ops/       # configuracao instalada do Nginx
```

O stack de producao fica em `app/docker-compose.prod.yml`. Banco e Redis nao
publicam portas. Apenas API, painel e marketing escutam em loopback para o
Nginx local, nas portas 3334, 3100 e 3101.

## Pre-requisitos

1. Criar registros A para `useorien.com.br`, `app.useorien.com.br` e
   `api.useorien.com.br`, apontando para a VPS.
2. Copiar `.env.production.example` para `.env` no servidor e substituir todos
   os valores de exemplo por segredos exclusivos.
3. Configurar o repositorio privado no servidor por deploy key ou fazer o clone
   inicial por uma sessao autenticada.

## Primeira subida

```bash
cd /srv/apps/orien_comercial/app
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml --profile bootstrap run --rm seed
```

Instale `ops/nginx/orien.http.conf` como um site Nginx somente depois da
propagacao DNS. Valide com `nginx -t` antes de recarregar o servico. Em seguida,
emita os certificados TLS para os tres dominios e teste login, refresh e CRUD
com o painel publico.

## Operacao

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U sgc_owner sgc > ../backups/sgc-$(date +%F).sql
```

Nao use `docker compose down -v` neste ambiente: isso pode remover dados do
banco persistido.

## Preview temporario por IP

Enquanto os dominios nao apontam para a VPS, use `.env.preview.example` como
base para o `.env` do servidor. Ele publica somente para teste visual:

- painel: `http://187.127.37.208:3100`
- landing: `http://187.127.37.208:3101`
- API: `http://187.127.37.208:3334/api/v1`

Esse modo define `COOKIE_SECURE=false` para permitir login por HTTP. Ele nao
deve continuar em uso depois que TLS for ativado.
