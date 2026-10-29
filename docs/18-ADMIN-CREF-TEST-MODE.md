# Admin — flag de CREF e consulta de registros

## Como usar

1. Acesse `/admin` ou `/admin/professionals` com uma conta ADMIN.
2. No card **Verificação de CREF**, desligue **Exigir CREF verificado**, informe o motivo e salve. O motivo já sugere a fase de testes.
3. O personal pode testar os recursos sem cadastrar CREF ou enquanto seu cadastro estiver pendente/expirado. Perfil COACH, conclusão do cadastro, assinatura/entitlements, ownership, vínculos e aprovação explícita das prescrições continuam obrigatórios.
4. Ligue novamente a opção e salve para restaurar a exigência. A mudança vale no backend nas próximas operações, sem rebuild ou alteração de JWT.

A flag é global para este ambiente e começa **ligada**. Apenas ADMIN persistido pode consultá-la ou alterá-la. Mudanças geram `AdminAuditLog` com a ação `PROFESSIONAL_VERIFICATION_POLICY_UPDATED`, administrador, motivo, valores anteriores/novos, revisão e data. Ações simultâneas com uma revisão antiga retornam 409.

Suspensões e rejeições administrativas continuam bloqueadas com a flag desligada. Reenviar o cadastro não remove esses estados: é necessária nova decisão administrativa. Desligar a flag não transforma uma conta ATHLETE em COACH e não altera o cadastro para VERIFIED.

## Buscar e validar CREFs

Em `/admin/professionals`, a seção **Buscar e consultar CREF** permite:

- Buscar cadastros do Trainvy por número, parte do número ou nome, sem diferenciar maiúsculas/minúsculas.
- Filtrar por UF; também aceita o formato completo `987654-G/SP` no campo de busca.
- Abrir a consulta oficial do CREF/SP ou CREF/RJ conforme a UF; as demais UFs apontam para o diretório oficial CONFEF/CREFs.
- Copiar o texto pesquisado para o formulário da fonte oficial.
- Localizar o cadastro e registrar sua validação pelo formulário de revisão: titularidade, situação, âmbito de atuação, método de conferência, evidência e orientação ao profissional.

A busca interna é feita no backend, antes do limite de 100 resultados. Não se restringe aos primeiros cadastros já carregados no navegador. Se não houver cadastro no Trainvy, ainda é possível consultar externamente; para aprovar uma conta, o profissional precisa primeiro enviar seu cadastro.

A consulta externa abre em outra aba. Não há scraping, API oficial presumida ou validação automática por número/nome. A aprovação real do cadastro continua exigindo a revisão humana já implementada, inclusive quando a exigência está desligada para testes.

## Aprovações feitas durante testes

Uma publicação autorizada apenas pela dispensa temporária de CREF grava `verificationMode: TEST` dentro do snapshot aprovado. As APIs retornam `approvalMode: TEST` e as telas de prescrições identificam **teste / CREF não verificado**. Se o profissional já possuir verificação vigente, a aprovação continua marcada VERIFIED.

Reativar a exigência bloqueia novas ações profissionais sem verificação vigente e impede novos aceites de prescrições aprovadas em teste. Uma aprovação de teste não vira aprovação verificada retroativamente: será necessária nova prescrição revisada. Planos pessoais já aceitos e históricos permanecem preservados, com a origem de teste mantida no registro original.

Transações de publicação/edição/aceite leem a política com bloqueio compartilhado; a alteração administrativa usa bloqueio exclusivo. A flag não muda no meio de uma publicação já autorizada sem serializar essas operações.

## Contratos e migração

- GET/PUT `/admin/professional-verification-policy`: consulta e alteração auditável da flag; PUT exige `required`, `revision` e `reason`.
- GET `/admin/professional-registrations`: aceita `q` e `region`.
- `/account/commercial-context`: acrescenta `crefVerificationRequired` e `professionalAccessGranted`, calculados no backend.
- Respostas de prescrições: campo opcional `approvalMode` com VERIFIED, TEST ou UNVERIFIED.

Migração aditiva: `20261029140000_professional_verification_policy`. Cria o singleton `ProfessionalVerificationPolicy` com `required=true` e acrescenta o evento de auditoria. Não remove dados nem altera verificações existentes. Deve ser aplicada depois de `20261029120000_professional_verification`.

Foi aplicada somente ao banco de testes isolado. O banco da aplicação não foi alterado durante esta implementação. OpenAPI e Orval foram regenerados. As chamadas das novas telas continuam passando pelo cliente gerado no servidor, com cookies e autenticação existentes.

## Arquivos principais

Backend: `prisma/schema.prisma`, a nova migração, `ProfessionalVerificationPolicy`, `ProfessionalVerification`, `GetCommercialContext`, guards profissionais, tools/rota de IA, envio/aceite/listagem/detalhe de prescrições, schemas e rotas de verificação profissional. `src/domain/prescription-approval.ts` identifica o tipo de aprovação.

Frontend: card e acesso direto em `app/admin/page.tsx`; `app/admin/professionals/{policy-card,search,official-sources,page,_actions,review}`; apresentação da auditoria; área pessoal/chat; identificação de teste nas prescrições; Orval/Swagger. Testes: `tests/usecases/ProfessionalVerificationPolicy.spec.ts` e `tests/admin-cref.test.tsx`, além das regressões existentes.

Esta atualização cria uma exceção administrativa explícita para testes à política documentada em [17 — Verificação profissional e modos de IA](17-PROFESSIONAL-VERIFICATION-AND-AI-MODES.md). A flag não atesta habilitação profissional nem regularização jurídica.

## Validação

- Backend: 60 testes aprovados nas suítes de política CREF, verificação profissional, integração comercial e ferramentas de planejamento IA. A rodada de concorrência/publicação e contrato de edição também passou com 26 testes.
- Frontend: 20 testes aprovados, incluindo a flag, busca, revisão manual, configuração de conta e interface de prescrições.
- Build Next.js e TypeScript nos dois repositórios aprovados. ESLint dos novos controles aprovado.
- Nenhuma consulta oficial real foi automatizada e nenhum cadastro foi marcado como verificado por causa da flag.
