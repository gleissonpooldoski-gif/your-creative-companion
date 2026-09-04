# Serviço real de mineração do Telegram (MTProto)

A busca real dentro do Telegram exige uma conexão contínua com os servidores do
Telegram, que o servidor do app (serverless) não consegue abrir. Por isso este
serviço roda em uma máquina sua (VPS, Docker, Fly.io, Railway, Render) e o app
fala com ele por HTTPS. Sem este serviço no ar, a mineração mostra "não
configurado" — nunca dados inventados.

- Linguagem: Node.js 20 (ESM), Express 4
- Biblioteca MTProto real: `telegram` (GramJS)
- Entrypoint: `server.js` (helpers puros em `lib.js`)
- Porta: `8081` (variável `PORT`)
- Sessões: arquivos `0600` em `SESSION_DIR` (volume persistente)

## 1. Criar o app no Telegram

1. Acesse https://my.telegram.org → **API development tools**.
2. Crie um app e guarde `api_id` e `api_hash`.

## 2. Configurar `.env`

```bash
cd services/mtproto-worker
cp .env.example .env
```

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `TELEGRAM_API_ID` | sim | id do app do Telegram |
| `TELEGRAM_API_HASH` | sim | hash do app (só no servidor) |
| `MT_PROTO_WORKER_TOKEN` | sim | token que o app usa para falar com o serviço |
| `PORT` | não (8081) | porta HTTP |
| `NODE_ENV` | não | `production` em produção |
| `SESSION_DIR` | não | pasta persistente das sessões |

Gere o token com `openssl rand -hex 32`. O `.env` está no `.gitignore` — nunca
comite valores reais.

## 3. Executar localmente

```bash
npm install
npm start
curl http://localhost:8081/health
```

## 4. Executar com Docker

```bash
docker compose up -d --build
docker compose logs -f
```

O volume `reelyx-sessions` guarda as sessões: reiniciar o container, atualizar a
imagem ou reiniciar o servidor **não** exige novo login. `restart: unless-stopped`
sobe o serviço junto com a máquina e o healthcheck monitora `/health`.

## 5. Verificar saúde

```bash
curl -s https://SEU-DOMINIO/health
# {"ok":true,"api_configured":true,"sessions":1,"version":"1.1.0"}
```

`api_configured: false` significa API ID/HASH ausentes no `.env`.

## 6. HTTPS

Publique atrás de Caddy, Nginx ou Cloudflare Tunnel. O app só aceita `https://`
(exceto `localhost` em testes).

## 7. Ligar no app

No app: **Configurações → Contas do Telegram para mineração**

1. Informe a URL pública e o token → **Testar conexão**.
2. Informe apelido e telefone → **Enviar código do Telegram**.
3. Digite o código; se houver verificação em duas etapas, informe a senha.
4. A conta aparece como **connected** e passa a ser usada pela mineração.
5. Em **Mineração de grupos**, escolha "Telegram real" (ou "automático").

## 8. Testar a busca manualmente

```bash
curl -s https://SEU-DOMINIO/v1/search \
  -H "Authorization: Bearer $MT_PROTO_WORKER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"<connectionId>","keywords":["marketing"],"limit":5}'
```

## 9. Problemas comuns

| Situação | O que fazer |
| --- | --- |
| `FLOOD_WAIT` | o Telegram pediu espera; o app registra o prazo e a fila continua depois. Não insista antes disso. |
| `INVALID_SESSION` | remova a conta no app e conecte novamente. |
| `AUTH_REQUIRED` | login não concluído; refaça telefone → código. |
| `UNAUTHORIZED` | token do serviço diferente do configurado no app. |
| Worker offline | `docker compose ps` / `docker compose logs -f`. |

## 10. Checklist de produção

- [ ] HTTPS válido, sem porta sem TLS exposta.
- [ ] `MT_PROTO_WORKER_TOKEN` longo e exclusivo; rotacione se houver suspeita.
- [ ] Volume de sessões privado, com backup criptografado.
- [ ] Uma conta por número real; não use contas de terceiros.
- [ ] Fila do app agendada (`/api/public/cron/process-queue`).
- [ ] Logs monitorados; eles nunca registram código, senha, sessão ou api_hash.

## Contrato HTTP usado pelo app

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/health`, `/v1/health` | estado do serviço e se API ID/HASH existem |
| POST | `/v1/sessions` | cria/reaproveita o espaço da sessão |
| POST | `/v1/sessions/:id/send-code` (alias `/telegram/connect/start`) | Telegram envia o código |
| POST | `/v1/sessions/:id/sign-in` (alias `/telegram/connect/verify`) | confirma o código |
| POST | `/v1/sessions/:id/password` (alias `/telegram/connect/2fa`) | confirma a senha 2FA |
| GET | `/v1/sessions/:id` | estado da sessão (telefone mascarado, última conexão) |
| DELETE | `/v1/sessions/:id` | encerra e apaga a sessão |
| POST | `/v1/search` (alias `/telegram/discover`) | busca real; devolve só supergrupos públicos |

Todas as rotas, exceto o healthcheck, exigem `Authorization: Bearer <token>`.
Erros usam `{"error":{"code","message","retry_after_seconds?"}}` com os códigos
`UNAUTHORIZED`, `AUTH_REQUIRED`, `INVALID_CODE`, `PASSWORD_REQUIRED`,
`INVALID_PASSWORD`, `INVALID_SESSION`, `FLOOD_WAIT`, `RATE_LIMITED`,
`TELEGRAM_ERROR`, `DISCOVERY_ERROR`, `TIMEOUT`, `SERVICE_ERROR`. Nunca há stack
trace, sessão, código, senha ou api_hash nas respostas.
