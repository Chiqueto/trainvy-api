> 30/10/2026: [AI pessoal e aceites separados de IA/3D](19-FEATURE-TERMS-AND-PERSONAL-AI.md) atualizam o bloqueio de geracao pessoal deste documento. Regras profissionais para terceiros permanecem vigentes.

> Atualização: a [flag administrativa de testes e a busca CREF](18-ADMIN-CREF-TEST-MODE.md) permitem dispensar temporariamente a exigência de verificação, sem alterar o cadastro para VERIFIED.

# Verificação profissional e modos de IA — 29/10/2026

## Análise da arquitetura e plano executado

A implementação preserva Next.js, Fastify, Better Auth, Prisma, Zod/OpenAPI, Orval e Gemini 2.5 Flash. Não adiciona provedor pago ou dependência.

O código real já possuía `User.accountType/systemRole`, assinatura e entitlements separados, vínculo `CoachAthlete`, `WorkoutPlanTemplate`, `WorkoutPrescription` com payload/version e bloqueios de linha, planos pessoais e execução em `WorkoutSession`, `SessionExercise` e `WorkoutSet`. Conversas e aprovações técnicas de tools já eram persistidas em `AiConversation`, `AiMessage` e `AiToolExecution`. As permissões comerciais não verificavam habilitação. O gerador individual e o chat podiam escolher treinos para alunos; os geradores também devolviam treinos genéricos em falhas do provedor.

O plano adotado foi: verificação profissional aditiva; autorização no domínio/backend; aprovação versionada da publicação; extração multimodal e confirmação para alunos; adaptação das telas/contratos; testes de autorização, concorrência e regressão; relatório 3D sem alterar a biblioteca.

## Permissões atuais

| Operação | Aluno / profissional não verificado | Personal com verificação vigente |
|---|---|---|
| Criar, editar e executar plano pessoal manualmente | Permitido, por ownership | Permitido, por ownership |
| Histórico, séries e sessões próprias | Permitido | Permitido |
| Organizar ficha com IA, revisar e confirmar importação | Permitido | Permitido |
| Explicações gerais e leitura de dados próprios pelo chat | Permitido | Permitido |
| Gerar propostas personalizadas por tools de planejamento | Bloqueado | Rascunhos próprios, com revalidação por execução |
| Gerenciar alunos, acervo profissional e prescrever | Bloqueado | Conforme entitlement e vínculo ativo |
| Publicar prescrição para aluno | Bloqueado | Aprovação explícita da versão atual e vínculo ativo |
| Aprovar cadastro CREF | Somente ADMIN persistido; autoaprovação proibida | Ser COACH não concede ADMIN |

Não há necessidade de contratar um personal para usar o registro e planejamento pessoal. ADMIN ou plano INTERNAL não dispensam verificação para prescrever.

O backend resolve o modo pela identidade persistida. Campos enviados pelo cliente não escolhem papel ou modo. `getAiTools` e `getSessionAiTools` expõem somente leitura. `getProfessionalAiTools` reconsulta identidade/verificação a cada execução, inclusive ao responder aprovações antigas de tools. Essas aprovações salvam rascunhos, nunca publicam prescrições para terceiros. Sessões próprias continuam com chat de organização/leitura; o registro manual permanece disponível.

O chat do aluno valida papéis de mensagem, restringe tools e verifica a resposta completa antes de devolvê-la, além de redirecionar solicitações detectadas de prescrição. As verificações textuais são defesa adicional, não prova de compreensão semântica perfeita. Testes adversariais com linguagem real e revisão humana continuam necessários antes de lançamento.

## Verificação de CREF e titularidade

