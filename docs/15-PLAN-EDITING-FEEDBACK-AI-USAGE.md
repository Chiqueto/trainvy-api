# Edição, feedback e medição operacional da IA

Decisão de escopo em 27/10/2026: RAG/biblioteca e cobrança automática ficam fora desta etapa. A IA usa perfil, histórico e avaliações estruturados. Catálogo e animações são um trabalho separado.

- `GET /workout-plans/:id/edit`: plano do próprio usuário com dias, prescrições e alternativas para hidratar o editor.
- `PUT /workout-plans/:id`: edição transacional, sem alterar ativação ou vínculo com periodização. Valida ownership de todos os IDs e acesso aos exercícios. Preserva IDs mantidos e snapshots históricos. Bloqueia sessão aberta no mesmo plano; compartilha lock com `StartWorkoutSession`.
- `GET`/`PUT /workout-sessions/:sessionId/feedback`: avaliação única, editável, apenas para o atleta dono e sessão concluída. Sensação, dor, fadiga, sono e notas. Escalas opcionais de 0 a 10, notas até 2000 caracteres.
- `getRecentTrainingFeedback`: tool somente leitura, últimos dez relatos do próprio atleta, exige consentimento de histórico. Mensagens com resultados históricos são redigidas se esse consentimento foi revogado.
- `GET /admin/ai-usage`: exclusivo de ADMIN, período de até 90 dias UTC e filtro por usuário. Totais, grupos por funcionalidade/modelo, top 20 usuários, dias e 30 eventos recentes.

`AiUsageEvent` cobre os cinco fluxos: CHAT, SESSION_CHAT, ATHLETE_PLAN, COACH_PRESCRIPTION e COACH_INSIGHTS. Chat registra cada etapa do modelo, não apenas a última resposta. Gerações estruturadas registram sucesso e falha; uso ausente não vira custo zero. Falha do registro operacional é logada sem descartar a resposta da IA. Prompts, anexos e respostas não são copiados para a tabela de consumo.

Estimativa em USD pelas tarifas Standard pagas de Gemini 2.5 Flash, verificadas em 27/10/2026: entrada 0,30 / milhão, saída 2,50 / milhão, cache 0,03 / milhão. Entrada com áudio usa 1,00 / milhão e cache 0,10 / milhão para toda a entrada mista (estimativa conservadora). Output do SDK já contém reasoning; não somar novamente. Tarifas e versão ficam preservadas por evento. Franquia gratuita, impostos, câmbio, descontos e retries sem uso reportado não são considerados. Não é fatura nem débito de assinatura; quotas técnicas existentes continuam separadas.

Fonte: [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).

Publicação requer a migração `20261027200000_session_feedback_and_ai_usage` antes do deploy. OpenAPI/Orval foram atualizados. Testes usam o banco isolado configurado por `TEST_DATABASE_URL`; nenhum teste deve executar contra `DATABASE_URL` principal. O banco de testes desta sessão não possui baseline no histórico do Prisma; a migração nova foi aplicada diretamente nesse banco pela configuração protegida `prisma.test.config.ts`.
