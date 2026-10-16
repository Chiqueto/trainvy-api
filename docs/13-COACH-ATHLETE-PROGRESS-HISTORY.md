# TRAINVY — TASK 6.3: Acompanhamento, Histórico e Evolução dos Alunos pelo Personal Trainer
## Documentação Técnica Completa e Resumo Arquitetural

---

## 1. Visão Geral e Contexto Executivo

A **Task 6.3** implementa o módulo de **Acompanhamento, Histórico e Evolução dos Alunos pelo Personal Trainer** no ecossistema **Trainvy** (SaaS mobile-first de periodização, prescrição e acompanhamento de treinos).

A funcionalidade permite que o Personal Trainer acesse métricas consolidadas de volume, distribuição muscular, histórico de sessões executadas e evolução de carga por exercício dos seus alunos vinculados.

Todo o desenvolvimento foi orientado pelos seguintes pilares inegociáveis:
- **Privacy by Design & Conformidade LGPD/GDPR:** Nenhum dado de treino do aluno é exposto ao treinador sem consentimento explícito prévio e voluntário do aluno.
- **Isolamento Multiusuário e Prevenção IDOR:** Validações em profundidade garantem que um treinador jamais acerte ou enumere dados de alunos não vinculados a ele.
- **Zero Vazamento de Dados Pessoais Sensíveis:** Métricas corporais (peso, altura, % de gordura) e histórico de conversas com o assistente IA permanecem estritamente privadas do aluno.
- **Imutabilidade e Read-Only Rigoroso:** O treinador não possui permissão de alterar, editar ou excluir registros de sessões ou séries executadas pelo aluno.
- **Tipagem End-to-End:** Contratos definidos em Zod no backend Fastify, exportados via OpenAPI/Swagger e consumidos no frontend Next.js por cliente gerado via Orval.

---

## 2. Repositórios, Branches e Commits

| Repositório | Descrição | Branch | Últimos Commits |
|---|---|---|---|
| `Chiqueto/trainvy-api` | Backend Node.js / Fastify / Prisma 7 | `feat/coach-athlete-progress` | `4286162`: feat: add coach-athlete progress sharing and analytics routes and use cases |
| `Chiqueto/trainvy-frontend` | Frontend Next.js 16 (Turbopack) | `feat/coach-athlete-progress` | `e6d054c`: test: align dashboard component text to pass suite<br>`74e2c8b`: fix: align planned schema types, fix sharing consent property, and clean react effects<br>`dce9f6a`: feat: implement coach athlete progress and evolution view components and actions |

Ambas as branches derivaram de `fix/coach-prescription-integrity` e estão 100% sincronizadas com a origem remota.

---

## 3. Modelo de Dados e Migração (Prisma 7 & PostgreSQL)

### 3.1. Alterações no Model `CoachAthlete`

No arquivo `prisma/schema.prisma`, o relacionamento treinador-aluno foi estendido para controlar o ciclo de vida do consentimento:

```prisma
model CoachAthlete {
  id                     String             @id @default(uuid())
  coachId                String             @map("coach_id")
  athleteId              String             @map("athlete_id")
  status                 CoachAthleteStatus @default(ACTIVE)
  evolutionShared        Boolean            @default(false) @map("evolution_shared")
  includePreviousHistory Boolean            @default(false) @map("include_previous_history")
  evolutionSharedAt      DateTime?          @map("evolution_shared_at")
  evolutionRevokedAt     DateTime?          @map("evolution_revoked_at")
  acceptedAt             DateTime           @default(now()) @map("accepted_at")
  revokedAt              DateTime?          @map("revoked_at")
  createdAt              DateTime           @default(now()) @map("created_at")
  updatedAt              DateTime           @updatedAt @map("updated_at")

  coach   User @relation("CoachAthletes", fields: [coachId], references: [id], onDelete: Cascade)
  athlete User @relation("AthleteCoaches", fields: [athleteId], references: [id], onDelete: Cascade)

  @@unique([coachId, athleteId])
  @@index([coachId, status])
  @@index([athleteId, status])
  @@index([athleteId, evolutionShared])
  @@map("coach_athletes")
}
```

