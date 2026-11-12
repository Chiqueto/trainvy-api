# Guias do personal e alunos sem conta

Implementado em 12/11/2026 nos dois repositórios.

- `User.coachOnboardingCompleted` e `workoutBuilderOnboardingCompleted` começam em `false`, inclusive para contas existentes. São independentes do formulário esportivo e da configuração da conta.
- O painel abre o guia na primeira visita com acesso profissional disponível; os editores de prescrições, modelos e planos abrem o guia do editor para contas COACH. Ambos permitem avançar, voltar, pular e rever.
- Concluir ou pular persiste somente o indicador daquele guia. Se a gravação falhar, o guia fecha com um aviso e pode reaparecer. A API identifica a conta pela sessão; não aceita IDs de terceiros.
- O editor explica divisão, catálogo/cartões, espaço 3D, lista 2D, modo clássico, rascunho e revisão profissional.

## Aluno antes da criação de conta

`POST /coach/managed-athletes` recebe apenas o nome. Cria um registro interno `isManagedProfile=true`, sem credenciais, sessão ou email real, vinculado somente ao personal autor. O registro ocupa uma vaga e mantém as mesmas exigências profissionais e comerciais dos alunos vinculados. O personal já pode preparar prescrições pelo fluxo existente.

Na página desse aluno, **Vincular conta do aluno** emite um convite de uso único ligado ao cadastro. O link deve ser enviado somente à pessoa correspondente. Não há associação por coincidência de email ou nome.

Depois do login/cadastro e do aceite explícito no fluxo de convites existente, a transação substitui o destinatário do vínculo e das prescrições pela conta autenticada. Mantém as fichas, status e versões; não ativa planos nem aprova rascunhos automaticamente. Transfere as notificações pendentes e cancela outros convites do mesmo cadastro. O registro interno permanece como tombstone para auditoria dos convites.

A vinculação não ocupa outra vaga. Não permite assumir cadastro de outro personal, cadastro revogado, convite expirado/cancelado/usado nem vincular conta que já possui treinador ativo. O compartilhamento de evolução permanece desabilitado até autorização do atleta. O histórico pessoal existente não é transferido ou liberado pelo convite.

## Banco e contrato

Migration aditiva: `20261112120000_coach_onboarding_managed_athletes`. Aplicada ao banco configurado e ao banco de testes; registrada no histórico do banco configurado. O banco de testes preexistente não tinha baseline de migrations, portanto recebeu apenas o SQL desta alteração, sem reset. A migration de equipamentos que já estava pendente não foi aplicada por esta tarefa.

Rotas de guia: `GET/PATCH /coach/onboarding`; PATCH recebe `{ tour: "workspace" | "builder" }`. O convite existente aceita `managedAthleteId` opcional. Contratos Zod/OpenAPI e cliente Orval regenerados.
