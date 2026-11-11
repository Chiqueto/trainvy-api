# Tactical Workout Builder

Implementado nos editores de planos pessoais (incluindo etapas de periodização e edição), prescrições do treinador e modelos. O modo inicial é `tactical`; o clássico continua disponível no seletor. Ambos editam o mesmo array `days` do componente pai. A aba tática permanece selecionada ao trocar de modo.

## Contrato e persistência

`WorkoutExercise` mantém `sets` numérico e todos os campos existentes. Campos aditivos opcionais no HTTP:

- `supersetGroupId`: identificador do grupo dentro do treino.
- `runes`: `DROP_SET`, `REST_PAUSE`, `ISOMETRIC_HOLD`, `CLUSTER_SET`, `TEMPO_CONTROL`.
- `setPrescription`: séries prescritas `{ reps, zone, restSeconds, load? }`; carga em kg. Lista vazia usa os parâmetros gerais legados. Uma lista preenchida deve ter o mesmo tamanho de `sets`.

Alterações nos controles gerais aplicam somente o campo alterado às séries individuais. Trocas de exercício preservam séries, carga e técnicas; alternativas fixas são limpas para evitar referências ao próprio exercício. Fusão mantém as prescrições individuais e aproxima os membros; desfusão não remove séries nem técnicas. Reordenação tática move grupos como bloco. O clássico permite editar códigos de grupo, técnicas e doses individuais.

Os campos passam pelos schemas Zod/OpenAPI e pelo client Orval, incluindo criação, edição, duplicação, modelos e prescrição. Payloads antigos continuam aceitos. Os registros de execução e o histórico existente não são reescritos; `setPrescription` representa planejamento, não séries já executadas.

## Preferência

`GET/PATCH /me/builder-preferences` usa exclusivamente o usuário da sessão. O PATCH aceita apenas `preferredBuilderMode`. O banco usa `User.preferredBuilderMode` com padrão `tactical`.

O cliente atualiza a visualização imediatamente e guarda a preferência em `trainvy:builder-mode:<userId>`. Escritas na API são serializadas. Alterações locais pendentes são reenviadas na próxima abertura; o valor confirmado do servidor prevalece sobre caches antigos de outros dispositivos. Falhas de sincronização são indicadas sem apagar o treino.

## Interações e estimativas

Mouse: deslocamento mínimo de 7 px. Touch: pressão de 220 ms com tolerância de 6 px; movimento prévio mantém o scroll. Arraste usa alças nas cartas da mesa. Hover central de 300 ms habilita fusão; movimentos rápidos reordenam. Há controles de teclado e alternativas por clique/toque para inserir, fundir, aplicar técnicas e reordenar. Animações respeitam redução de movimento e vibração é opcional conforme suporte do dispositivo.

Mapa usa os papéis musculares reais do catálogo: séries principais ×1 e secundárias ×0,5. Os limiares cromáticos são convenções de volume ilustrativo. Tempo considera reps ×3 s, descansos, aquecimento e transições. Custo SNC e radar são heurísticas editoriais, sem medição fisiológica ou EMG. Metadados ausentes não são apresentados como dados medidos. Trocas sugeridas exigem família de movimento reconhecida e músculo primário compatível; podem haver menos de quatro quando o catálogo não contém variações suficientes. O treinador deve revisar a adequação.

O botão “Selar treino” anima antes de chamar o salvamento existente. Em prescrições profissionais ele salva o rascunho; a revisão e aprovação explícita para enviar ao aluno permanecem obrigatórias.

## Validação e deploy

- Suíte frontend: 750 testes aprovados; após os ajustes finais, 70 testes dos seis arquivos de editores e modo tático passaram, incluindo o caso adicional de troca sem perda de doses.
- API: 22 testes aprovados nos arquivos de modo tático, salvamento de prescrição e schema de treino. Incluem persistência real de criação, edição, reabertura e duplicação; ownership e preferências de dois usuários; rejeição de payloads inválidos.
- Verificação visual em Edge desktop e viewport mobile de 390 px, com fusão por arraste e inserção por toque; nenhum overflow horizontal.
- TypeScript e builds dos dois projetos passaram. Lint dos arquivos alterados sem erros. Lint global encontra erros preexistentes fora da entrega.
- Migração `20261111120000_tactical_builder` validada no schema isolado `tactical_builder_validation_20261111` do banco de testes. O schema padrão desse banco não possui baseline de migrations; não foi feito reset nem baseline sobre ele.

Aplicar a migração aditiva na API antes de publicar os dois projetos. O banco da aplicação não foi migrado nesta implementação. Nenhum push ou deploy foi realizado.