### 3.2. Script SQL da Migração
Arquivo: `prisma/migrations/20261015120000_coach_athlete_progress_consent/migration.sql`:
```sql
ALTER TABLE "coach_athletes" 
  ADD COLUMN "evolution_shared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "include_previous_history" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evolution_shared_at" TIMESTAMP(3),
  ADD COLUMN "evolution_revoked_at" TIMESTAMP(3);

CREATE INDEX "coach_athletes_athlete_id_evolution_shared_idx" 
  ON "coach_athletes"("athlete_id", "evolution_shared");
```

### 3.3. Garantias do Modelo
1. **Seguro por Padrão (`default(false)`):** Alunos novos ou existentes iniciam com compartilhamento desativado.
2. **Auditoria de Consentimento:** Registro exato de quando o aluno autorizou (`evolution_shared_at`) ou cancelou (`evolution_revoked_at`).
3. **Escopo Temporal:** `include_previous_history` controla se o coach tem acesso apenas aos treinos a partir da data de vínculo (`accepted_at`) ou se tem acesso retroativo.
4. **Desconexão Reseta Consentimento:** Ao revogar o vínculo em `RevokeCoachAthleteLink`, `evolutionShared` é forçado para `false` atomicamente.

---

## 4. Arquitetura do Backend (`trainvy-api`)

O backend segue estritamente a convenção `Route -> Use Case -> Prisma`.

### 4.1. Guardrail Central: `AuthorizeCoachAthleteProgressAccess`
Localizado em `src/usecases/AuthorizeCoachAthleteProgressAccess.ts`, este use case é invocado como primeiro passo em **todas** as rotas de acompanhamento de alunos:

```
[Requisição do Coach]
        │
        ▼
1. Verifica sessão autenticada (401 se ausente)
        │
        ▼
2. Verifica tipo de conta === "COACH" e entitlement "MANAGE_ATHLETES" (403 FORBIDDEN)
        │
        ▼
3. Busca vínculo ativo no banco:
   CoachAthlete onde coachId === session.userId AND athleteId === param.athleteId AND status === "ACTIVE"
   └── Não encontrou? ➔ Retorna 404 ATHLETE_LINK_NOT_FOUND (Previne vazamento de existência por IDOR)
        │
        ▼
4. Verifica consentimento: CoachAthlete.evolutionShared === true
   └── Se false ➔ Retorna 403 SHARING_NOT_AUTHORIZED (Sem vazamento de dados de treino)
        │
        ▼
5. Determina corte temporal de histórico:
   - Se includePreviousHistory === true ➔ minCompletedAt = null (histórico irrestrito)
   - Se includePreviousHistory === false ➔ minCompletedAt = acceptedAt (apenas pós-vínculo)
```

### 4.2. Endpoints Implementados

| Método | Endpoint | Tags | Descrição | Status Codes |
|---|---|---|---|---|
| `GET` | `/me/coach-progress-sharing` | `Me` | Consulta estado do consentimento pelo próprio atleta | `200`, `401`, `500` |
| `PATCH` | `/me/coach-progress-sharing` | `Me` | Atualiza opt-in e inclusão de histórico prévio pelo atleta | `200`, `400`, `401`, `500` |
| `GET` | `/coach/athletes/:athleteId/progress/overview` | `Coach` | Resumo de métricas, volume semanal e distribuição muscular | `200`, `400`, `401`, `403`, `404`, `500` |
| `GET` | `/coach/athletes/:athleteId/progress/sessions` | `Coach` | Lista paginada de treinos concluídos com cursor e filtro de origem | `200`, `400`, `401`, `403`, `404`, `500` |
| `GET` | `/coach/athletes/:athleteId/progress/sessions/:sessionId` | `Coach` | Snapshot detalhado e imutável de treino em modo somente-leitura | `200`, `401`, `403`, `404`, `500` |
| `GET` | `/coach/athletes/:athleteId/progress/exercises` | `Coach` | Lista de exercícios com execuções autorizadas e busca textual | `200`, `401`, `403`, `404`, `500` |
| `GET` | `/coach/athletes/:athleteId/progress/exercises/:exerciseId` | `Coach` | Histórico evolutivo e Recorde Pessoal (PR) de exercício do aluno | `200`, `401`, `403`, `404`, `500` |