`ProfessionalRegistration` guarda nome declarado, número completo, UF, categoria, estado, revisão, prazo e orientação pública. Estados: `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, `EXPIRED`, `SUSPENDED`. Não há aprovação automática ou backfill de profissionais verificados. A conta pode terminar o cadastro; os recursos profissionais permanecem bloqueados.

O profissional acessa `/personal/verification` ou a área `/personal` pendente e envia o cadastro. Alterações retornam a pendente e invalidam a validade anterior. `VERIFIED` sem prazo válido, com prazo vencido ou inválido tem estado efetivo EXPIRED, sem depender de cron. Há revalidação por nova revisão. Não há consulta periódica automática ao conselho.

O administrador usa `/admin/professionals`. Deve consultar fonte oficial, conferir situação e categoria/âmbito de atuação e comprovar que a conta pertence ao titular. **Correspondência de nome e CREF públicos não comprova titularidade.** A aprovação exige método de conferência (`OFFICIAL_CONTACT`, `DOCUMENT_REVIEW` ou `LIVE_IDENTITY_CHECK`) e referência restrita ao procedimento realizado. O procedimento humano externo e seu canal seguro precisam ser definidos pela operação; o sistema não fabrica essa prova nem coleta CPF por padrão. `NOT_CONFIRMED` não permite aprovar. Fonte indisponível deve resultar em pendência, não liberação.

`ProfessionalVerificationReview` é append-only pelas APIs e registra administrador, revisão, resultado, URL oficial, data da conferência, evidência mínima, conferências de identidade/situação/habilitação, validade e snapshot do cadastro com método/referência de titularidade. O histórico é consultável apenas pelo admin. O profissional recebe somente estado, prazo e orientação pública. Não incluir CPF, dados de saúde ou cópias de documentos nos campos de evidência; usar referências restritas. Autoaprovação e revisão de cadastro desatualizado são rejeitadas.

Configuração:

- `PROFESSIONAL_VERIFICATION_VALIDITY_DAYS`: padrão 180, inteiro entre 1 e 365. Aplica-se às novas verificações; não amplia prazos já concedidos.
- `PROFESSIONAL_OFFICIAL_SOURCE_HOSTS`: hosts oficiais exatos adicionais, separados por vírgula, após conferência pela operação. Não aceita wildcard. Há allowlist inicial CONFEF, consultas CREF/SP e CREF/RJ, listas CONFEF e CREF6/MG.
- URLs devem usar HTTPS, sem credenciais ou porta alternativa. São metadados de consulta humana: a API não faz fetch, scraping ou inferência de regularidade pela URL.

### Pesquisa de integrações oficiais

Foram consultadas fontes oficiais públicas; não foi identificada, na documentação consultada, uma API oficial documentada adequada para esta integração. Isso não demonstra inexistência de convênios ou APIs regionais restritas. Solicitar informações diretamente aos conselhos antes de desenvolver adaptadores.

- [FAQ oficial CONFEF: consulta a registrados](https://faq.confef.org.br/faq/index.php?action=faq&cat=12&id=8&artlang=pt-br), que aponta para a [consulta oficial](https://www.confef.org.br/confef/registrados/).
- [Consulta de inscritos CREF/SP](https://cref-sp.implanta.net.br/servicosOnline/Publico/ConsultaInscritos): consulta pública com campos de cadastro e limites de resultados; não foi tratada como autorização para automação.
- [Consulta de inscritos CREF/RJ](https://cref-rj.implanta.net.br/servicosOnline/Publico/ConsultaInscritos).
- [CREF6/MG — Acesso ao Público](https://www.cref6.org.br/servico/acesso-ao-publico/26): informa que a consulta cadastral não substitui cédula/declarações emitidas pelo conselho.

## Aprovação e concorrência

Geração profissional retorna `status: DRAFT` para edição. Criação/edição persistem rascunhos. Alocar um modelo agora cria DRAFT, sem envio imediato. Na lista, o botão leva ao editor para revisão completa.

`POST /coach/prescriptions/:id/send` exige `{version, approval: true}`. O backend bloqueia a linha do profissional, reconsulta permissões e validade, bloqueia a prescrição, confere versão e estado, bloqueia/confere vínculo ativo e grava SENT com `approvedByUserId`, `approvedAt`, `approvedVersion` e `approvedSnapshot` contendo nome, notas e payload final. Publicação e edição competem por bloqueios compatíveis; a versão desatualizada recebe 409. A edição exige versão no HTTP e revalida o profissional dentro da transação. A IA não possui tool de publicação.

Prescrições enviadas continuam imutáveis. Mudanças materiais exigem outro rascunho e aprovação. O snapshot publicado permanece preservado mesmo após aceite ou edição do plano pessoal. Editar a cópia do aluno remove `acceptedWorkoutPlanId` da associação de aprovação, dentro da transação de edição; não altera o snapshot original nem sessões concluídas. Histórico antigo sem metadados de aprovação continua não verificado. Não são criadas aprovações retroativas; novos aceites desses envios exigem uma versão novamente revisada pelo profissional. Planos já aceitos e sessões existentes são preservados.

Consultas de prescrições por personal também exigem habilitação e vínculo ativo. Revogação encerra acesso futuro aos dados do aluno; cancelar uma prescrição própria ou encerrar vínculo continuam operações de proteção. O aluno mantém acesso aos próprios dados.

## Importação multimodal

`POST /planning/ai-generate` foi preservado como operationId, mas agora **extrai** a ficha fornecida, sem gerar uma rotina individual. Aceita texto, PDF, PNG/JPEG/WebP e áudio WebM/Ogg/WAV/MP3/MP4. Valida extensão, MIME, assinatura binária, tamanho de até 10 MiB e representação base64 limitada; não aceita URLs remotas. PDFs com marcadores de conteúdo ativo conhecidos são rejeitados. Isso não equivale a antivírus completo ou parser de segurança de PDF; processamento ocorre no provedor configurado e requer avaliação operacional.

O schema exige null nos campos desconhecidos. Citações por caminho identificam a origem declarada de cada campo. Para texto, a aplicação verifica que as citações existem na entrada e que nomes, parâmetros, unidades e dias correspondem ao campo; valores não sustentados são removidos. Exercícios sem evidência são descartados. Para arquivos, a citação é saída do extrator e requer conferência humana com o original: não é uma prova independente da leitura do provedor. O extrator não recebe perfil ou histórico para completar informações. Falhas não retornam rotinas genéricas.

A prévia tem HMAC com domínio próprio, identidade do usuário, hash do material, tipo, conteúdo extraído e vencimento de 30 minutos. Não há persistência automática. A interface permite corrigir todos os parâmetros expostos, preencher os ausentes e confirmar por checkbox e botão. `POST /planning/imports/confirm` valida a assinatura, usuário, prazo e schema completo sem defaults de dia, tipo ou aquecimento. Salva plano pessoal inativo, com conteúdo extraído e final confirmado, autor/data, hash e `professionalApproval:false`. O hash único da prévia impede replay. Correções são dados explicitamente confirmados pelo usuário, sem receber selo profissional.

Arquivos originais não são armazenados. Mensagens de chat persistidas trocam partes de arquivo por referência textual sem URL/base64. Conversas antigas não são apagadas retroativamente; a política de retenção desses dados anteriores deve ser tratada por migração operacional específica e avaliação de privacidade. Provedor, logs, backups, acesso administrativo e retenção de evidências também exigem governança. A API não registra novos uploads em armazenamento público.

## Contratos e arquivos

Novos endpoints com sessão, Zod/OpenAPI e Orval:

| Método/rota | Operação |
|---|---|
| GET/PUT `/me/professional-registration` | Consultar/enviar cadastro próprio |
| GET `/admin/professional-registrations` | Revisar fila (até 100 cadastros) |
| POST `/admin/professional-registrations/:userId/review` | Decisão administrativa auditável |
| GET `/admin/professional-registrations/:userId/reviews` | Evidências restritas (até 100 revisões) |
| POST `/planning/imports/confirm` | Confirmar importação pessoal |

Alterados: `/ai`, `/planning/ai-generate`, `/account/commercial-context` (campo de verificação), atualização/envio/listagem/detalhe de prescrições, geração profissional e alocação de modelos. O gerador profissional e o importador preservam Gemini.

Arquivos principais backend: `prisma/schema.prisma`; `prisma/migrations/20261029120000_professional_verification/migration.sql`; `src/domain/{professional-verification,ai-organizer-policy,ai-upload,workout-import,coach-athlete,coach-prescription}.ts`; `src/schemas/{professional-verification,planning-ai,coach-prescription,commercial}.ts`; `src/routes/{professional-verification,ai,planning,coach-prescription}.ts`; `src/ai/{tools,system-prompt}.ts`; use cases de verificação, contexto comercial, importação/geração, envio/edição/aceite/leitura de prescrições, alocação de modelos, criação/edição de planos e persistência de mensagens; registro das rotas em `src/index.ts` e `src/scripts/export_swagger.ts`; `.env.example`; fixtures e testes.

Frontend: cliente Orval e `swagger.json`; cadastro/status em `app/personal`; revisão em `app/admin/professionals`; importação em `app/planning/_components/athlete-ai-workout-plan-modal.tsx`; chat; ações/editor/lista de prescrições; alocação de modelos; autoria/aprovação nos recebidos; validação do editor profissional; testes correspondentes. O editor profissional aceita nomes ainda não resolvidos no catálogo, como seu contrato atual; a validação de seleção por ID permanece no editor pessoal.

## Migração e operação antes de publicar

A migração é aditiva: enum e tabelas de verificação, metadados de aprovação nullable e proveniência/hash de importação no plano. Não apaga planos, exercícios ou histórico e não altera snapshots de sessões. Profissionais existentes não ganham verificação automática. Planejar comunicação e atendimento para a fila inicial.

Não foi aplicada migração ao banco da aplicação. O banco de testes fornecido já possuía schema, mas não `_prisma_migrations`; `migrate deploy` recusou por P3005. Para validar, somente nele foi aplicado o SQL aditivo em transação, restaurando também índices parciais previstos nas migrações antigas que estavam ausentes. Antes de produção, auditar baseline/histórico do ambiente, gerar backup e aplicar pelo procedimento de migração adequado. Não usar reset ou db push em produção para resolver esse estado.

O histórico de testes e resultados finais é registrado na entrega. As suítes antigas de geração foram preservadas e passaram a executar com identidades profissionais sintéticas verificadas; novas suítes verificam os bloqueios de alunos e não verificados.

## Biblioteca 3D: riscos e proposta futura, sem refatoração

Foi inspecionado o mapa estático `app/_components/exercise-3d/exercises.ts`, o preview e o viewer. A presença no mapa e a abertura do visualizador não constituem revisão biomecânica. Não foi encontrado, nesses componentes, workflow persistido de revisão humana com versão e publicação. `ExerciseMedia.isActive` controla mídia do catálogo; não substitui automaticamente o controle dos modelos React Three Fiber mapeados em código. Nenhuma animação recebeu selo de validação nesta tarefa e nenhum modelo/animação foi alterado.

Proposta futura:

1. Criar revisão por UUID de exercício e versão/hash imutável dos assets, cinemática e mapa muscular.
2. Estados DRAFT → UNDER_REVIEW → APPROVED ou REJECTED; qualquer alteração material retorna a DRAFT.
3. Registrar profissional habilitado/verificado, evidência científica, checklist de amplitudes/apoios/cadência/anatomia/shading, observações e data. Aprovar apenas a versão efetivamente examinada.
4. Publicar somente a versão APPROVED vigente; marcar as demais como não revisadas em ambiente restrito. Não interpretar destaque de cor como EMG ou esforço medido.
5. Sem demonstração aprovada, usar alternativa estática já revisada ou instruções textuais apropriadas; não substituir silenciosamente por animação de movimento diferente.
6. Prever retirada imediata de publicação e invalidação de caches. Até esse mecanismo existir, conteúdo sabidamente incorreto precisa ser removido do mapeamento público e republicado via fluxo controlado de código. A flag de mídia do banco, isoladamente, não garante esse bloqueio do 3D.

## Limitações e validação externa

Não há API oficial de verificação integrada, validação automática de identidade, scraping ou garantia sobre situação registral posterior à consulta. Suspensão conhecida deve ser registrada prontamente; vencimentos bloqueiam pelo prazo configurado. A fila administrativa ainda tem limite de 100 sem paginação. A interface não é um sistema de custódia de documentos de identidade. A conferência de PDFs/imagens/áudios pode ser imperfeita e sempre exige revisão da prévia. Testes com mocks não comprovam acurácia de OCR/transcrição em documentos reais.

Antes do lançamento, submeter a política de habilitação/categorias/UF/escopo, comprovação de titularidade, periodicidade e suspensão, redação de termos, autoria/aprovação, direitos do aluno após fim do vínculo, minimização/retenção, base legal de dados sensíveis, contratos com provedor e procedimento de revisão humana à avaliação jurídica e de profissionais habilitados. Não há afirmação de regularização jurídica automática nem de eliminação das obrigações da plataforma.

## Validação executada e resultados

- Backend: rodada completa com 691 testes aprovados antes da ampliação final. A rodada ampliada executou 701 testes: 700 aprovados e uma asserção antiga de concorrência exigindo que o envio sempre vencesse a edição. Essa expectativa foi corrigida para verificar ambos os resultados possíveis: versão original publicada e edição rejeitada, ou edição concluída e aprovação antiga bloqueada. A reexecução das quatro suítes afetadas passou com 60/60 testes, incluindo 12 casos de concorrência. Nenhum teste foi removido.
- Frontend: rodada completa final com **566 testes aprovados e 2 falhas preexistentes em `tests/machine-chest-press.test.ts`**. As mesmas falhas foram reproduzidas isoladamente, e os arquivos 3D/teste correspondentes não têm diff nesta tarefa. Uma expectativa da fila ainda trata o crucifixo reto como não implementado; a outra encontra ângulo aproximado de 70,83° para um limite de teste menor que 65°. São inconsistências para revisão técnica/profissional, sem afirmar validação ou invalidade clínica da animação apenas pelo teste. A biblioteca permanece sem alterações conforme escopo solicitado.
- `npx tsc --noEmit` nos dois repositórios: aprovado.
- `npm run build` no frontend: aprovado, incluindo as rotas administrativas e profissionais novas e onboarding com formulário disponível mesmo quando o chat está habilitado.
- ESLint dos novos módulos backend e das novas telas/actions frontend: aprovado. OpenAPI exportado e cliente Orval regenerado. O mutator existente de cookies permanece no servidor; chamadas novas da interface passam por server actions.
- Os testes de IA usam respostas controladas do provedor para verificar limites e persistência. Não houve verificação real de um CREF nem validação de acurácia de OCR/transcrição com documentos pessoais reais.

O relatório não declara a suíte frontend integralmente verde, nem classifica as duas falhas 3D como regressões desta mudança. A revisão humana de habilitação, a conferência de identidade e a avaliação jurídica continuam etapas operacionais externas antes do lançamento.

## Inventário dos arquivos alterados

### Frontend

- `app/_components/chat.tsx`
- `app/_lib/api/fetch-generated/index.ts`
- `app/admin/_components/admin-dashboard-layout.tsx`
- `app/admin/professionals/_actions.ts`
- `app/admin/professionals/page.tsx`
- `app/admin/professionals/review.tsx`
- `app/onboarding/page.tsx`
- `app/personal/_actions.ts`
- `app/personal/_components/professional-registration-form.tsx`
- `app/personal/_verification-actions.ts`
- `app/personal/alunos/[athleteId]/_components/coach-ai-prescription-modal.tsx`
- `app/personal/alunos/[athleteId]/_components/coach-prescription-builder.tsx`
- `app/personal/alunos/[athleteId]/_components/coach-prescriptions-list.tsx`
- `app/personal/modelos/_components/allocate-template-modal.tsx`
- `app/personal/modelos/_components/templates-list.tsx`
- `app/personal/page.tsx`
- `app/personal/verification/page.tsx`
- `app/planning/_actions.ts`
- `app/planning/_components/athlete-ai-workout-plan-modal.tsx`
- `app/planning/_components/received-prescriptions-card.tsx`
- `app/planning/_components/workout-plan-builder.tsx`
- `app/planning/_lib/workout-plan-builder.ts`
- `app/planning/page.tsx`
- `docs/02-ROLES-AND-PERMISSIONS.md`
- `docs/05-AI-AND-RAG.md`
- `docs/17-PROFESSIONAL-VERIFICATION-AND-AI-MODES.md`
- `swagger.json`
- `tests/account-setup.test.ts`
- `tests/chat.test.tsx`
- `tests/coach-prescription-save.test.tsx`
- `tests/coach-workout-prescriptions-ui.test.tsx`
- `tests/onboarding.test.tsx`
- `tests/organizer-import.test.tsx`

### Backend

- `.env.example`
- `docs/02-ROLES-AND-PERMISSIONS.md`
- `docs/05-AI-AND-RAG.md`
- `docs/17-PROFESSIONAL-VERIFICATION-AND-AI-MODES.md`
- `prisma/migrations/20261029120000_professional_verification/migration.sql`
- `prisma/schema.prisma`
- `src/ai/system-prompt.ts`
- `src/ai/tools.ts`
- `src/domain/ai-organizer-policy.ts`
- `src/domain/ai-upload.ts`
- `src/domain/coach-athlete.ts`
- `src/domain/coach-prescription.ts`
- `src/domain/professional-verification.ts`
- `src/domain/workout-import.ts`
- `src/index.ts`
- `src/routes/ai.ts`
- `src/routes/coach-prescription.ts`
- `src/routes/planning.ts`
- `src/routes/professional-verification.ts`
- `src/schemas/coach-prescription.ts`
- `src/schemas/commercial.ts`
- `src/schemas/planning-ai.ts`
- `src/schemas/professional-verification.ts`
- `src/scripts/export_swagger.ts`
- `src/usecases/AcceptWorkoutPrescription.ts`
- `src/usecases/AllocateWorkoutPlanTemplate.ts`
- `src/usecases/CreateWorkoutPlan.ts`
- `src/usecases/EditWorkoutPlan.ts`
- `src/usecases/GenerateAthleteWorkoutPlanDraftWithAi.ts`
- `src/usecases/GenerateCoachPrescriptionDraftWithAi.ts`
- `src/usecases/GetCommercialContext.ts`
- `src/usecases/GetWorkoutPrescriptionDetails.ts`
- `src/usecases/ListAthletePrescriptions.ts`
- `src/usecases/ListCoachPrescriptions.ts`
- `src/usecases/ProfessionalVerification.ts`
- `src/usecases/SaveAiMessages.ts`
- `src/usecases/SendWorkoutPrescription.ts`
- `src/usecases/UpdateWorkoutPrescriptionDraft.ts`
- `tests/ai/conversation-persistence.spec.ts`
- `tests/ai/hotfix-2-8-1-save-draft.spec.ts`
- `tests/ai/organizer-extraction.spec.ts`
- `tests/ai/planning-ai.spec.ts`
- `tests/domain/professional-ai-policy.spec.ts`
- `tests/helpers/verified-coach.ts`
- `tests/routes/coach.spec.ts`
- `tests/routes/coach-prescription.spec.ts`
- `tests/routes/coach-prescription-save.spec.ts`
- `tests/routes/coach-progress.spec.ts`
- `tests/routes/coach-template.spec.ts`
- `tests/usecases/CoachAthleteConcurrency.spec.ts`
- `tests/usecases/CoachAthleteFoundation.spec.ts`
- `tests/usecases/CoachAthleteOverview.spec.ts`
- `tests/usecases/CoachPrescriptionConcurrency.spec.ts`
- `tests/usecases/ProfessionalVerification.spec.ts`
- `tests/usecases/SportsAdvancedAndAdminPlans.spec.ts`
- `tests/usecases/WarmupPrescription.spec.ts`

