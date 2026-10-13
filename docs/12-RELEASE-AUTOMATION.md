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

---

## 3. Configuração Recomendada na Vercel

Para evitar que um `git push` na branch principal tente publicar a aplicação na Vercel antes que a GitHub Action termine de aplicar as migrations no banco:

1. Acesse o projeto do **Backend** e do **Frontend** no dashboard da Vercel.
2. Vá em **Settings** -> **Git**.
3. Na seção **Ignored Build Step**, você pode configurar para ignorar deploys automáticos da branch `main` caso queira que toda publicação seja 100% orquestrada pela GitHub Action.
4. Alternativamente, mantenha a integração Git sabendo que a Action `Trainvy Production Release Pipeline` faz o deploy explícito via `vercel deploy --prod --yes` e valida a ordem completa.

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
