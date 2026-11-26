# Ponte

Comunidade aberta que conecta **profissionais experientes** (mentores e empresas)
a pessoas em **inicio de carreira ou transicao** — em qualquer idade.

## Funcionalidades (MVP)

- **Novo:** tres acessos (Sou Mentor / Sou Mentorado / Sou Empresa), perfis detalhados
  (ferramentas, areas, tipos de ajuda, disponibilidade, modalidade e dados da empresa), busca
  de mentores e mentorados por compatibilidade explicavel, projetos particulares, open source,
  educacionais e empresariais (com candidaturas e privacidade), metas com etapas e feedback,
  notificacoes e filtros e detalhes de eventos. Veja "Jornada educacional" no roteiro de testes.

- **Cadastro com aprovacao**: mentores e mentorados solicitam acesso com nome,
  email e senha; o administrador aprova antes do primeiro login.
- **Tres papeis**: mentor, mentorado e empresa (empresas tambem podem mentorar).
- **Rede de mentoria**: mentorados solicitam mentoria; mentores aceitam/recusam.
  Um mentorado pode ter varios mentores.
- **Contribuicoes publicas**: mentorados publicam projetos, PRs open source,
  palestras e eventos no perfil publico.
- **Recomendacoes**: mentores recomendam contribuicoes de mentorados da sua rede —
  evidencia real para o mercado.
- **Busca de talentos**: empresas (e qualquer visitante) buscam mentorados por
  habilidade, ordenados por recomendacoes.
- **Quadro de oportunidades**: mentores e empresas publicam vagas, eventos e
  projetos open source — inclusive para colaboracao entre mentores.
- **Eventos completos**: mentores e empresas criam eventos online, presenciais
  ou hibridos, com vagas, aprovacao manual, lista de espera, check-in e
  confirmacao voluntaria de chegada em casa.
- **Mentoria operavel**: mentorados registram disponibilidade; pares ativos
  agendam encontros; mentores podem cadastrar um mentorado com senha temporaria
  que deve ser trocada no primeiro acesso.
- **Certificados verificaveis**: organizadores emitem certificado para quem fez
  check-in, com uma pagina publica de validacao por codigo.
- **Privacidade por evento**: inscricao exige ciencia do aviso de privacidade;
  comunicacoes e uso de imagem sao consentimentos separados e opcionais.
- **Perfil publico por aceite**: nome, resumo, bio, habilidades, rede e
  contribuicoes so aparecem publicamente quando a pessoa aceita essa
  visibilidade; o aceite pode ser revogado no painel.
- **Perfis publicos**: qualquer pessoa pode ver perfis, redes e contribuicoes.

## Como a plataforma funciona

### Perfis e responsabilidades

| Perfil | O que pode fazer |
| ------ | ---------------- |
| Administrador | Analisa e aprova cadastros de mentores e mentorados em `/admin`. |
| Mentor | Aceita solicitacoes, cria mentorados manualmente, agenda mentorias, cria e opera eventos e emite certificados. |
| Mentorado | Mantem disponibilidade, pode ter varios mentores, solicita mentoria e pede acesso a eventos. |
| Empresa | Atua como organizadora/mentora, publica oportunidades e cria eventos. |

O relacionamento de mentoria e muitos-para-muitos: um mentorado pode estar
vinculado a varios mentores e participar de varios eventos.

### Eventos

Eventos podem ser **online**, **presenciais** ou **hibridos**. Ao criar um
evento, o organizador informa horario, vagas (opcional), se a aprovacao e
manual, link online e/ou endereco presencial.

- Eventos com vagas esgotadas encaminham novas solicitacoes para lista de espera.
- Organizadores aprovam ou recusam solicitacoes quando a aprovacao manual foi
  habilitada.
- O check-in e registrado pelo organizador no painel.
- Em encontros presenciais ou hibridos, o participante pode confirmar
  voluntariamente que chegou bem em casa. A plataforma nao rastreia sua
  localizacao.
- Certificados so podem ser emitidos para participantes com check-in e sao
  verificaveis publicamente por um codigo unico em `/certificados/<codigo>`.

### Mentoria e primeiro acesso

O mentor pode criar um mentorado manualmente no painel com nome, email e senha
temporaria. Essa senha deve ser enviada fora da plataforma por um canal seguro;
no primeiro login a pessoa e direcionada para definir sua propria senha antes
de acessar qualquer funcionalidade autenticada.

