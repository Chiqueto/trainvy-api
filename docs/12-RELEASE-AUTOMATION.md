# Release e recuperação

Atualizado em 09/11/2026.

## Compilação e banco

Na API, npm run build e npm run vercel:build executam apenas prisma generate e TypeScript. No frontend, npm run build compila Next.js. Preview e produção seguem essa mesma regra; build não prepara o banco.

Antes de publicar, execute testes contra TEST_DATABASE_URL isolado e confira o destino de DATABASE_URL sem expor credenciais. Confirme backup e compatibilidade das alterações. O comando operacional explícito na API é:

```sh
npm run release:prepare -- --confirm-production
```

Ele valida geração/compilação antes de aplicar migrations e executar bootstrap comercial, mídias e documentos de compliance. Recusa VERCEL_ENV=preview. Não foi executado contra produção nesta sessão. Evite releases simultâneos. O bootstrap preserva configurações de planos existentes; mudanças comerciais nesses planos usam o admin.

## Workflows

ci.yml valida cada repositório. A API usa PostgreSQL isolado no CI; o frontend executa tipos, testes e build. Estes arquivos precisam ser publicados para rodar no GitHub.

A API também contém production-release.yml, acionado manualmente. Revise seus secrets e o checkout do frontend antes de usá-lo. Configure proteção/aprovação no environment production no GitHub; declarar environment no YAML não cria automaticamente uma regra de aprovação. O workflow serializa releases, testa a API, aplica migrations/seeds e publica ambos os projetos. Configure DATABASE_URL, TEST_DATABASE_URL, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_BACKEND_PROJECT_ID, VERCEL_FRONTEND_PROJECT_ID e credencial de acesso entre repositórios quando necessária. Os seeds também exigem BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_GENERATIVE_AI_API_KEY e a variável WEB_APP_BASE_URL para a validação do ambiente. Nunca grave valores reais no repositório.

Evite que a integração Git publique uma versão incompatível antes da preparação do banco: coordene a publicação ou configure o provedor para respeitar o fluxo operacional escolhido. Nenhuma configuração remota foi alterada aqui.

Após publicar, confira /health/live e /health/ready da API e o frontend com sessão real. Configure TRAINVY_API_URL para o workflow periódico de saúde e notificações de falha.

## Recuperação

Para regressão de código, promova a versão anterior compatível no provedor e repita os checks. Rollback de código não desfaz alterações do banco.

Antes de cada alteração estrutural, valide retenção e possibilidade de restauração do provedor. Restaure primeiro em banco separado, confira integridade e só então planeje o corte. Não execute prisma migrate reset em produção. Não assuma que toda migration é reversível ou aditiva, nem que backups estão disponíveis sem verificar o plano contratado.

Mais detalhes do piloto: [operação profissional](PROFESSIONAL-PILOT-OPERATIONS.md).

O lint global da API ainda apresenta pendências legadas fora desta entrega; o workflow de release mantém esse bloqueio. Os arquivos novos passaram no lint específico. Corrija o legado antes de utilizar esse workflow; o comando operacional manual continua disponível para releases validados.
