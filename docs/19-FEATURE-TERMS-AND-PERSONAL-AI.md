# Aceites de IA pessoal e demonstrações 3D — 30/10/2026

Esta atualização substitui a restrição de geração **pessoal** descrita no documento 17. Recursos profissionais para terceiros continuam exigindo habilitação, permissões comerciais, vínculo ativo e aprovação versionada.

## Comportamento

- O aluno pode pedir um treino ao Coach IA, inclusive pelo menu Novo > Gerar treino com IA em Planejamento. Pedidos diretos são identificados antes de chamar o gerador; pedidos indiretos/áudio passam por classificação estruturada de intenção. A classificação não gera treino. Falhas bloqueiam a operação.
- Sem aceite vigente de `AI_WORKOUT`, a API responde 428 `FEATURE_TERMS_REQUIRED`. O transporte do chat abre o modal, exige checkbox desmarcado por padrão e grava o aceite antes de repetir o mesmo pedido, preservando anexos, conversa e aprovações. Cancelar não repete o pedido.
- Depois do aceite, são liberadas apenas tools de propostas pessoais de planos/periodizações e salvamento como rascunhos inativos. Salvamento ainda exige aprovação explícita da tool, independentemente do aceite do termo. As tools reconsultam o aceite vigente antes de cada execução, inclusive aprovações antigas/cache. Os planos continuam editáveis.
- Perguntas gerais e importação de fichas continuam disponíveis sem aceitar geração pessoal. A importação em `/planning/ai-generate` mantém seu contrato de extração; geração pessoal ocorre no chat. Profissionais verificados mantêm o fluxo profissional existente.
- O componente compartilhado `Exercise3DViewer` exige aceite separado de `EXERCISE_3D` e autorização auditada antes de montar o visualizador e carregar a cena/modelo. Isso cobre exercício, laboratório, preview e demonstração pública da landing; na landing o visitante precisa entrar em uma conta para registrar o aceite. As animações e a anatomia não foram alteradas ou certificadas nesta tarefa.
- Aceites são reutilizados pela mesma conta enquanto versão e SHA-256 do texto/título forem os mesmos. Alterar qualquer um exige novo aceite. O aceite de IA/3D não modifica a preferência LGPD de acesso ao histórico.

## Evidência e acesso

`FeatureTermsAcceptance` registra usuário autenticado, recurso, versão, título e texto integrais servidos pelo backend, SHA-256, data/hora do servidor, IP da conexão à API e User-Agent. Repetições são idempotentes e não substituem os metadados originais. `FeatureAccessEvent` referencia o aceite e registra contexto/data de cada autorização de uso. No chat, o contexto referencia a conversa; nas tools, também o nome da operação. O histórico existente de `AiToolExecution` mantém os IDs dos rascunhos salvos. Eventos representam **autorizações/tentativas**, não prova de execução física nem de conclusão bem-sucedida da geração.

O IP vem de `request.ip`, sem confiar em cabeçalhos arbitrários de IP. Com gateway/server actions ele pode identificar o proxy/servidor intermediário. O User-Agent original é encaminhado pela server action e continua sendo metadado informado pelo cliente, não prova de identidade. Não há assinatura digital qualificada, custódia externa ou garantia de inviolabilidade do banco. As APIs não oferecem edição/exclusão dessas evidências; acesso direto ao banco permanece sujeito às permissões da operação. Retenção, backups e procedimentos de exclusão devem ser definidos pela operação sem prometer retenção indefinida.

Tela `/admin/feature-terms`: filtra por ID do usuário, pagina aceites e mostra texto, hash, data, metadados, total de autorizações e os 20 eventos mais recentes por aceite. Apenas ADMIN autorizado pelo backend acessa evidências; aluno/coach não pode consultar registros alheios. Os eventos completos permanecem no banco.

| Método/rota | operationId |
| --- | --- |
| GET `/me/feature-terms/:feature` | getFeatureTerms |
| POST `/me/feature-terms/:feature/accept` | acceptFeatureTerms |
| POST `/me/feature-terms/:feature/access` | authorizeFeatureAccess |
| GET `/admin/feature-terms` | listFeatureTermsEvidence |

Aceite exige `{accepted:true,version,textHash}`; versões/hashes antigos recebem 409. Identidade, texto e data não são escolhidos pelo cliente. Não há aceites retroativos. Contratos Zod/OpenAPI e Orval foram atualizados.

## Redação e limites

Os termos explicam erros/limitações da IA, ausência de avaliação profissional, necessidade de revisão antes de executar, riscos das ilustrações 3D e caráter ilustrativo das cores. Não alegam exclusão total de responsabilidade nem renúncia de direitos. A trilha de aceite documenta a informação apresentada e a manifestação de vontade; não regulariza automaticamente o serviço nem substitui revisão jurídica ou técnica.

Fontes oficiais consultadas: [CDC, especialmente arts. 25 e 51](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html) e [LGPD, especialmente art. 8](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html). O aceite informativo de risco não foi tratado como consentimento genérico para tratamento de dados sensíveis.

## Migração e validação

Migração aditiva: `20261030120000_feature_terms`. Aplicada apenas no banco isolado de testes usando `prisma.test.config.ts`, cuja guarda compara host/porta/banco para impedir uso do banco principal. O banco da aplicação não foi alterado. Para publicar, aplicar a migração pelo procedimento do ambiente antes de subir o código; observar a pendência de baseline descrita no documento 17, sem usar reset/db push em produção.

Testes cobrem ausência de sessão, rejeição de aceite falso/versão/hash/ownership forjado, isolamento de conta/recurso, bloqueio antes da geração, classificação indireta, falha do provedor, revalidação das tools, modal/cancelamento/falha de persistência, retomada do pedido e controles 3D após aceite. A integração PostgreSQL verifica gravação integral, concorrência/idempotência, vínculo dos eventos e restrição administrativa. Classificações e geração usam respostas controladas nos testes; não houve validação de acurácia do modelo com solicitações reais nem parecer jurídico.

Resultado: 67 testes backend e 33 frontend aprovados nas suítes afetadas (100 no total), TypeScript nos dois repositórios e build de produção frontend aprovados. ESLint dos novos módulos aprovado; o chat mantém o aviso preexistente de uso de `<img>`. Não se afirma execução da suíte completa ou revisão biomecânica dos modelos.