Mentorados informam faixas semanais de disponibilidade. Somente mentores com
vinculo de mentoria ativo podem usá-las para facilitar o agendamento de
encontros.

### Privacidade e seguranca

A inscricao em evento registra a ciencia do aviso de privacidade. Os
consentimentos para receber comunicacoes e para uso de imagem sao opcionais e
separados do aceite necessario para gerir a inscricao.

O perfil publico tambem exige aceite expresso: somente nome, resumo, bio,
habilidades, rede e contribuicoes podem aparecer para visitantes. Email,
disponibilidade, presencas, anotacoes e consentimentos continuam privados. A
pessoa pode desativar a visibilidade no editor do proprio perfil.

- Cada acao sensivel valida sessao, papel e propriedade do recurso no servidor.
- Senhas usam `scrypt`; sessoes usam cookies `httpOnly` com expiração.
- Acoes administrativas relevantes (eventos, presenca, certificados,
  disponibilidade e cadastro manual) sao registradas em auditoria.
- Os dados de eventos incluem apenas o necessario para inscricao, presenca e
  certificacao. Consulte `/privacidade` para os controles e finalidades
  comunicados ao participante.

## Stack

- Next.js (App Router) + React + Tailwind CSS
- Banco de dados (`src/lib/sql.ts`): **PostgreSQL** quando `DATABASE_URL` esta definida
  (producao/Vercel com Neon) e **SQLite** via `node:sqlite` (Node 24+) quando nao esta (local, sem
  instalar nada). As consultas sao as mesmas nos dois bancos.
- Autenticacao propria: senha com scrypt + sessao por cookie httpOnly

## Rodando local

```bash
npm install
npm run dev
# http://localhost:3000
```

Sem `DATABASE_URL`, o banco SQLite `data/ponte.db` e criado e populado com dados de demo na
primeira execucao. Para usar PostgreSQL localmente:

```bash
docker run -d --name ponte-pg -e POSTGRES_PASSWORD=ponte -e POSTGRES_DB=ponte -p 5432:5432 postgres:16
DATABASE_URL=postgres://postgres:ponte@localhost:5432/ponte npm run dev
```

As tabelas, as colunas novas e os dados de demo sao criados automaticamente no primeiro acesso. Para comecar do zero, apague a pasta `data/`. Para desativar o
seed de demo (ex.: deploy real), use `SEED_DEMO=0`.

Para rodar em modo producao (`output: "standalone"`, mesmo do Dockerfile):

```bash
npm run build
npm start   # node .next/standalone/server.js em localhost:3000
```

## Admin e convites

A pagina `/admin` e protegida por credenciais definidas em `.env.local`
(nao commitado):

```bash
ADMIN_EMAIL=voce@exemplo.com
ADMIN_PASSWORD=sua-senha
GOOGLE_CLIENT_ID=...        # Google Cloud Console > Credentials
GOOGLE_CLIENT_SECRET=...
BASE_URL=http://localhost:3000
```

No `/admin`, o administrador analisa os cadastros pendentes e aprova ou recusa
cada mentor e mentorado. Uma conta pendente nao consegue fazer login.

Os convites Google existentes permanecem como fluxo legado para contas que ja
usavam OAuth; o fluxo recomendado para novos participantes e o cadastro direto
com aprovacao administrativa.

Mentores tambem podem criar, no painel, um acesso de mentorado por nome,
email e senha temporaria. A senha deve ser enviada pelo mentor em canal seguro;
a plataforma exige que ela seja alterada no primeiro login.

Para criar as credenciais do Google: Cloud Console > APIs & Services >
Credentials > Create OAuth client ID > Web application, com redirect URI
`<BASE_URL>/auth/google/callback`.

## Seguranca, amigos e administracao

### Quem deve usar cada acesso

- **Amigos e participantes:** devem solicitar uma conta individual como mentor
  ou mentorado e aguardar aprovacao. Um mentor tambem pode cadastrar um
  mentorado com senha temporaria; mesmo assim, o administrador precisa aprovar
  a conta. Nunca compartilhe contas demo nem a senha de administrador.
- **Mentores e empresas:** usam suas contas individuais para operar mentorias e
  eventos.
- **Administrador:** usa exclusivamente `/admin` para aprovar ou recusar
  cadastros. Esse acesso e para o responsavel pela plataforma, nao para
  participantes.

### Configurar o login administrativo

