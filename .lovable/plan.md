# Corrigir mineração real de grupos

## Diagnóstico confirmado

- O clique cria corretamente um registro em `group_mining_jobs` e outro em `queue_jobs`.
- Os trabalhos observados estão `pending`, com `attempts = 0` e sem `locked_at`: nenhum worker chegou a reivindicá-los.
- O processador existe em `/api/public/cron/process-queue`, mas não há agendamento ativo no banco; portanto, hoje ele só roda quando o endpoint é chamado manualmente.
- O provider automático depende exclusivamente de `GROUP_DIRECTORY_API_URL` e `GROUP_DIRECTORY_API_KEY`, que não estão configurados. A importação manual já chega ao provider de referências, mas também depende de o worker ser acionado.

## Implementação

### 1. Configuração segura e substituível do provider

- Criar uma configuração de descoberta por workspace, separada dos dados públicos, com URL, chave criptografada, estado da conexão, último teste e erro sanitizado.
- Manter a chave acessível apenas no servidor; nunca retorná-la ao navegador, logs ou respostas.
- Resolver o provider nesta ordem: configuração segura do workspace; variáveis de ambiente existentes como compatibilidade.
- Validar URL HTTPS e padronizar respostas externas sem inventar campos ausentes.

### 2. Teste real da conexão

- Adicionar funções autenticadas para consultar o estado, salvar/remover configuração e testar a conexão.
- O teste fará uma requisição real com timeout e classificará: conectado, chave inválida, URL inválida, timeout ou erro externo sanitizado.
- Adicionar “Descoberta de grupos” em Configurações, com URL, chave mascarada, estado e botão “Testar conexão”.

### 3. Garantir execução da fila

- Preservar `queue_jobs`, `claim_queue_jobs`, retry, backoff e watchdog.
- Após criar um trabalho pela interface, acionar o processador no servidor para não depender de um agendador inexistente no ambiente atual.
- Manter o endpoint cron para processamento contínuo e campanhas.
- Sincronizar falhas terminais da fila com o trabalho de mineração, para nenhum trabalho permanecer pendente indefinidamente e o motivo ficar visível.

### 4. Progresso e histórico reais

- Ampliar o trabalho de mineração com provider, etapa/mensagem, progresso, tentativa e duração.
- Atualizar os contadores durante descoberta e validação, não apenas ao final.
- Suportar `pending`, `processing`, `completed`, `completed_with_errors`, `failed` e `cancelled`.
- Exibir estado legível, erro, provider, tentativas, duração e detalhe expansível nos trabalhos recentes.

### 5. Importação manual completa

- Separar visualmente “Provider automático” e “Importação manual”.
- Aceitar texto colado e arquivos TXT/CSV no navegador, enviando somente as referências normalizadas ao servidor.
- Processar referências pela mesma fila, validação pública, deduplicação, classificação e persistência usadas pela descoberta automática.
- Referências não validáveis serão contabilizadas como inválidas com motivo real; nenhum grupo será inventado.

### 6. Campanhas e preflight

- Preservar destinos e envio atuais.
- Completar o preflight antes do início: destinos persistidos, mensagem, ritmo, conta autorizada online e credencial real de envio.
- Bloquear o início com um motivo objetivo quando algo faltar; só confirmar envio após resposta do Telegram.

## Segurança e dados

- Migração incremental, sem recriar tabelas existentes.
- Manter RLS e isolamento por workspace; a tabela de credenciais não terá acesso direto pelo navegador.
- Registrar usuário, provider, início/fim, status, contadores, erros e tentativas sem registrar segredos.
- Preservar a chave canônica única de grupos e todas as regras existentes de campanha/fila.

## Verificação

- Testes unitários do adapter: configurado, ausente, resposta, vazio, erro, timeout e retry.
- Testes de importação: link, username, duplicação, inválido, TXT e CSV.
- Testes de transições do trabalho, watchdog e retry.
- E2E com provider de teste isolado, persistência real, deduplicação, campanha, preflight, fila e confirmação de envio controlada somente no ambiente de teste.
- Executar testes existentes e novos, typecheck, build e validação visual da tela autenticada.
