# Resumo semanal e carregamento da evolução

Implementado em 17/11/2026.

- `/stats` prioriza o resumo da semana atual. Medidas, consistência e navegação têm boundaries de Suspense independentes. Falhas nas consultas de medidas/consistência não derrubam o resumo.
- Gráficos de 4/8/12 semanas e busca de evolução são importados e consultados ao expandir “Explore sua evolução”. Seus intervalos históricos de segunda a domingo permanecem compatíveis.
- `/history` mantém paginação por cursor e carrega a lista sob Suspense, com acesso ao resumo em `/stats`.
- `GET /history/analytics/current-week?tz=America/Sao_Paulo` é uma leitura autenticada por `athleteId` da sessão. Não aceita identidade do atleta no querystring.
- O endpoint faz uma única consulta limitada à semana civil de domingo a sábado no fuso IANA informado. Início inclusivo; domingo seguinte exclusivo. Seleciona somente dados usados pelo resumo, sem carregar detalhes completos do histórico.
- O frontend consome o cliente Orval em `GET /api/training-week`, encaminhando cookies pelo mutator existente e desabilitando cache. A leitura via GET é independente das filas de Server Actions. A requisição é cancelada ao sair da tela e possui tentativa manual em caso de erro.

## Regras de contagem

Somente sessões concluídas e séries `WORKING` concluídas contribuem para séries e volume. Sessões concluídas sem séries continuam contando como treinos. Aquecimento e séries pendentes não contam. A atribuição temporal usa `WorkoutSession.completedAt`, como as demais análises históricas.

Volume = soma de `weightInGrams × reps / 1000`, sem estimar peso corporal, carga ausente ou multiplicar automaticamente exercícios unilaterais. Uma série conta uma única vez no total, mesmo quando possui vários músculos associados.

O vínculo muscular usa `WorkoutSet.exerciseId` quando informado e, na ausência, `SessionExercise.exerciseId`. Não há inferência por nome. Cada grupo recebe contagens diretas (`PRIMARY`) e indiretas (`SECONDARY`) sem ponderação. O volume por grupo é apresentado somente para séries diretas. Volumes de grupos diferentes não devem ser somados como total da sessão, pois uma série pode ter mais de um grupo principal.

O mapa SVG reutiliza as regiões esquemáticas existentes, sem carregar modelos 3D. Vermelho representa presença de séries diretas e vermelho claro presença exclusivamente indireta; os demais grupos ficam neutros. A cor não representa ativação, intensidade ou EMG. A classificação usa o cadastro muscular atual do exercício; não há snapshot histórico dessa classificação no modelo atual.

## Atributos com evidência

O painel apresenta contagens de séries por faixa de repetições realizadas: 1–5, 6–14 e 15+, compatíveis com as faixas da montagem. Não reutiliza pesos estimados por nome de exercício, não oferece XP ou níveis fictícios e não afirma medir capacidade ou adaptação. Séries sem repetições são explicitamente excluídas das faixas. Explosão e estabilidade não recebem pontuação, pois os registros atuais não fornecem medição suficiente.

## Validação e implantação

Testes de integração verificam autenticação, ownership, limites locais de domingo/sábado, substituições por série, aquecimento, séries pendentes e dados incompletos. Testes de interface verificam as cores, contagens, faixas, cancelamento e nova tentativa. O contrato Zod/OpenAPI foi exportado e o cliente Orval regenerado.

Publicar a API antes ou junto do frontend. Esta mudança não exige migration.