O login de administrador ja esta implementado e continua usando as variaveis
privadas abaixo. Defina valores fortes em `.env.local` no desenvolvimento e no
painel da Vercel em producao:

```bash
ADMIN_EMAIL=admin@seudominio.com
ADMIN_PASSWORD=uma-senha-longa-unica-e-privada
```

Depois, entre em `/admin` com esse email e essa senha. Os dois fatores sao
obrigatorios: no primeiro acesso o site abre **Admin -> Seguranca** para ler o
QR code num aplicativo de codigos (Google Authenticator, Microsoft
Authenticator) e guardar os codigos de recuperacao. O resto do painel so abre
depois disso, e os acessos seguintes pedem o codigo de 6 digitos. O login do
admin recusa novas senhas depois de 5 erros do mesmo IP em 15 minutos ou de 20
erros em 1 hora somando todos os IPs. Emergencia (perdeu o celular e os codigos
de recuperacao): `ADMIN_2FA_RESET=1` na Vercel libera o painel so com a senha;
remova a variavel e ative os dois fatores de novo logo depois.

**Nao coloque os valores
reais no README, no Git, em mensagens de grupo ou no site publico.** Na Vercel,
as variaveis de ambiente ficam protegidas no projeto e devem ser configuradas
para Preview e Production.

### Como liberar amigos para testar

1. Entre como mentor no painel.
2. Em **Adicionar mentorado**, informe nome, email e uma senha temporaria de
   pelo menos dez caracteres.
3. Envie essa senha somente para a pessoa correspondente, em mensagem privada.
4. No `/admin`, aprove o cadastro em **Cadastros aguardando aprovacao**.
5. No primeiro acesso, ela cria a propria senha e aceita as condicoes de
   participacao, o Codigo de Conduta e, se quiser, a autorizacao de imagem.
6. A pessoa ja pode informar disponibilidade, solicitar eventos e participar de
   mentorias.

### Publicar na Vercel (com PostgreSQL/Neon)

Este e o deploy oficial da Ponte: **https://aponte-eight.vercel.app**, projeto `aponte` na Vercel,
com o banco no Neon. Todo push para a `main` do repositorio `monica1602/aponte` publica em producao;
push para outros branches gera so uma previa (preview), sem mudar o site. Os logs ficam em
**Vercel → projeto `aponte` → Logs**.

Na Vercel o banco precisa ser PostgreSQL: o disco das funcoes serverless e temporario. Sem
`DATABASE_URL`, o app usa SQLite em `/tmp` apenas como demonstracao (os dados se perdem).

1. Em **vercel.com → Add New → Project**, importe o repositorio.
2. Antes do primeiro deploy (ou depois, em **Storage**), clique em **Create Database → Neon**
   e conecte ao projeto. A Vercel cria a variavel `DATABASE_URL` automaticamente.
3. Em **Settings → Environment Variables**, cadastre `ADMIN_EMAIL` e `ADMIN_PASSWORD`
   (para acessar `/admin`). Os cadastros sao liberados na hora; para exigir aprovacao manual, use `REQUIRE_APPROVAL=1`. Opcional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   e `BASE_URL`. Para nao criar as contas de demo em producao, use `SEED_DEMO=0`.
4. Para o "Esqueci minha senha" enviar e-mails, crie uma conta gratuita no Resend e cadastre
   `RESEND_API_KEY` (e, com dominio verificado, `EMAIL_FROM`, ex.: `Ponte <nao-responda@seudominio.com>`).
   Sem a chave, o link de redefinicao aparece apenas no log do servidor.
   Com `BREVO_API_KEY` (chave de API do Brevo, `xkeysib-...`), todos os e-mails saem pelo Brevo, com o
   remetente de `BREVO_SENDER` em `src/lib/mail.ts`; sem ela, continuam pelo Resend.
   Para avisar o administrador no WhatsApp (novos cadastros, mentorias, convites, candidaturas,
   projetos e atualizacoes de perfil), cadastre `ADMIN_WHATSAPP` (numero com DDI, ex.: `5511999999999`)
   e `CALLMEBOT_API_KEY` (chave gratuita do CallMeBot). As mensagens levam so nomes, sem e-mails.
   Os mesmos avisos vao por e-mail para `ADMIN_ALERT_EMAIL` quando `RESEND_API_KEY` estiver configurada.
   Para os PDFs de certificado sairem com assinatura digital da Ponte, cadastre
   `CERTIFICATE_SIGNING_P12` (arquivo `.p12` do certificado em base64) e
   `CERTIFICATE_SIGNING_PASSWORD` (senha do arquivo). Sem elas, o PDF sai sem assinatura.
   Para gerar um certificado proprio (sem ICP-Brasil), com validade de 10 anos:
   `openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout chave.pem -out cert.pem -subj "/C=BR/O=Ponte/CN=Ponte - Plataforma educacional"`,
   depois `openssl pkcs12 -export -inkey chave.pem -in cert.pem -name Ponte -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 -out ponte.p12`
   e `base64 -w0 ponte.p12`.
