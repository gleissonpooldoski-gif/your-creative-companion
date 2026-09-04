# Serviço de mineração real do Telegram (MTProto)

A busca real dentro do Telegram exige uma conexão contínua com os servidores do
Telegram, que o servidor do app (serverless) não consegue abrir. Por isso este
pequeno serviço roda em uma máquina sua (VPS, Docker, Fly.io, Railway) e o app
fala com ele por HTTPS. Sem este serviço no ar, a mineração pelo Telegram mostra
"não configurado" — nunca dados inventados.

## 1. Credenciais do Telegram

1. Acesse https://my.telegram.org → **API development tools**.
2. Crie um app e guarde `api_id` e `api_hash`.
3. Escolha um token forte para o serviço (ex.: `openssl rand -hex 32`).

## 2. Subir o serviço

```bash
cd services/mtproto-worker
npm install

export TELEGRAM_API_ID=123456
export TELEGRAM_API_HASH=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export MTPROTO_SERVICE_TOKEN=<token forte>
export SESSION_DIR=/data/sessions   # volume privado e persistente
npm start
```

Com Docker:

```bash
docker build -t reelyx-mtproto services/mtproto-worker
docker run -d --name reelyx-mtproto -p 8081:8081 \
  -e TELEGRAM_API_ID=123456 \
  -e TELEGRAM_API_HASH=xxxxxxxx \
  -e MTPROTO_SERVICE_TOKEN=<token forte> \
  -v reelyx-sessions:/data reelyx-mtproto
```

Publique o serviço atrás de HTTPS (Caddy, Nginx, Cloudflare Tunnel). O app exige
`https://` (exceto `localhost` em testes).

## 3. Ligar no app

No app: **Configurações → Contas do Telegram para mineração**

1. Informe a URL pública do serviço e o token.
2. Clique **Testar conexão** (verifica também se API ID/HASH estão no serviço).
3. Informe apelido e telefone → **Enviar código do Telegram**.
4. Digite o código recebido no Telegram; se a conta tiver verificação em duas
   etapas, informe a senha.
5. A conta aparece como **connected** e passa a ser usada pela mineração.

## 4. Checklist de produção

- [ ] HTTPS válido no serviço, sem porta aberta publicamente sem TLS.
- [ ] `MTPROTO_SERVICE_TOKEN` longo e exclusivo; rotacione se houver suspeita.
- [ ] Volume de sessões (`SESSION_DIR`) privado, com backup criptografado.
- [ ] Uma conta por número real; contas de terceiros não devem ser usadas.
- [ ] Respeite os limites do Telegram: o app registra a espera (FloodWait) pedida
      pelo Telegram e não insiste antes do prazo.
- [ ] Agende o processamento da fila (`/api/public/cron/process-queue`) para os
      jobs rodarem sozinhos.
- [ ] Monitore os logs do serviço; ele nunca registra código, senha ou sessão.

## Contrato HTTP usado pelo app

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/v1/health` | Estado do serviço e se API ID/HASH existem |
| POST | `/v1/sessions` | Cria/reaproveita o espaço da sessão |
| POST | `/v1/sessions/:id/send-code` | Telegram envia o código de login |
| POST | `/v1/sessions/:id/sign-in` | Confirma o código |
| POST | `/v1/sessions/:id/password` | Confirma a senha de duas etapas |
| GET | `/v1/sessions/:id` | Estado da sessão |
| DELETE | `/v1/sessions/:id` | Encerra e apaga a sessão |
| POST | `/v1/search` | Busca real; devolve só supergrupos públicos |

Erros usam `{"error":{"code","message","retry_after_seconds?"}}` com os códigos
`UNAUTHORIZED`, `AUTH_REQUIRED`, `INVALID_CODE`, `PASSWORD_REQUIRED`,
`INVALID_PASSWORD`, `FLOOD_WAIT`, `RATE_LIMITED`, `SERVICE_ERROR`.
