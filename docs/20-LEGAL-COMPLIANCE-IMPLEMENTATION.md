# Governança jurídica — implementação

## Estado

Código integrado nos dois repositórios, com migration aditiva, seed insert-only e contratos Orval. Migration e seed aplicados em 06/11/2026 no banco atual de `DATABASE_URL`, após autorização explícita. O Prisma confirmou o schema atualizado. Publicar frontend e API compatíveis com esse schema.

## Componentes

- `/admin/compliance`: documentos Markdown, checklist, auditoria CREF, revisões técnicas e aceites com busca/paginação.
- `/termos` e `/privacidade`: conteúdo ativo do banco. Cada edição administrativa gera nova revisão e versão; aceites anteriores conservam versão/hash. Reaceite após revogação gera outro evento.
- `/personal`: demonstração e rascunhos; declaração de CPF/CREF/UF e responsabilidade habilita atos profissionais conforme assinatura. A declaração não é consulta oficial. Suspensão não pode ser removida pelo próprio profissional, nem pelo antigo switch de verificação.
- IA profissional: geração persiste `DRAFT_AI`; envio exige revisão explícita da versão e grava identificação profissional imutável. Rascunhos próprios de demonstração também precisam de aprovação antes de ativar.
- IA do aluno: organização/descritivo, sem geração personalizada por aceite antigo; recusa diagnósticos e reabilitação. A importação mantém prévia assinada, revisão e confirmação existentes.
- `/personal/arquivo`: prescrições históricas próprias após encerramento de vínculo, somente leitura. Não retorna perfil nem desempenho atual do antigo aluno.
- Perfil: aceites independentes, revogação de saúde/IA, exportação JSON e exclusão confirmada. A exclusão remove credenciais, conversas, métricas e sessões; preserva o mínimo das prescrições profissionais históricas, registros fiscais e logs de aplicação sob suas finalidades próprias. O principal residual não autentica.
- Sessões: substituição observa a permissão da ficha; o histórico de alteração pelo aluno permanece marcado inclusive após retorno ao exercício original. A prescrição original não é alterada.
- Visualizadores 3D: aviso permanente; selo depende de revisão registrada. Nenhuma animação recebeu aprovação técnica automática.

## Operação do backend

Após confirmar o banco de destino:

```powershell
npm run migrate:deploy
npm run seed:compliance
```

O Prisma também reconhece `prisma db seed`. `npm run docs:compliance` gera somente a documentação inicial, sem gravar no banco. `npm run export:compliance` lê os documentos/checklist atuais e atualiza o Markdown nos dois repositórios, sem alterar registros; executar após edições administrativas quando for necessário atualizar a cópia versionada no Git. O guia inicial não deve sobrescrever termos já editados pelo administrador.

O cron existente de streak também remove logs de aplicação com expiração de seis meses. IP é o endereço da conexão recebida pela API; proxies podem fazer esse endereço identificar o intermediário. Server Actions encaminham o User-Agent recebido pelo frontend. Não confiar em um `X-Forwarded-For` arbitrário para produzir prova de identidade.

## Limites e pendências operacionais

- O banco autorizado contém seis documentos, doze itens de compliance e seis revisões iniciais. Hashes, versões e cópias Markdown foram conferidos. Repetir o seed preservou integralmente os registros existentes.
- O banco de testes retornou `P3005` (schema preenchido sem histórico de migrations compatível). Não foi realizado reset/baseline automático. Testes integrados em PostgreSQL isolado permanecem pendentes de provisionamento correto; migration e seed foram executados e conferidos no banco autorizado.
- Sanitização atua em campos estruturados, JSON serializado, identificadores conhecidos e padrões de contato no texto, em cada etapa enviada ao modelo. PDFs, imagens e áudio binários não passam por OCR/DLP local; precisam de preparação sem identificadores antes do envio. Não afirmar anonimização irreversível ou detecção universal de nomes/endereço em linguagem livre.
- Controlador identificado como Luís Felipe Mozer Chiqueto, pessoa física; contato autorizado: lfchiqueto@gmail.com. Não foi atribuído CNPJ nem presumido um CNAE atual. Revisão humana real das animações, contratos/mecanismos de transferência internacional e eventual formalização societária exigem providências operacionais. O checklist começa `PENDING` para não certificar providências ainda não verificadas.
- Billing/reembolso automático não existe no produto atual. A regra de sete dias está documentada; sua execução comercial continua pendente de integração com cobrança.
- Prescrições legadas recebem origem profissional quando o vínculo de aceite é conhecido; snapshots antigos de CREF ausentes não são fabricados a partir do cadastro atual.

## Verificação

Testes novos cobrem fronteiras de autenticação/admin, evidência de aceite, mudança concorrente de versão, revogação/reaceite, ativação declarada, suspensão, CPF, sanitização, sintomas de segurança, proteção dos direitos de privacidade e retenção de logs. O onboarding, a confirmação de consentimento e o envio de prescrição têm regressões de UI. Testes com banco simulado não substituem a validação da migration em PostgreSQL.