5. Faca o deploy (ou **Redeploy** apos criar o banco). As tabelas e os dados de demo sao
   criados no primeiro acesso.
5. Para login com Google, adicione `https://SEU-DOMINIO/auth/google/callback` como URI de
   redirecionamento no Google Cloud.

As acoes de cadastro, eventos, presenca e certificados validam usuario, papel
e propriedade no servidor. Senhas sao protegidas com `scrypt`, sessoes usam
cookies `httpOnly`, e acoes operacionais relevantes entram no log de auditoria.

### Ambientes: desenvolvimento, previa e producao

| Ambiente | Onde | Banco | Quem acessa | Envia e-mail e WhatsApp |
|---|---|---|---|---|
| Desenvolvimento | Computador, CI e testes (`npm run dev`, `npm test`, `npm run test:e2e`) | SQLite local ou PostgreSQL vazio, com dados de demonstracao | Quem roda | Nao (sem chaves; os testes usam um simulador local) |
| Previa (preview) | Vercel, a cada push para um branch que nao e a `main` | 2o banco do Neon (`ponte-preview`), so com dados de demonstracao | So quem tem login no projeto da Vercel | Nao (as chaves ficam so em Production) |
| Producao | Vercel, a cada push para a `main`: https://aponte-eight.vercel.app | Banco do Neon de producao, com os dados reais e sem contas de demonstracao | Publico | Sim |

Na previa, o site mostra no topo a faixa "Ambiente de teste (previa): os dados nao sao reais" e
pede aos buscadores para nao indexar as paginas (`src/lib/environment.ts`, pela variavel `VERCEL_ENV`
da Vercel). Na previa, entre com as contas de demo abaixo: sem `RESEND_API_KEY`, os links de
confirmacao de e-mail nao sao enviados.

Na previa, o site usa so `STORAGE_DATABASE_URL` (o banco `ponte-preview`) e ignora o `DATABASE_URL`
do banco real (`postgresUrl()` em `src/lib/sql.ts`). Se `STORAGE_DATABASE_URL` faltar, a previa usa um
banco temporario e mostra o aviso amarelo, sem nunca cair no banco real.

Configuracao na Vercel (projeto `aponte`):

1. **Storage → Create Database → Neon**, com o nome `ponte-preview`, conectado ao projeto com o
   prefixo padrao `STORAGE` (cria `STORAGE_DATABASE_URL`).
2. Em **Settings → Environment Variables**, deixe so em **Production**: `RESEND_API_KEY`, `EMAIL_FROM`,
   `ADMIN_ALERT_EMAIL`, `ADMIN_WHATSAPP`, `CALLMEBOT_API_KEY`, `BASE_URL`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` e `CRON_SECRET`. `ADMIN_EMAIL` e `ADMIN_PASSWORD` podem valer tambem em Preview.
3. Em **Deployments**, faca **Redeploy** da previa mais recente para ela usar o banco novo.

### Contas de demo (senha: `Ponte@2026`)

Existem so no computador, nos testes e nas previas. O site real (`VERCEL_ENV=production`) nunca cria essas contas, mesmo sem `SEED_DEMO=0`, e nao as tem:
elas foram removidas com `scripts/remover-demo.mjs` (`levantamento` so le o banco; `remover` apaga numa
transacao unica e recusa se houver ligacao com pessoas reais).

| Papel      | Email              |
| ---------- | ------------------ |
| Mentor     | ana@ponte.dev      |
| Mentor     | carlos@ponte.dev   |
| Mentor     | rita@ponte.dev     |
| Empresa    | contato@techcorp.dev |
| Mentorado  | joao@email.com     |
| Mentorado  | maria@email.com    |
| Mentorado  | pedro@email.com    |

## Roteiro de testes ponta a ponta

Com o servidor em execucao (`npm run dev`), abra uma janela normal e uma janela
anonima em `http://localhost:3000`. Use as contas de demo acima para validar o
fluxo completo sem depender do Google OAuth.