### 4.3. Cabeçalho de Proteção de Cache
Todas as rotas sob `/coach/athletes/:athleteId/progress/*` e `/me/coach-progress-sharing` emitem explicitamente:
```http
Cache-Control: no-store, private
```
Evita cacheamento intermediário em proxies, CDNs ou browsers compartilhados.

### 4.4. Use Cases Criados e Adaptados

- **`GetAthleteCoachProgressSharing` & `UpdateAthleteCoachProgressSharing`**: Leitura e mutação do consentimento pelo atleta.
- **`GetCoachAthleteProgressOverview`**: Compila resumo estatístico, volume semanal via `GetWeeklyTrainingAnalytics` e distribuição muscular via `GetMuscleTrainingAnalytics`, aplicando o `minCompletedAt` adequado.
- **`GetCoachAthleteProgressSessions` & `GetCoachAthleteProgressSessionDetail`**: Reutiliza `ListWorkoutHistory` e `GetWorkoutHistorySession`, garantindo retorno dos snapshots imutáveis gravados no momento em que o treino foi finalizado.
- **`GetCoachAthleteProgressExercises` & `GetCoachAthleteProgressExerciseEvolution`**: Reutiliza `ListExercises` e `GetExerciseEvolution` com corte temporal por atleta.

---

## 5. Arquitetura do Frontend (`trainvy-frontend`)

### 5.1. Gestão de Consentimento no Perfil do Atleta (`/profile`)
Localizado em `app/profile/_components/my-coach-section.tsx`:
- Quando o atleta possui vínculo ativo com um treinador, é apresentada a seção **Meu Treinador**.
- Inclui switch principal: **"Compartilhamento de evolução"**.
  - Exibe badge de status (`Ativado` em verde / `Desativado` em cinza).
  - Inclui alerta LGPD explicando que métricas corporais e IA não são compartilhadas.
- Ao ativar o switch principal, expande suavemente a opção secundária:
  - **"Incluir histórico anterior ao vínculo"**: permite ao aluno escolher se o treinador vê treinos passados ou apenas novos.
- A mutação ocorre via Server Action otimista com tratamento de erro e rollback.

### 5.2. Layout em 3 Abas na Gestão do Aluno (`/personal/alunos/[athleteId]`)
A página do aluno foi reorganizada para suportar uma experiência integrada e limpa:
1. **Visão Geral:** Informações de cadastro, plano ativo, período de adesão e ações rápidas.
2. **Evolução:** O novo dashboard central de progresso (Task 6.3).
3. **Prescrições:** Lista de prescrições ativas e rascunhos enviados pelo personal (Task 6.2B).

### 5.3. Dashboard de Evolução (`CoachAthleteEvolutionDashboard`)
Localizado em `app/personal/alunos/[athleteId]/_components/coach-athlete-evolution-dashboard.tsx`:

- **Tratamento de Estados:**
  - **Loading Skeleton:** Animação de carregamento elegante com spinner e feedback.
  - **Bloqueio 403 `SHARING_NOT_AUTHORIZED`:** Card informativo com ícone de cadeado âmbar, explicando que o aluno ainda não ativou o compartilhamento e fornecendo um guia passo a passo de como ele pode fazê-lo pelo perfil. Zero métricas ou dados vazam.
  - **Bloqueio 403 Entitlement:** Alerta caso a assinatura do coach não possua capacidade.
  - **404 Vínculo Inativo:** Feedback caso o vínculo tenha sido revogado.
  - **Dashboard Autorizado:** Carrega os dados reais do aluno.
