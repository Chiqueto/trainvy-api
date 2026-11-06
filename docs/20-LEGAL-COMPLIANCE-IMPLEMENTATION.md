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

## Correção contratual — 06/11/2026

Os quatro documentos públicos foram substituídos integralmente pela redação fornecida. `LEGAL_ENTITY_NAME` e `LEGAL_CONTACT_EMAIL` são configuráveis no ambiente da API; valores ausentes ou vazios usam `Trainvy (operado por Luís Felipe Mozer Chiqueto)` e `lfchiqueto@gmail.com`. Com a identidade padrão, a redação contratual conserva o nome do controlador exatamente como fornecido; com uma entidade configurada, todas as ocorrências usam essa identificação. Alterar o ambiente não reescreve os termos publicados automaticamente.

O seed normal continua insert-only. Para publicar explicitamente o conteúdo canônico após uma alteração de identidade ou texto, executar `npm run seed:compliance -- --refresh-legal-content`. Essa opção atualiza somente os quatro contratos e a matriz interna, mantém a declaração CREF existente, arquiva o conteúdo anterior e incrementa a versão do registro apenas quando houver mudança. Os corpos conservam a indicação de Versão 1.0.0 do texto fornecido; a versão de publicação aparece separadamente na interface. Aceites antigos não são transferidos para a nova versão.

Atualização aplicada e conferida no banco configurado: os quatro contratos e a matriz passaram para 1.0.1; a declaração CREF permaneceu em 1.0.0. As seis revisões anteriores foram preservadas, totalizando onze revisões. Não havia aceites registrados. Conteúdo, títulos, hashes das revisões e ambas as cópias Markdown foram comparados com a fonte canônica.

Onboarding e perfil permitem leitura integral em modal com rolagem. Termos e Política compartilham a declaração solicitada, com evidências individuais por documento; saúde/IA conserva checkbox separado e inicialmente desmarcado. Um envio registra apenas aceites pendentes, preserva confirmações parciais e exige nova escolha se a versão mudar. O formulário profissional usa a declaração CREF solicitada e o mesmo leitor integral.
