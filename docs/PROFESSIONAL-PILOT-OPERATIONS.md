# Operação do piloto profissional

Atualizado em 10/11/2026. Implementação local; publicação e configuração dos provedores não foram executadas nesta sessão.

## Acesso e oferta

O profissional informa CPF, CREF/UF e aceita a declaração profissional vigente. A conferência administrativa é opcional; suspensões e rejeições continuam bloqueando o acesso. O antigo botão “Exigir CREF verificado” foi removido. O campo legado da política permanece apenas por compatibilidade e não concede acesso.

A oferta inicial usa ativação manual e trials com prazo pelo administrador. Não há checkout, gateway, cobrança ou renovação automática. Combine preço, prazo e atendimento diretamente com o profissional; revise os vencimentos no painel.

## Cota de IA

Chat, fichas e análises reservam uma solicitação na mesma cota diária, antes de chamar o provedor. Cada operação exige seu entitlement: AI_CHAT ou AI_PLAN_GENERATION. MANAGE_ATHLETES sozinho não concede IA.

Quando houver limites numéricos nas permissões de IA, vale o menor deles para a cota compartilhada; zero bloqueia. Sem limite numérico, os padrões são 5/dia para atleta, 30/dia para coach e 200/dia para plano INTERNAL, sempre exigindo permissão. A renovação ocorre à meia-noite UTC. Sem permissão retorna 403; cota ou capacidade esgotada retorna 429.

Reservas concorrentes são serializadas por lock transacional PostgreSQL. Rejeições não incrementam consumo. Uma tentativa autorizada consome cota mesmo se o provedor falhar, pois pode ter gerado custo. O limite global padrão é 500 solicitações/dia e o de rajada é 3/minuto por usuário, configuráveis por AI_DAILY_GLOBAL_LIMIT e AI_MINUTE_USER_LIMIT. São limites de solicitações, não orçamento monetário. Os limites de saída são 12000 tokens para rascunho e 3500 para análise.

Os rascunhos permanecem editáveis e exigem aprovação do profissional. O bootstrap comercial não recria permissões removidas de planos existentes.

## Suporte e observabilidade

O perfil e a tela de acesso pendente oferecem contato por e-mail. NEXT_PUBLIC_SUPPORT_EMAIL define o destinatário público; o padrão é o contato existente do produto. /admin/feedback oferece fila com filtros e paginação, protegida por papel administrativo persistido. O envio de resposta é manual; abrir o link não envia e-mail automaticamente. A fila ainda não tem status de resolução.

A API expõe /health/live e /health/ready. A segunda consulta o banco e retorna 503 sem detalhes internos em falhas. O workflow health.yml verifica as duas a cada dez minutos quando a variável de repositório TRAINVY_API_URL estiver configurada. Habilite Actions e notificações de falha no GitHub após publicar; isso ainda depende de configuração externa.

Eventos de produto registram apenas nomes fixos: cadastro concluído, abertura do painel, convite criado, prescrição enviada/aceita e treino concluído. Não incluem CPF, CREF, dados de saúde, identificadores ou conteúdo de fichas. Conferir a coleta no painel do provedor após publicação.

## Validação e release

Consulte [release](12-RELEASE-AUTOMATION.md). npm run build da API apenas gera o Prisma Client e compila TypeScript. Não executa migrations ou seeds.

Para testes locais: npm test em cada repositório. A API exige TEST_DATABASE_URL isolado da conexão principal. Para navegador, instale ambos os projetos lado a lado, disponibilize o banco de testes e Chrome, e execute npm run test:e2e no frontend. E2E_API_DIRECTORY permite outro diretório da API; E2E_BROWSER_CHANNEL permite outro navegador instalado. As fixtures são sintéticas e removidas ao terminar. Não use banco de produção.

Os testes de navegador cobrem painel desktop/mobile emulado, acesso pendente, notificações, suporte, convite, envio aprovado, aceite de prescrição e isolamento entre contas. Não substituem validação em celular físico, Safari, OAuth real ou entrega de push.

## Antes dos primeiros convites reais

Confirme os planos e suas permissões, destinatário de suporte, prazo dos trials, publicação das versões compatíveis e monitoramento. Faça uma restauração de backup em ambiente separado e registre responsável, retenção e tempo de recuperação; não se assume que o provedor já esteja configurado para isso. Revise documentos/contratos e o conteúdo das prescrições com os responsáveis humanos.

Esta entrega não certifica conformidade jurídica nem revisa cientificamente o catálogo 3D. Anamnese ampliada e exportação de relatórios permanecem oportunidades de produto; gateway de pagamentos permanece fora do escopo atual.

## Evidências desta entrega

Em 10/11/2026, a suíte também passou em um banco temporário criado do zero: 60 migrations, seeds do workflow e 842 testes em 98 arquivos. O banco temporário foi removido após a validação. Os testes de mídia agora consideram os IDs unificados pelas migrations sem dispensar a presença dos exercícios atuais; a fixture de alternativa da prescrição é criada pelo próprio teste. Isso elimina dependências de registros legados que existiam apenas no banco local anterior.

Os 699 testes do frontend e os 842 testes da API passaram. Os três cenários de navegador passaram após a atualização das dependências. Os builds e tipos de ambos os projetos passaram. A fixture de aprovação foi alinhada ao conteúdo normalizado que o SDK apresenta ao usuário, preservando a exigência de aprovação. O lint global da API encontrou pendências anteriores em arquivos fora deste escopo; o lint dos arquivos novos passou. A auditoria de dependências de execução não apontou alertas altos ou críticos; permanece um alerta baixo em dependência transitiva.
