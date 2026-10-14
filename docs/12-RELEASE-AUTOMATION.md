# 🚀 Trainvy — Automação de Release, Migrations e Publicação Segura

Este documento estabelece o fluxo oficial de publicação controlada para o Trainvy, eliminando descompassos de banco (migrations pendentes) e prevenindo concorrência indesejada durante deploys.

---

## 1. Princípios de Segurança do Pipeline

1. **Separação estrita entre Build e Migrations**:
   - O comando de build da Vercel (`prisma generate && tsc` e `next build`) é puramente de compilação de código.
   - **NUNCA** execute `prisma migrate deploy` dentro do `package.json` no script de build. Isso evita que deploys de Preview (Pull Requests) ou builds concorrentes executem alterações destrutivas no banco real.
2. **Validação prévia em Banco Isolado de Testes**:
   - Todo release executa as migrations e testes primeiro contra o banco de teste (`TEST_DATABASE_URL`). Somente após passar 100% dos testes a publicação de produção é liberada.
3. **Ambiente com Aprovação Manual no GitHub**:
   - O job de deploy de produção roda no environment `production`, exigindo aprovação explícita e confirmação de texto (`RELEASE-PROD`).
4. **Proteção contra Concorrência**:
   - Concurrency group `production-release` com `cancel-in-progress: false` impede que dois releases simultâneos concorram pelo banco.
5. **Ordem Determinística de Release**:
   - **1º**: Validação de Integridade do Banco de Produção (`prisma migrate status`).
   - **2º**: Execução de Migrations de Produção (`prisma migrate deploy`).
   - **3º**: Execução de Seeds Operacionais Idempotentes (`commercial:bootstrap` e `seed:media`).
   - **4º**: Deploy do Backend na Vercel (`vercel deploy --prod`).
   - **5º**: Validação de Health Check do Backend (`/swagger.json`).
   - **6º**: Deploy do Frontend na Vercel (`vercel deploy --prod`).
   - **7º**: Validação de Health Check do Frontend (`/manifest.webmanifest` / `/`).

---

## 2. Secrets Necessários no GitHub

No repositório do GitHub (em **Settings** -> **Secrets and variables** -> **Actions**), cadastre as seguintes chaves:

| Secret | Finalidade | Exemplo / Formato |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão do PostgreSQL de Produção (Neon) | `postgresql://user:pass@ep-prod.neon.tech/neondb?sslmode=require` |
| `TEST_DATABASE_URL` | String de conexão do Banco de Testes Isolado | `postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require` |
| `VERCEL_TOKEN` | Token de API pessoal da Vercel para deploy via CLI | Obtido em `vercel.com/account/tokens` |
| `VERCEL_ORG_ID` | Identificador da Organização/Time na Vercel | Encontrado em `.vercel/project.json` ou Project Settings |
| `VERCEL_BACKEND_PROJECT_ID` | ID do projeto da API na Vercel | Encontrado no dashboard do projeto da API |
| `VERCEL_FRONTEND_PROJECT_ID` | ID do projeto do Frontend na Vercel | Encontrado no dashboard do projeto do Frontend |
| `GH_PAT` / `CROSS_REPO_TOKEN` | Token do GitHub com permissão `repo` (leitura) | Necessário para a Action clonar `bootcamp-treinos-frontend` |

---

## 3. Coexistência de Estratégias de Deploy & Prevenção de Concorrência

Existem duas estratégias preparadas para deploy no Trainvy. **Nunca habilite ambas simultaneamente para branch de produção sem coordenação**:

### Estratégia A: Orquestração Central via GitHub Action (Recomendada para Beta)
1. **Controle**: A Action executa testes contra `TEST_DATABASE_URL`, aguarda aprovação manual `RELEASE-PROD`, aplica migrations em produção, roda seeds idempotentes e realiza deploy ordenado do backend e frontend.
2. **Configuração Vercel obrigatória**: No dashboard da Vercel (Backend e Frontend), em **Settings** -> **Git** -> **Ignored Build Step**, configure para ignorar deploys automáticos da branch `main` (`exit 0`). Isso impede que a Vercel inicie builds antes de migrations serem concluídas.
3. **Autenticação cross-repo**: Cadastre o secret `GH_PAT` ou `CROSS_REPO_TOKEN` para permitir que o workflow clone o frontend.