### 1. Criar e operar um evento

1. Entre como `ana@ponte.dev` (mentor) e abra o painel.
2. Crie um evento **hibrido** ou **presencial**, com data futura, uma vaga e a
   opcao de aprovacao manual marcada.
3. Na janela anonima, entre como `joao@email.com` e abra **Eventos**.
4. Solicite acesso ao evento, aceitando o aviso de privacidade. Marque os
   consentimentos de comunicacao e imagem apenas se desejar testar esses campos
   opcionais.
5. Volte para a Ana, aprove a solicitacao e registre o check-in do Joao.
6. Emita o certificado. A pagina aberta em `/certificados/<codigo>` deve exibir
   o participante, evento, emissor e codigo de verificacao.
7. Volte ao Joao: em **Minhas inscricoes**, a opcao **Cheguei bem em casa**
   deve aparecer para eventos presenciais/hibridos com check-in.

Para testar lista de espera, mantenha o evento com uma vaga ocupada e solicite
acesso tambem como `maria@email.com` ou `pedro@email.com`.

### Emitir um certificado manualmente

O certificado e emitido pelo organizador/mentor a partir do check-in do
participante. O processo nao exige preencher nome ou carga horaria novamente:
a plataforma usa os dados do evento e da inscricao para reduzir erros.

1. Entre com a conta do **mentor ou empresa que criou o evento**.
2. Abra o **Painel** (`/dashboard`) e localize a secao **Meus eventos**.
3. Encontre o evento e, na lista de participantes, confirme que a pessoa esta
   com a inscricao **confirmada**.
4. Clique em **check-in** quando a pessoa estiver presente. Sem check-in, o
   botao de certificado nao aparece.
5. Depois do check-in, clique em **emitir certificado** ao lado do nome da
   pessoa.
6. A plataforma abre a pagina publica do certificado em
   `/certificados/<codigo>`. Ela mostra participante, evento, emissor, data e
   o codigo unico de verificacao.
7. Copie a URL exibida e compartilhe-a com o participante. Ela serve como
   comprovacao verificavel; qualquer pessoa com o link pode consultar o
   certificado, sem precisar entrar na plataforma.

Regras importantes:

- Apenas quem criou o evento pode registrar presenca ou emitir certificados.
- Cada participante recebe apenas um certificado por evento. Uma segunda
  tentativa e bloqueada para evitar duplicidade.
- O certificado so pode ser emitido depois de uma presenca confirmada.
- Para eventos presenciais/hibridos, a confirmacao de chegada em casa e
  independente e voluntaria; ela nao interfere na emissao do certificado.

### 2. Mentoria e disponibilidade

1. Com Joao logado, adicione uma ou mais faixas em **Minha disponibilidade**.
2. Com Ana logada, use **Agendar encontro de mentoria** para um mentorado ativo.
3. Confirme que ambos os usuarios veem suas conexoes e que o encontro e salvo.

### 3. Cadastro manual de mentorado

1. Com Ana logada, use **Adicionar mentorado** e informe nome, email de teste e
   senha temporaria com pelo menos dez caracteres.
2. Saia e entre com o novo email e a senha temporaria.
3. A plataforma deve direcionar para `/primeiro-acesso`; o painel so fica
   disponivel depois que a senha pessoal e definida.

> O cadastro manual persiste no SQLite. Use um email descartavel durante o
> teste ou execute a aplicacao com um `DATABASE_PATH` de teste separado.

### 4. Administracao

Com as variaveis `ADMIN_EMAIL` e `ADMIN_PASSWORD` configuradas, acesse
`/admin`, aprove um cadastro de mentor ou mentorado e confirme que ele consegue
entrar com o email e senha escolhidos no registro.

### 5. Jornada educacional (HackBrasil — Acesso a Educacao)

Jornada principal: **Cadastro → Busca → Mentoria → Projeto → Aprendizado**.

1. Na pagina inicial, escolha **Sou Mentor**, **Sou Mentorado** ou **Sou Empresa**
   (`/sou-mentor`, `/sou-mentorado`, `/sou-empresa`).
2. Entre como `joao@email.com` e abra `/mentores`: os filtros ja vem preenchidos com
   as ferramentas que ele quer aprender e a disponibilidade dele. Cada mentor mostra a
   porcentagem de compatibilidade, os motivos, as diferencas e o calculo por criterio.