- **Filtro de Período:** Seletor segmentado com 4, 8 e 12 semanas. O timezone do treinador é detectado automaticamente e enviado à API para cálculo exato de semanas ISO.
- **Cards de Métricas:**
  - *Treinos Concluídos*
  - *Frequência Semanal*
  - *Séries Válidas*
  - *Volume Total de Carga (kg / t)*
  - *Duração Média por Treino*
- **Visualizações Gráficas:** Reutilização direta de `WeeklyVolumeChart` (volume por semana) e `MuscleDistribution` (volume direto/indireto por grupamento muscular).
- **Sub-abas de Navegação Interna:**
  - `overview`: Métricas globais e gráficos.
  - `sessions`: Linha do tempo das sessões executadas.
  - `exercises`: Análise analítica e recordes pessoais de cada exercício.

### 5.4. Modal de Snapshot Histórico (`CoachProgressSessionModal`)
Localizado em `app/personal/alunos/[athleteId]/_components/coach-progress-session-modal.tsx`:
- Abre ao clicar em qualquer sessão da linha do tempo.
- Apresenta:
  - Cabeçalho com data, horário, origem (`Planejado` vs `Avulso`), duração e volume total.
  - Metas planejadas (quando treino de plano): séries-alvo, repetições e descanso.
  - Tabela de séries executadas: identificador (#1, #2 ou badge de aquecimento `Aq`), carga efetiva formatada em kg, repetições realizadas, RIR e tempo sob tensão.
- **Invariante Read-Only:** Não possui controles de formulário, botões de exclusão ou edição.

### 5.5. Análise de Exercício e Recordes (`CoachProgressExerciseView`)
Localizado em `app/personal/alunos/[athleteId]/_components/coach-progress-exercise-view.tsx`:
- Campo de busca com debounce de 300ms.
- Lista apenas exercícios que o aluno efetivamente executou dentro da janela autorizada.
- Exibe card de destaque com o **Recorde Pessoal Oficial (`loadPR`)** do aluno para o exercício (carga máxima e repetições alcançadas).
- Linha do tempo de todas as execuções daquele exercício com detalhamento série a série.

---

## 6. Qualidade, Testes e Verificação

### 6.1. Suíte de Testes do Backend (`trainvy-api`)
- **Comando:** `npm test`
- **Resultado:** **44 arquivos de teste passaram, 538 testes aprovados (100%)**.
- **Arquivo específico de integração:** `tests/routes/coach-progress.spec.ts` (20 testes específicos da Task 6.3 cobrindo autenticação, entitlements, isolamento IDOR, opt-in/opt-out, escopo temporal, timezone e headers de cache).

### 6.2. Suíte de Testes do Frontend (`trainvy-frontend`)
- **Comando:** `npm test`
- **Resultado:** **30 arquivos de teste passaram, 352 testes aprovados (100%)**.
- **Arquivo específico de UI:** `tests/coach-athlete-progress-ui.test.tsx` (9 testes cobrindo switches de consentimento, renderização bloqueada com instruções, exibição de métricas autorizadas, alternância de semanas e modal read-only).

### 6.3. Verificação de Compilação e Linter
- **Backend:** `npx eslint src` e `npm run build` (`prisma generate && tsc`) executam com **código de saída 0** (sem erros nem warnings).
- **Frontend:** `npm run lint` e `npm run build` (`next build` com Turbopack) executam com **código de saída 0**, com todas as 19 rotas estáticas e dinâmicas validadas.

---

## 7. Roteiro Passo a Passo para Teste Manual (2 Contas Google)

### Cenário de Teste
- **Conta 1 (Personal Trainer):** Treinador com plano ativo.
- **Conta 2 (Aluno):** Usuário comum do app.

### Passo 1: Vinculação Coach ↔ Aluno
1. No navegador do Coach (Conta 1), acesse `/personal`.
2. Clique no botão **"Gerar Convite"** e copie a URL gerada (ex: `/convite/TOKEN_UUID`).
3. No navegador do Aluno (Conta 2), acesse o link de convite.
4. Clique em **"Aceitar Treinador"**. O vínculo ativo é estabelecido com status `ACTIVE`.
5. O Aluno realiza 1 ou 2 treinos no tracker (`/workout-sessions/...`) ou possui histórico prévio.

### Passo 2: Verificação do Bloqueio Inicial de Consentimento
1. No navegador do Coach (Conta 1), acesse `/personal/alunos/[athleteId]`.
2. Clique na aba **"Evolução"**.
3. **Resultado Esperado:** O Coach visualiza a tela de bloqueio:
   - Ícone de cadeado âmbar e título: *"Compartilhamento Não Autorizado"*.
   - Mensagem explicativa: *"Este aluno ainda não autorizou o compartilhamento do histórico de treinos."*.
   - Caixa com instruções ensinando o aluno a ativar em seu perfil.
   - **Nenhum** volume, gráfico ou dado do aluno é renderizado.

### Passo 3: Ativação do Consentimento pelo Aluno
1. No navegador do Aluno (Conta 2), acesse `/profile`.
2. Localize a seção **"Meu Treinador"** e encontre **"Compartilhamento de evolução"**.
3. Ative a chave. O status muda para *"Ativado"* em verde.
4. Note que a chave *"Incluir histórico anterior ao vínculo"* aparece. Mantenha desativada inicialmente.

### Passo 4: Visualização das Métricas pelo Coach
1. No navegador do Coach (Conta 1), recarregue a aba **"Evolução"** do aluno.
2. **Resultado Esperado:** O dashboard carrega com dados reais:
   - Cards de resumo: Treinos, frequência semanal, séries e volume total em kg/t.
   - Gráfico de Volume Semanal com barras por semana.
   - Distribuição de Grupamentos Musculares (séries diretas e indiretas).
   - Histórico de treinos concluídos com badges de identificação.
3. Alterne o filtro para 8 semanas e 12 semanas para observar a atualização dinâmica.

### Passo 5: Inspeção da Sessão em Modo Somente-Leitura
1. Clique em uma das sessões listadas na linha do tempo.
2. **Resultado Esperado:** Modal abre com o snapshot histórico completo:
   - Séries, repetições, cargas, RIR e tempo sob tensão.
   - Inspecione a interface para certificar-se de que **não existem** botões de edição, adição ou exclusão de dados do aluno.

### Passo 6: Análise por Exercício e Recordes (PR)
1. No dashboard de evolução, clique na sub-aba **"Exercícios"**.
2. Digite o nome de um exercício executado no campo de busca.
3. Selecione o exercício.
4. **Resultado Esperado:** Exibição do Recorde Pessoal Oficial (`loadPR`), volume e histórico de séries daquele exercício.

### Passo 7: Inclusão de Histórico Anterior
1. No navegador do Aluno (Conta 2), acesse `/profile` e ative o switch secundário **"Incluir histórico anterior ao vínculo"**.
2. No navegador do Coach, recarregue a página e observe que treinos realizados antes da criação do vínculo agora participam dos gráficos e listas.

### Passo 8: Revogação Imediata do Consentimento
1. No navegador do Aluno (Conta 2), em `/profile`, desligue o switch **"Compartilhamento de evolução"**.
2. No navegador do Coach (Conta 1), tente navegar ou recarregar os dados de evolução.
3. **Resultado Esperado:** O Coach recebe imediatamente HTTP 403 e a interface exibe a mensagem de compartilhamento não autorizado. A revogação entra em vigor instantaneamente sem delay de cache.

---

## 8. Considerações Finais de Segurança e Auditoria

- **LGPD / GDPR Compliance:** A arquitetura garante o direito de autodeterminação informativa do usuário (atleta). A qualquer momento o atleta pode conceder, restringir o escopo temporal ou revogar completamente o acesso aos seus treinos.
- **Zero Vazamento em Erros:** Respostas de erro nunca retornam stacktraces ou mensagens internas de infraestrutura para o cliente.
- **Resiliência Multi-Timezone:** O timezone informado pelo navegador do treinador previne distorções no agrupamento semanal de treinos executados próximos à meia-noite.
