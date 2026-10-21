# Task 6.5B — Design Arquitetural: Recuperação de Treinos Esquecidos (Forgotten Workout Recovery)

## 1. Visão Geral e Escopo

No Trainvy, a **Task 6.5** foi estruturada em duas fases ontologicamente distintas:
- **Task 6.5A (Concluída):** Assistente de IA ativo durante a sessão em andamento (`/workout-sessions/[sessionId]`), auxiliando em dúvidas de execução, progressão de carga e geração de propostas contextuais e editáveis de séries com confirmação explícita do atleta.
- **Task 6.5B (Em Execução):** Assistente conversacional pós-fato e fluxo de interface para **recuperação de treinos esquecidos** (ex: *"Ontem treinei Peito e Tríceps na academia do condomínio sem celular, fiz 3 séries de Supino com 20kg e 10 repetições..."*).
- **Escopos Fora de Escopo:** Reconhecimento de voz (STT/TTS em tempo real) e modelos locais on-device continuam fora do escopo desta entrega.

---

## 2. Princípios e Guardrails Arquiteturais

1. **A IA Nunca Grava Diretamente no Banco:**
   Nenhuma mensagem de chat ou invocação de tool pode inserir diretamente `WorkoutSession`, `SessionExercise` ou `WorkoutSet`. A IA produz ou atualiza um **Rascunho de Recuperação de Treino** (`ForgottenWorkoutDraft`), que deve ser apresentado em uma interface dedicada para revisão completa e editável do atleta antes de qualquer gravação transacional.
2. **Imutabilidade e Não-Sobrescrita de Sessões Existentes:**
   A recuperação de treinos passados **nunca pode alterar, reabrir, sobrescrever ou mesclar silenciosamente** dados em sessões de treino já existentes ou finalizadas (`completedAt !== null`).
3. **Consistência de Timezone e Datas Reais:**
   Toda interpretação de data relativa (*"ontem"*, *"segunda-feira passada"*, *"anteontem"*) deve ser computada no fuso horário IANA do atleta (ex: `America/Sao_Paulo`), com referência temporal fornecida pelo servidor. Datas futuras são estritamente rejeitadas. Um treino realizado no dia de hoje não deve ser rejeitado por falta de horário.
4. **Sem Dados Inventados (Precisão Temporal):**
   Não se deve inventar horário de início, término, duração ou RIR. Se o atleta souber apenas o dia, o sistema registra com `timePrecision: DATE_ONLY`, sem fabricar horários nem durações irreais.
5. **Decisões de Produto Pendentes (Registradas para Futuro):**
   - Limite máximo de janela retroativa (ex: 7 dias vs 30 dias vs ilimitado): mantido sem bloqueio artificial nesta entrega.
   - Diferenciação por plano comercial (Free vs Pro): pendente de decisão de produto.
   - Fluxos de aprovação ou notificação ativa ao personal trainer: pendentes de decisão de produto (o personal apenas visualiza a sessão concluída respeitando o consentimento temporal normal, sem acesso a rascunhos ou conversas privadas).

---

## 3. Modelo de Dados

```prisma
enum SessionTimePrecision {
  EXACT_TIME
  DATE_ONLY
}

enum ForgottenWorkoutDraftStatus {
  DRAFT
  CONFIRMED
  DISCARDED
  EXPIRED
}

model ForgottenWorkoutDraft {
  id                    String                      @id @default(uuid())
  userId                String
  user                  User                        @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversationId        String?
  conversation          AiConversation?             @relation(fields: [conversationId], references: [id], onDelete: SetNull)

  revision              Int                         @default(1)
  status                ForgottenWorkoutDraftStatus @default(DRAFT)

  sessionDate           DateTime                    @db.Date
  timePrecision         SessionTimePrecision        @default(DATE_ONLY)
  startedAt             DateTime?                   @db.Timestamptz()
  completedAt           DateTime?                   @db.Timestamptz()
  timezone              String

  workoutPlanId         String?
  workoutPlan           WorkoutPlan?                @relation(fields: [workoutPlanId], references: [id], onDelete: SetNull)
  workoutDayId          String?
  workoutDay            WorkoutDay?                 @relation(fields: [workoutDayId], references: [id], onDelete: SetNull)

  title                 String                      // Ex: "Treino A - Peitoral e Tríceps"
  origin                WorkoutSessionOrigin        @default(FREE)

  proposedExercises     Json                        // Array estruturado validado via Zod
  confirmedSessionId    String?                     @unique
  confirmedSession      WorkoutSession?             @relation("DraftConfirmedSession", fields: [confirmedSessionId], references: [id], onDelete: SetNull)

  idempotencyKey        String?                     @unique
  expiresAt             DateTime                    @db.Timestamptz()
  confirmedAt           DateTime?                   @db.Timestamptz()
  discardedAt           DateTime?                   @db.Timestamptz()
  createdAt             DateTime                    @default(now()) @db.Timestamptz()
  updatedAt             DateTime                    @updatedAt @db.Timestamptz()

  @@index([userId, status])
  @@index([userId, sessionDate])
}
```

### Campos em `WorkoutSession`:
- `sessionDate DateTime? @db.Date` (data do calendário da sessão no fuso do atleta)
- `timePrecision SessionTimePrecision @default(EXACT_TIME)`
- `isRetroactive Boolean @default(false)`
- `recoveryDraftId String? @unique`
- Relação 1-to-1 com `ForgottenWorkoutDraft`

---

## 4. Detecção de Conflitos e Protocolo Anti-Duplicação

1. **Serialização Transacional no Atleta:**
   `pg_advisory_xact_lock(hashtext('recovery:' || userId))` garante que requisições concorrentes de confirmação do mesmo atleta sejam estritamente serializadas.
2. **Comparação de Datas no Fuso do Atleta:**
   Verifica existência de treinos na mesma data calendário usando a data do fuso do atleta (`sessionDate` ou `startedAt AT TIME ZONE timezone`), sem depender do fuso do servidor.
3. **Tratamento de Cenários Distintos:**
   - **Retry do mesmo rascunho / Mesma chave de idempotência:** Retorna `200 OK` com a sessão já criada.
   - **Revisão desatualizada:** Se o rascunho foi alterado após a carga de revisão, rejeita com `409 Conflict` (`STALE_DRAFT_REVISION`).
   - **Possível duplicata:** Se já houver treino no mesmo dia com o mesmo `workoutDayId` ou janela horária colidente, o sistema expõe o alerta e exige confirmação explícita (`confirmConflict: true`).
   - **Dois treinos legítimos no mesmo dia:** Permitido com decisão consciente do atleta.

---

## 5. Governança, Métricas e Rastreabilidade

- A sessão é marcada explicitamente com `isRetroactive: true`, `timePrecision`, `sessionDate` e `recoveryDraftId`.
- Para `DATE_ONLY`, `durationInSeconds` na visualização e agregações permanece `null` (ou `0`), sem fabricar tempos inexistentes.
- No painel do Personal Trainer (Task 6.3), respeita-se o consentimento existente e o corte temporal baseado em `sessionDate` / data de execução; conversas e rascunhos de IA são privados e nunca expostos ao treinador.