3. Solicite mentoria informando o objetivo. O mentor recebe uma notificacao (sino no topo).
4. Entre como `maria@email.com` e abra `/projetos/1` (projeto particular). Somente ela e
   o mentor autorizado (Carlos) veem esse projeto. Clique em **Remover acesso**: Carlos
   deixa de ver na hora. Empresas e outros mentorados recebem 404.
5. Em `/aprendizado`, Maria marca etapas da meta; Carlos ve a meta e deixa feedback.
6. Entre como `contato@techcorp.dev`, abra `/projetos/3` e clique em
   **Buscar mentorados compativeis**: `/talentos` usa as ferramentas e areas do projeto.
   A candidatura do Pedro pode ser aceita ou recusada no proprio projeto.
7. `/eventos` tem filtros por modalidade, categoria e cidade, e cada evento tem uma pagina
   de detalhes (`/eventos/[id]`). A inscricao, a aprovacao, a lista de espera, o check-in e
   os certificados continuam iguais.

**Calculo de compatibilidade** (`src/lib/matching.ts`, deterministico e sem IA):

| Mentorado procurando mentor | Peso | Empresa/mentor procurando mentorado | Peso |
| --- | --- | --- | --- |
| Ferramentas | 30% | Ferramentas (conhece = 1, quer aprender = 0,5) | 30% |
| Tipo de projeto | 20% | Tipo de projeto | 25% |
| Tipo de ajuda | 20% | Nivel de experiencia | 15% |
| Disponibilidade | 15% | Objetivos de aprendizado | 15% |
| Experiencia do mentor | 10% | Disponibilidade | 10% |
| Modalidade | 5% | Modalidade | 5% |

Criterios que nao foram preenchidos nao entram na conta: o peso deles e redistribuido.
Os filtros "Obrigatorio" excluem quem nao atende ao criterio. Empates sao desempatados
por ferramentas, depois disponibilidade, depois perfil mais completo e, por fim, nome.

**Privacidade de projetos** (`canViewProject` em `src/lib/matching.ts`, aplicado no servidor por
`src/lib/projects.ts`): projetos particulares sao sempre privados, nao aparecem em buscas e
so podem ser vistos pelo dono e pelos mentores com acesso ativo. So e possivel dar acesso a
mentores com mentoria ativa. Quem nao tem permissao recebe a mesma resposta 404 de um projeto
inexistente.

### Checklist tecnico

```bash
npm run lint
npm run typecheck
npm test        # testes de compatibilidade, privacidade, projetos, eventos, perfis e senha (SQLite)
DATABASE_URL=postgres://postgres:ponte@localhost:5432/ponte npm run test:pg   # mesmos testes de banco no PostgreSQL (apaga o schema public)
npm run build
```

Todos os comandos devem concluir sem erros. Em seguida, confirme que
`http://localhost:3000/eventos` responde e apresenta a agenda de eventos.

## Backup e restauracao do banco

O workflow `.github/workflows/backup.yml` faz uma copia do banco PostgreSQL do site todo dia as 03:17 (Brasilia) e a cada envio para a `main`, porque o GitHub descarta muitos horarios agendados.

- **Copia:** `pg_dump` completo (inclui os arquivos enviados, que ficam no banco) e a contagem de registros de cada tabela, tirados do mesmo instante. A copia so le o banco.
- **Criptografia:** AES-256 com `gpg`, usando a senha do segredo `BACKUP_PASSPHRASE`. O repositorio e publico, entao a copia nunca e guardada sem criptografia.
- **Guarda:** cada copia fica 30 dias em **Actions > Backup do banco > (execucao) > Artifacts**, com o nome `ponte-backup-AAAA-MM-DD-HHMM`.
- **Teste de recuperacao:** as segundas-feiras e em toda execucao manual, a copia e restaurada num PostgreSQL vazio, as contagens de todas as tabelas sao comparadas com as do backup e o site e aberto com a copia restaurada. Nenhum dado aparece nos logs.
- **Falhas:** o GitHub avisa por e-mail quando o backup ou o teste falha.

### Segredos (Settings > Secrets and variables > Actions)

