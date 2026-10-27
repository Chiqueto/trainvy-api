# FIT.AI — Contexto para Agentes de Código

Este arquivo é o ponto de entrada obrigatório para qualquer agente que trabalhe no FIT.AI.

## Leia antes de alterar código

1. `docs/00-PROJECT-CONTEXT.md`
2. `docs/01-PRODUCT-REQUIREMENTS.md`
3. `docs/02-ROLES-AND-PERMISSIONS.md`
4. `docs/03-PLANS-AND-FEATURES.md`
5. `docs/04-DOMAIN-AND-DATA-MODEL.md`
6. `docs/05-AI-AND-RAG.md`
7. `docs/06-ARCHITECTURE-AND-INTEGRATIONS.md`
8. `docs/07-ROADMAP-AND-GUARDRAILS.md`

## Estado atual x visão alvo

- **ATUAL**: confirmado no código existente.
- **ALVO**: planejado; não assuma que já foi implementado.

## Repositórios

- Frontend: `Chiqueto/bootcamp-treinos-frontend`
- Backend: `Chiqueto/bootcamp-treinos-api`

## Regras obrigatórias

- Preservar Next.js no frontend e Fastify no backend.
- Preservar o padrão da API `Route -> Use Case -> Prisma`.
- Contratos HTTP devem continuar em Zod/OpenAPI e ser consumidos via Orval.
- Toda operação multiusuário deve respeitar ownership ou vínculo Coach ↔ Atleta.
- IA não grava estruturas arbitrárias direto no banco; toda saída persistível passa por schema validado e use case.
- Metodologia de treino não deve ficar hardcoded no prompt quando puder vir das fontes selecionadas.
- Treinos gerados por IA devem permanecer editáveis.
- Não fazer reescrita geral do projeto sem necessidade real.

## Regra obrigatória para animações e modelos de exercícios 3D

- **Pesquisa Científica Prévia Obrigatória**: Sempre, ANTES de modelar qualquer exercício 3D ou chamar a skill de criação de modelo 3D, é OBRIGATÓRIO realizar uma busca aprofundada em estudos recentes de cinesiologia, eletromiografia (EMG) e biomecânica para fundamentar:
  1. A execução técnica e as angulações articulares e de equipamentos ideais (ex.: banco a 30° no supino inclinado para maximizar feixe clavicular e evitar sobrecarga excessiva no deltoide anterior).
  2. Todos os músculos envolvidos: identificar o motor primário (alvo principal) e também os sinergistas/estabilizadores secundários que atuam conjuntamente e não podem ser isolados artificialmente (ex.: peitoral médio/inferior, tríceps e deltoide anterior no supino inclinado).
- **Esquema de Cores Anatômico**: Destacar os músculos motores primários em vermelho vivo (`primaryTissue`) e os sinergistas/secundários em tom de vermelho mais claro (`secondaryTissue`). Todo o restante da anatomia não envolvida deve permanecer em cor neutra (`neutralTissue`).
- **Mapeamento Explícito**: Mapear músculos por exercício explicitamente; nunca reutilizar o mapa de ativação de outro movimento sem validação anatômica.
- **Aviso e Legendas**: Legendas descrevem apenas grupos musculares ilustrativos. Nunca apresentar a cor como ativação medida, EMG em tempo real ou intensidade real de esforço.
- **Cadência e Cinemática Realista**: Aplicar uma descida controlada (excêntrica), pausa breve na amplitude baixa e subida suave (concêntrica), mantendo apoios estáveis, comprimentos ósseos reais e articulações anatômicas.
- **Validação Cruzada**: Validar que exercícios distintos destacam grupos distintos, preservar a silhueta/anatomia e revisar a pose e o shading antes de publicar.

