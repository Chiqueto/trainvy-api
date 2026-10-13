# 11 — Exercise Media Foundation (Task 4.X)

## 1. Visão Geral e Objetivos

A **Task 4.X: Exercise Media Foundation** introduz o suporte à visualização de demonstração visual de exercícios para os atletas do Trainvy durante suas sessões de treino e nos detalhes de planejamento de dias de treino.

### Premissas e Guardrails
- **Custo financeiro:** R$ 0,00 (sem contratação de APIs, planos pagos ou serviços terceirizados).
- **Sem chamadas em runtime:** Nenhum tráfego externo à RepDB em tempo de execução durante a sessão de treino do atleta.
- **Isolamento de Estado:** A visualização de mídia nunca altera ou reseta o estado de preenchimento de séries (carga, reps, RIR, notas, drafts locais).
- **Atribuição:** Crédito explícito e visível conforme termos da licença.
- **Proibição de Assets Premium:** Arquivos da pasta `premium-samples/` da RepDB são estritamente proibidos em produção.
- **Proibição de IA Generativa com Imagens RepDB:** As imagens não são usadas como referência ou treino para modelos generativos.

---

## 2. Fonte de Assets e Licenciamento

- **Provedor:** RepDB Free Edition
- **Repositório Oficial:** [https://github.com/RepDB/exercise-dataset](https://github.com/RepDB/exercise-dataset)
- **Licença de Dados:** [LICENSE-DATA.md](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md) (Open Data License / permissão de uso gratuito com atribuição).
- **Atribuição Oficial:**
  ```text
  Exercise data by RepDB (repdb.co)
  ```
  Com link apontando para `https://repdb.co`.
- **Áreas com Atribuição na Aplicação:**
  1. Em cada diálogo de execução (`ExerciseExecutionDialog`) no rodapé explicativo.
  2. Na tela de perfil do usuário (`/profile`), sob a seção "Sobre o Trainvy & Licenças".

---

## 3. Estratégia de Hospedagem Estática

Em vez de consumir a API da RepDB ou hotlinkar URLs externas em runtime:
- Os assets autorizados foram importados localmente para o repositório frontend em:
  `bootcamp-treinos-frontend/public/exercise-media/repdb/`
- **Volume importado:**
  - 96 arquivos de imagem no formato WebP (2 imagens por exercício: posição inicial `start` e pico de contração `peak`).
  - Tamanho total: **1.77 MB**.
- **Vantagens:**
  - Zero latência e zero risco de downtime de terceiros.
  - Cache HTTP estático imediato pelo Next.js.
  - Segurança contra path traversal e sem necessidade de configurar domínios remotos permissivos no `next/image`.

---

## 4. Modelo de Dados (Prisma)

A entidade `ExerciseMedia` foi modelada de forma independente e aditiva, preservando o histórico de treinos e os exercícios existentes:

```prisma
enum ExerciseMediaType {
  IMAGE_SEQUENCE
  GIF
  VIDEO
}

model ExerciseMedia {
  id                 String            @id @default(uuid())
  exerciseId         String
  provider           String            @default("repdb")
  providerExerciseId String
  mediaType          ExerciseMediaType @default(IMAGE_SEQUENCE)
  startImagePath     String?
  endImagePath       String?
  motionPath         String?
  instructions       Json?
  attributionName    String?           @default("RepDB")
  attributionUrl     String?           @default("https://repdb.co")
  isActive           Boolean           @default(true)
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  exercise           Exercise          @relation(fields: [exerciseId], references: [id], onDelete: Cascade)

  @@unique([exerciseId, provider, mediaType])
  @@index([exerciseId])
  @@index([providerExerciseId])
}
```

### Invariantes do Modelo
1. Desacoplamento total de `WorkoutSession`, `SessionExercise` e `WorkoutPlan`. A exclusão ou desativação de uma mídia nunca impacta o histórico executado do atleta.
2. Suporte multi-provedor (`provider`), permitindo futuras integrações de vídeos próprios sem quebrar o catálogo atual.
3. Chave composta única `[exerciseId, provider, mediaType]`, garantindo idempotência estrita no sincronizador.

---

## 5. Instruções Anatômicas e de Execução (PT-BR)

As instruções de execução são armazenadas na própria entidade `ExerciseMedia` em formato JSON estruturado com 4 campos fiéis à biomecânica do movimento:
- `description`: Resumo conciso do padrão de movimento e grupamentos primários.
- `setup`: Posicionamento inicial (banco, apoios, pegada e postura da coluna/escápulas).
- `execution`: Trajetória do movimento, fase excêntrica e pico de contração.
- `tips`: Cuidados essenciais de segurança e respiração (sem orientações médicas).

**Justificativa de Modelagem:**
Armazenar as instruções dentro de `ExerciseMedia` mantém o pacote de mídia (imagens + instruções + atribuição) auto-contido e versionado por provedor, sem poluir a tabela `Exercise` canônica.

---

## 6. Mapeamento Canônico Expandido (53 Exercícios Globais)

O catálogo global do Trainvy conta com 53 exercícios canônicos mapeados para a Free Edition do RepDB, cobrindo os principais movimentos de musculação:

| Trainvy UUID (Sufixo) | Exercício Trainvy | RepDB Slug |
| :--- | :--- | :--- |
| `...101` | Supino Reto com Barra | `bench-press` |
| `...102` | Supino Reto | `bench-press` |
| `...103` | Supino Inclinado com Halteres | `incline-db-press` |
| `...104` | Supino Inclinado | `incline-barbell-bench-press` |
| `...105` | Agachamento Livre | `squat` |
| `...106` | Agachamento | `squat` |
| `...107` | Agachamento Búlgaro | `bulgarian-split-squat` |
| `...108` | Leg Press 45 | `leg-press` |
| `...109` | Leg Press Horizontal | `seated-cable-row` |
| `...110` | Cadeira Extensora | `leg-extension` |
| `...111` | Cadeira Flexora | `seated-leg-curl` |
| `...112` | Mesa Flexora | `leg-curl` |
| `...113` | Stiff | `stiff-leg-deadlift` |
| `...114` | Elevação Pélvica | `hip-thrust` |
| `...115` | Cadeira Abdutora | `seated-cable-abduction` |
| `...116` | Cadeira Adutora | `cable-adduction` |
| `...117` | Panturrilha em Pé | `calf-raise` |
| `...118` | Panturrilha Sentado | `seated-calf-raise` |
| `...119` | Puxada Frontal na Máquina | `lat-pulldown` |
| `...120` | Puxada Frontal | `lat-pulldown` |
| `...121` | Remada Curvada com Barra | `bent-over-row` |
| `...122` | Remada Curvada | `bent-over-row` |
| `...123` | Desenvolvimento Militar | `overhead-press` |
| `...124` | Desenvolvimento com Halteres | `dumbbell-shoulder-press` |
| `...125` | Elevação Lateral | `lateral-raise` |
| `...126` | Crucifixo Inverso na Máquina | `reverse-fly` |
| `...127` | Rosca Direta com Barra | `barbell-curl` |
| `...128` | Rosca Direta | `bicep-curl` |
| `...129` | Rosca Martelo | `hammer-curl` |
| `...130` | Rosca Scott | `preacher-curl` |
| `...131` | Tríceps Corda | `tricep-pushdown` |
| `...132` | Tríceps Testa | `skull-crusher` |
| `...133` | Tríceps Francês Unilateral | `tricep-extension` |
| `...134` | Paralelas | `dips` |
| `...135` | Crucifixo Inclinado | `incline-dumbbell-fly` |
| `...136` | Barra Fixa | `pull-up` |
| `...137` | Remada Cavalinho | `t-bar-row` |
| `...138` | Remada Unilateral com Halteres | `dumbbell-row` |
| `...139` | Rosca Concentrada | `concentration-curl` |
| `...140` | Levantamento Terra | `deadlift` |
| `...141` | Levantamento Terra Sumô | `sumo-deadlift` |
| `...142` | Agachamento Frontal | `front-squat` |
| `...143` | Remada Alta com Barra | `upright-row` |
| `...144` | Hiperextensão Lombar | `back-extension` |
| `...145` | Leg Press Unilateral | `single-leg-press` |
| `...146` | Desenvolvimento Arnold | `arnold-press` |
| `...147` | Face Pull no Cabo | `face-pull` |
| `...148` | Elevação Lateral no Cabo | `cable-lateral-raise` |
| `...149` | Encolhimento com Halteres | `dumbbell-shrug` |
| `...150` | Abdominal no Cabo | `cable-crunch` |
| `...151` | Elevação de Pernas Suspenso | `hanging-leg-raise` |
| `...152` | Avanço com Halteres | `walking-lunge` |
| `...153` | Rosca Spider | `spider-curl` |

- **Cobertura canônica:** 53 / 53 exercícios cobertos (100%).
- **Fallback Inteligente:** Caso um atleta tenha exercícios personalizados antigos com o mesmo nome do catálogo global, `GetExerciseMedia`, `GetWorkoutDay` e `GetWorkoutSession` herdam transparentemente a mídia e as instruções do exercício global homônimo.
- **Coach AI Guidance:** O system prompt do Coach AI instrui o modelo a prescrever estritamente os nomes canônicos padronizados do catálogo para garantir demonstrações visuais imediatas nos treinos sugeridos.

---

## 7. Scripts de Importação e Sincronização

1. **Download Seguro e Validação de Assets:**
   - Script: `bootcamp-treinos-api/src/scripts/import-repdb-assets.ts`
   - Valida contra path-traversal e bloqueia terminantemente qualquer caminho de `premium-samples/`.
   - Gera os arquivos no destino estático do frontend.
2. **Sincronização no Banco de Dados:**
   - Script: `bootcamp-treinos-api/src/scripts/seed-exercise-media.ts` (`npm run seed:media`).
   - Módulo: `bootcamp-treinos-api/src/domain/canonical-media-sync.ts`.
   - Idempotente: executa `upsert` com base na chave composta `exerciseId_provider_mediaType`. Múltiplas execuções preservam os dados sem criar duplicatas.

---

## 8. Arquitetura de API, Cache e Performance

### Prevenção de Requisições N+1
Para evitar 30 requisições individuais ao renderizar 30 exercícios em um treino ou catálogo:
- O campo booleano `hasMedia: boolean` é calculado e retornado agregado diretamente nas consultas:
  - `GET /exercises` (`ListExercises`)
  - `GET /workout-plans/:id/days/:dayId` (`GetWorkoutDay`)
  - `GET /workout-sessions/:id` (`GetWorkoutSession`)
  - `POST /workout-sessions/:id/exercises` (`AddExerciseToWorkoutSession`)
- Esse campo permite que o seletor exiba a tag `Demo` e os cards renderizem o botão "Ver execução" sem realizar qualquer requisição extra de rede.

### Busca Sob Demanda
O endpoint autenticado de detalhe de mídia:
```http
GET /exercises/:exerciseId/media
```
- Só é disparado quando o usuário clica ativamente em "Ver execução".
- Implementado sob o padrão `Fastify Route -> Use Case (GetExerciseMedia) -> Prisma`.
- Retorna 200 com `hasMedia: false` amigável caso não haja imagens (evitando erro 500).
- Validação estrita de autorização: permite exercícios globais e customizados do próprio usuário autenticado; bloqueia exercícios customizados de terceiros com 404 (NotFoundError).

---

## 9. Componentização Frontend

- `ExerciseMediaPreview`:
  - Exibe abas interativas de "Posição Inicial" e "Pico de Contração".
  - Suporta 1 imagem (exercícios estáticos / isometria), 2 imagens (sequência padrão) ou estado vazio ("Demonstração indisponível").
- `ExerciseExecutionDialog`:
  - Modal/Drawer responsivo compatível com mobile (320px, 375px, 390px, 768px e Desktop).
  - Inclui abas para imagens e instruções anatômicas em 4 seções.
  - Exibe rodapé com crédito oficial para RepDB com link externo seguro (`rel="noopener noreferrer"`).
  - Preserva 100% dos dados da sessão ativa: não causa re-render destrutivo no formulário de séries nem dispara mutações de treino.

---

## 10. Extensibilidade Futura (Vídeos e Animações)

- O enum `ExerciseMediaType` já prevê `GIF` e `VIDEO`.
- A coluna `motionPath` no banco de dados e nos schemas Zod/OpenAPI está pronta para armazenar caminhos de vídeo MP4/WebM ou GIFs animados.
- Critério para fornecedores futuros: pacote com permissão comercial explícita comprovada, hospedagem local autorizada e licença documentada.