| Segredo | Valor |
|---|---|
| `BACKUP_DATABASE_URL` | Endereco do banco do Neon (o mesmo `DATABASE_URL` do Vercel). O endereco com `-pooler` e trocado automaticamente pela conexao direta. |
| `BACKUP_PASSPHRASE` | Senha longa criada por quem administra a plataforma. Guarde uma copia fora do GitHub: sem ela, nenhuma copia pode ser aberta. |

Para rodar na hora: **Actions > Backup do banco > Run workflow**.

### Como restaurar

O banco atual nunca e sobrescrito: a copia vai para um banco novo e so depois o site passa a usa-lo.

1. Baixe o artifact da data desejada e descompacte o `.zip`.
2. Abra a copia com a senha:
   ```bash
   mkdir copia
   gpg -d ponte-backup.tar.gpg | tar -C copia -xf -
   ```
3. No Neon, crie um banco novo (ou um branch novo) e copie o endereco dele.
4. Restaure com o `pg_restore` da mesma versao principal do Neon:
   ```bash
   pg_restore --no-owner --no-acl --no-comments --exit-on-error --dbname "ENDERECO_DO_BANCO_NOVO" copia/ponte.dump
   ```
5. Confira as contagens:
   ```bash
   RESTORE_DATABASE_URL="ENDERECO_DO_BANCO_NOVO" node scripts/db-backup.mjs check copia/counts.json
   ```
6. No Vercel, troque `DATABASE_URL` pelo endereco do banco novo e faca um novo deploy.
7. Apague a pasta `copia` e o arquivo baixado.

### Trocar a senha da criptografia

Atualize `BACKUP_PASSPHRASE`. As copias anteriores continuam abrindo so com a senha antiga ate vencerem (30 dias), entao guarde as duas durante esse periodo.

## Monitoramento, logs e disponibilidade

- **Logs estruturados:** as mensagens do servidor saem em 1 linha JSON (`ts`, `nivel`, `area`, `msg` e campos extras), por `src/lib/log.ts`. E-mails, links com query string, credenciais em URLs, tokens e campos como `senha`/`token` sao mascarados antes de gravar. No Vercel, veja em **Logs** e filtre por `"area":"servidor"`, por exemplo.
- **Erros do servidor:** `src/instrumentation.ts` recebe todo erro de pagina, rota, formulario (server action) ou proxy. O erro vira um log `"area":"servidor"` com o metodo, o caminho sem query, a rota do arquivo e o `digest`, e a administracao e avisada pelos canais de `ADMIN_WHATSAPP`/`CALLMEBOT_API_KEY` e/ou `ADMIN_ALERT_EMAIL`. No maximo 1 aviso por tipo de erro (rota + classe do erro) a cada hora. O `digest` aparece tambem na tela de erro como "Codigo do erro", para achar o log certo.
- **Telas de erro:** `src/app/error.tsx` e `src/app/global-error.tsx`, em portugues, com "Tentar de novo" e "Voltar ao inicio".
- **Saude:** `GET /api/saude` responde `{"status":"ok","banco":"ok"}` (200) quando o site e o banco funcionam e `{"status":"erro","banco":"erro"}` (503) quando o banco nao responde em 8 s. Nao mostra dados.
- **Disponibilidade:** o workflow `.github/workflows/disponibilidade.yml` abre `/api/saude` a cada 15 minutos. Se falhar 2 vezes seguidas, com 1 minuto entre elas, abre a issue "Site fora do ar" atribuida a dona do repositorio, e o GitHub manda e-mail. Quando o site volta, a issue e comentada e fechada sozinha. Requer **Issues** ligadas em Settings → General → Features. Para checar outro endereco, troque `SITE_URL` no workflow. O GitHub pode atrasar execucoes agendadas em alguns minutos.

## Deploy alternativo (Docker — Railway, Render, Fly.io, VPS)

O deploy oficial e na Vercel (veja "Publicar na Vercel"). O Docker fica como alternativa para rodar fora dela.

```bash
docker build -t ponte .
docker run -p 3000:3000 -v ponte-data:/app/data ponte
```

O volume `/app/data` persiste o SQLite. Para apontar o banco para outro
caminho, use a env `DATABASE_PATH`.

No Railway/Render: aponte para o Dockerfile e anexe um volume em `/app/data`.

## Nota sobre o `.npmrc`

O arquivo `.npmrc` aponta para `registry.npmmirror.com` porque o registry
oficial do npm nao estava acessivel na rede onde o projeto foi criado.
Se `registry.npmjs.org` funcionar na sua rede, voce pode remover o arquivo.
