# Perfil esportivo, prescrição e criação de planos

Implementação aditiva de 27/10/2026, preservando Route → Use Case → Prisma e os contratos Zod/OpenAPI/Orval.

## Perfil

`GET`/`PATCH /me/sports-profile` leem/alteram exclusivamente o próprio usuário. Campos opcionais: `trainingGoals`, `experienceLevel` (BEGINNER/INTERMEDIATE/ADVANCED), `availableEquipment` e `trainingRestrictions`. Não altera logs de métricas corporais. IA de planejamento, prescrição e sessão recebe esses dados como contexto declarado, não diagnóstico.

`/me` aceita `bodyFatPercentage` omitido ou nulo: omissão preserva valor anterior; nulo limpa. O cadastro corporal completo exige os mesmos campos anteriores (peso/altura/idade), sem exigir gordura corporal. A tool de IA não fabrica zero para um valor desconhecido.

## Prescrição

Campos opcionais: `repsMin`, `repsMax`, `targetRir`, `targetLoadInGrams`, `tempo`. Faixa exige ambos os limites positivos e ordenados; RIR aceita 0–10; carga é inteira em gramas. `reps` legado permanece. O schema/normalizador compartilhado é aplicado nos fluxos de plano, periodização, duplicação, prescrição e modelos do personal.

Snapshots em `SessionExercise`: `plannedRepsMin`, `plannedRepsMax`, `plannedTargetRir`, `plannedTargetLoadInGrams`, `plannedTempo`. Sessão/histórico/contexto da IA leem snapshots. Dados antigos permanecem nulos. Metas não viram medições: carga/RIR executados permanecem separados e nenhuma série é marcada como concluída por causa de uma meta. Edição legada de um exercício mantido preserva campos avançados omitidos; nulos explícitos limpam os campos.

## Admin

`POST /admin/plans` cria plano e permissões em transação, retorna 201 e audita `PLAN_CREATED`. Código único em maiúsculas; duplicação retorna 409. Requer ADMIN persistido, com nova validação dentro da transação. Não cria assinaturas, não altera preços contratados nem atribui acesso automaticamente.

`PUT /admin/plans/:planId/entitlements` continua sendo o ponto de edição dinâmica, com auditoria antes/depois e resolução comercial em tempo de requisição. Não introduz gating global dos recursos individuais do beta. Biblioteca/limites comerciais de IA preparados no catálogo não passam a ser funcionalidades implementadas por configuração.

Novos planos públicos nesta fase são COACH; planos adicionais ATHLETE e INTERNAL são privados e de atribuição manual. O cadastro gratuito atual é preservado. O preço inicial de novos planos é referência de catálogo; preços existentes ficam somente para consulta na interface desta etapa.

## Futuro reajuste — especificação, sem execução

Não alterar silenciosamente `Subscription.priceInCentsSnapshot`/`currencySnapshot` quando mudar o catálogo. Implementar futuramente uma alteração agendada por assinatura, com preço anterior/novo, moeda, antecedência, evidência de entrega do aviso e auditoria.

Exemplo de política: após avisar o personal, manter **três cobranças adicionais pelo valor antigo e aplicar o novo valor na quarta cobrança elegível**. A antecedência deverá ser configurável e validada contratualmente. Contar cobranças/ciclos reais, não meses de calendário. Definir tratamento para pagamento falho, estorno, trial, pausa, cancelamento/troca de plano e aviso não entregue. Webhooks precisam ser idempotentes, e o reajuste deve poder ser cancelado antes da vigência.

Não há cobrança, agendamento de reajuste ou envio de notificações implementados nesta etapa. Esta é uma política futura de produto, não uma interpretação legal.

## Migração

`20261027210000_sports_profile_advanced_prescription_admin_plans`: campos opcionais em User, WorkoutExercise e SessionExercise, além de `AdminAuditAction.PLAN_CREATED`. Não apaga histórico ou executa backfill de metas. Aplicar antes do deploy. Os testes usam exclusivamente `TEST_DATABASE_URL`; o banco principal não foi alterado.