### Estratégia B: Build Command Direto na Vercel (`npm run vercel:build`)
1. **Controle**: A Vercel executa `src/scripts/vercel-build.ts` a cada push na `main`, aplicando migrations automaticamente quando `$VERCEL_ENV === "production"`.
2. **Prevenção de concorrência**: Se esta estratégia for adotada, **não execute** o pipeline do GitHub Action simultaneamente.
3. **Proteção de Previews**: Builds de Preview (Pull Requests) pulam automaticamente migrations e seeds, apenas compilando código (`prisma generate && tsc`).

---

## 4. Passo a Passo para Realizar um Release

Quando desejar promover uma nova versão para produção:

1. Acesse a aba **Actions** no repositório do backend (`bootcamp-treinos-api`).
2. Selecione o workflow **Trainvy Production Release Pipeline**.
3. Clique em **Run workflow**.
4. Configure as opções:
   - **Executar seeds operacionais idempotentes?**: marque `true` (padrão) para sincronizar catálogo de planos comerciais e mídias de exercícios.
   - **Confirmação de produção**: digite exatamente `RELEASE-PROD`.
5. Clique no botão verde **Run workflow**.
6. Acompanhe a execução dos steps em tempo real. Se qualquer teste ou migration falhar, o pipeline é interrompido imediatamente sem afetar o tráfego dos usuários.

---

## 5. Procedimentos de Rollback e Recuperação

### A. Rollback de Código
- Se uma nova versão de frontend ou backend apresentar regressão visual ou lógica sem alteração de banco:
  1. No dashboard da Vercel, acesse a aba **Deployments**.
  2. Localize a versão estável imediatamente anterior.
  3. Clique em **...** -> **Promote to Production** (ou **Instant Rollback**).
  4. O tráfego volta para a versão anterior em segundos.

### B. Recuperação de Banco de Dados
- Como utilizamos o **Neon PostgreSQL**, backups e point-in-time restore estão disponíveis por padrão:
  - Todas as migrations do Trainvy são **aditivas** (novas tabelas, novas colunas anuláveis ou com default).
  - Nunca execute `prisma migrate reset` em produção.
  - Caso seja necessário reverter uma alteração de dados, utilize a ferramenta de **Branches** e **Time Travel** do Neon para restaurar o estado até o minuto anterior ao release.

---

## 6. Alternativa Direta: Build Command na Vercel (`npm run vercel:build`)

Se você preferir que a própria Vercel aplique as migrations e seeds automaticamente a cada push na branch de produção (sem depender da GitHub Action):

1. Deixamos implementado o script [`src/scripts/vercel-build.ts`](file:///c:/Users/luis-chiqueto/Documents/Proj/treinos/bootcamp-treinos-api/src/scripts/vercel-build.ts), acessível via:
   ```json
   "vercel:build": "tsx src/scripts/vercel-build.ts"
   ```
2. **Como ativar quando quiser**:
   - Acesse o painel da Vercel do projeto da API.
   - Vá em **Project Settings** -> **General** -> **Build & Development Settings**.
   - Em **Build Command**, marque o switch de override e insira:
     ```bash
     npm run vercel:build
     ```
3. **Comportamento Seguro**:
   - Se `$VERCEL_ENV === "production"`, ele executa:
     1. `prisma migrate deploy`
     2. `tsx src/scripts/commercial-bootstrap.ts` (idempotente)
     3. `tsx src/scripts/seed-exercise-media.ts` (idempotente)
     4. `prisma generate && tsc`
   - Se for branch de **Preview** ou ambiente local, ele pula as migrations e seeds automaticamente e apenas compila o código (`prisma generate && tsc`), protegendo o banco contra alterações indevidas.

