# Disponibilidade de IA por perfil

Implementado em 10/11/2026.

## Controles

O /admin oferece “IA para profissionais” e “IA para alunos”. As duas opções ficam na tabela AiAvailability, no registro global, com padrão false tanto na migration quanto nas colunas do banco. Não há override por variável de ambiente nem exceção automática para administradores ou planos internos.

| Profissionais | Alunos | Comportamento |
| --- | --- | --- |
| Desligado | Desligado | Somente recursos manuais; landing sem oferta de IA. |
| Ligado | Desligado | IA disponível para contas COACH com permissões; landing direciona IA ao profissional. |
| Desligado | Ligado | IA disponível para contas ATHLETE com permissões; ofertas profissionais de IA ficam ocultas. |
| Ligado | Ligado | Cada conta usa os recursos e as cotas do próprio plano. |

O perfil é o de quem solicita a IA. Um treinador analisando dados autorizados de um aluno usa a flag profissional; o consentimento e o vínculo com o aluno continuam necessários. O uso pessoal de uma conta COACH também segue a flag profissional.

## Aplicação na API e na interface

As flags são verificadas antes da reserva de cota e novamente no middleware de cada chamada ao modelo, inclusive em etapas posteriores de um chat. Chat, classificação de intenção, extração de anexos, geração de fichas e análises usam esse bloqueio. O ator autenticado deve ser informado ao criar um privateModel; ator ausente é bloqueado.

AI_DISABLED retorna HTTP 503 nos endpoints de geração. Desligar evita novas chamadas, mas não desfaz uma solicitação já enviada ao provedor nem elimina seu possível custo. Falha na consulta da configuração impede chamadas de IA. Não há cache das decisões de autorização no servidor.

A interface inicia sem IA, consulta o estado sem cache e respeita também as permissões da assinatura. Atualiza ao navegar, ao retornar o foco e a cada 30 segundos quando a aba está visível. Após salvar no admin, a própria aba recebe atualização imediata. Uma tela antiga pode demorar a ocultar o botão; a API já bloqueia as novas solicitações após a alteração ser confirmada.

São condicionados os acessos no menu, planejamento, histórico, execução de treino, prescrições e análises do personal. A landing usa conteúdo manual ou adequado ao público habilitado. A identidade visual e o 3D permanecem disponíveis.

## Planos e dados existentes

Com IA profissional desligada, planos públicos com permissões AI_CHAT ou AI_PLAN_GENERATION ficam fora do cadastro. O backend também recusa a criação e conclusão de novas intenções para esses planos enquanto desabilitados. As assinaturas existentes, preços, limites de alunos e permissões armazenadas não são modificados.

A permissão futura SOURCE_LIBRARY não aparece como funcionalidade oferecida no cadastro público. Rascunhos e fichas anteriores continuam editáveis e podem ser revisados e enviados manualmente; a origem assistida por IA continua identificada como evidência, mesmo com a flag desligada. Histórico e aceites não são apagados.

## Administração e publicação

GET /features/ai retorna somente os dois booleanos públicos. GET e PATCH /admin/ai-availability exigem sessão e autorização administrativa persistida. As alterações verificam revision para impedir sobrescrita concorrente e registram antes/depois no AdminAuditLog.

A migration 20261110110000_ai_availability cria a tabela, insere global com ambas as flags desligadas e adiciona a ação de auditoria. Deve ser aplicada na etapa de preparação do banco antes de publicar as versões compatíveis. O build continua sem migrations ou seeds. Nenhuma flag de produção foi ativada nesta implementação.

Os testes legados de IA habilitam explicitamente ambas as opções apenas no banco isolado durante a suíte e restauram o estado anterior ao terminar. Os testes específicos cobrem os padrões desabilitados, as quatro combinações, falhas de consulta, autorização, concorrência, auditoria e ausência de consumo de cota quando bloqueado. O teste de navegador altera os dois switches reais e confere apresentação e bloqueio HTTP, sem chamar um provedor de IA real.

Validação concluída: 708 testes do frontend, 855 testes da API e quatro cenários de navegador aprovados. A API passou também em banco temporário vazio com as 61 migrations e os seeds do CI; esse banco foi removido ao terminar. Builds, tipos e lint dos arquivos novos foram verificados. A migration não foi aplicada em produção nesta sessão.
