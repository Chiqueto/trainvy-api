# Revisão do catálogo e organização no admin

Revisão versionada: **2026-10-28.1**. Inventário consultado: 266 exercícios globais; 53 classificados e 213 sem classificação. A simulação prevê 213 classificações novas, 32 correções em classificações anteriores e 21 preservadas.

## Entrega e publicação

Implementação e migrações validadas no banco de testes. **Não aplicadas no banco principal nesta entrega.** A publicação precisa incluir API e frontend com a taxonomia ampliada; o contrato anterior de respostas não reconhece os dois novos grupos.

1. Publicar em conjunto a API e o frontend atualizados. Na publicação da API, aplicar as migrations, em ordem: `20261028120000_exercise_catalog_muscle_groups` e `20261028121000_review_global_exercise_muscles`.
2. A primeira adiciona HIP_FLEXORS, TIBIALIS_ANTERIOR e a ação de auditoria. A segunda atualiza as associações musculares por ID e nome exatos, somente em exercícios globais existentes. Não cria exercícios nem altera nomes, IDs, ownership, unilateralidade, séries, cargas, sessões ou mídias.
3. Se API antiga e nova coexistirem durante a publicação, usar uma janela de manutenção ou retirar tráfego da versão antiga antes da migração de dados: respostas com novos enums exigem o novo serializador.
4. Conferir no admin o total de exercícios sem classificação e executar a simulação operacional abaixo. Com o catálogo revisado, o planejado deve ser zero. Movimentos com anatomia ou execução diferente continuam sujeitos a revisão profissional.

O catálogo canônico de bootstrap mantém os mesmos 53 IDs originais; a expansão permanece separada. O seed só completa exercícios sem classificação, preservando futuras correções manuais. Famílias e grupos de treino são metadados editoriais versionados na API, não dependem da prioridade 3D e não são editados nesta interface.

## O que o admin permite

- Filtrar por família, grupo de treino e músculo; escolher se o músculo deve ser principal ou secundário. Filtros combinam com busca, conteúdo e prioridade 3D.
- Grupos não exclusivos: força, potência/explosão, pliometria, LPO, ginástica/calistenia, condicionamento, core/estabilidade e transportes. Landmine e kettlebell não são automaticamente explosivos; clean deadlift, jerk dip e drop landing também não são classificados como propulsão balística.
- Ordenar em ambas as direções pelos cabeçalhos, mover/ocultar colunas e guardar a configuração no navegador. Nome e detalhes permanecem acessíveis. O número global da fila 3D não muda ao filtrar ou ordenar.
- Ver músculos principais e secundários diretamente na tabela. Nos detalhes, consultar notas, referências e se o cadastro coincide com a revisão versionada.
- Editar músculos de exercícios globais. Exige ADMIN persistido, pelo menos um principal e grupos distintos. Atualização atômica, auditoria de antes/depois e proteção contra versão desatualizada (409). O endpoint próprio de usuários continua sem permissão para editar globais; o endpoint admin não edita personalizados.

Contrato: GET /admin/exercises e PUT /admin/exercises/:exerciseId/muscles. Zod/OpenAPI e cliente Orval atualizados. Exercise.updatedAt muda junto com os músculos, para invalidar o cache do catálogo. Correções podem reclassificar retrospectivamente os relatórios musculares, que consultam a taxonomia atual; os registros de performance permanecem intactos.

## Critérios anatômicos e limites

Principais representam alvos/motores relevantes ao movimento adotado; secundários representam sinergistas e estabilizadores relevantes. Não se tenta listar cada músculo que apresenta qualquer atividade elétrica. Uma lista secundária vazia é válida para movimentos isolados e não significa isolamento absoluto.

Os grupos são amplos: BACK inclui dorsais, trapézios, romboides e eretores; SHOULDERS inclui deltoides e estabilizadores do ombro; CORE representa a parede abdominal e controle do tronco. GLUTES se refere principalmente ao glúteo máximo, enquanto HIP_ABDUCTORS inclui glúteos médio/mínimo e tensor da fáscia lata. HIP_FLEXORS representa a flexão do quadril; TIBIALIS_ANTERIOR representa a dorsiflexão do tornozelo. Não são sinônimos de abdutores ou panturrilhas.

A classificação é uma **inferência editorial biomecânica**, apoiada pelas ações articulares e referências abaixo. Nem todas as variações possuem estudo individual, e EMG de uma condição não estabelece percentuais de ativação, equivalência de séries ou hipertrofia em outra. Técnica, amplitude, apoio, equipamento e intenção podem alterar a contribuição relativa. As notas por exercício documentam ambiguidades, como o equipamento do supino inclinado genérico e a execução da extensão lombar. A revisão não modifica modelos ou cores 3D; esse trabalho exige validação própria.

## Referências consultadas

- [Supino e crucifixo: estudo comparativo (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7675616/).
- [Leg press e variações: revisão sistemática (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7369968/).
- [Glúteo máximo em exercícios de força: revisão sistemática (2020)](https://pubmed.ncbi.nlm.nih.gov/32132843/).
- [Levantamento terra e variações: revisão sistemática (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7046193/).
- [Flexores do quadril: revisão de exercícios (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11546833/).
- [Anatomia do tibial anterior — NCBI](https://www.ncbi.nlm.nih.gov/books/NBK513304/).
- [Deltoide posterior e face pull: modelagem biomecânica (2026)](https://pubmed.ncbi.nlm.nih.gov/41964926/).
- [Swing, snatch e clean com kettlebell: comparação eletromiográfica (2017)](https://pubmed.ncbi.nlm.nih.gov/28394829/).
- [Biblioteca de movimentos ACE](https://www.acefitness.org/resources/everyone/exercise-library/), [CrossFit](https://www.crossfit.com/crossfit-movements) e [Catalyst Athletics](https://www.catalystathletics.com/exercises/): referências de execução e nomenclatura, não comprovação de EMG de cada variante.

## Operação e recuperação

Na API, `npm run catalog:review-muscles` executa somente uma simulação e grava snapshot/relatório em .tmp/catalog-review, fora do versionamento. Não imprime credenciais nem dados de usuários. Para reaplicar uma revisão intencionalmente, após validar o destino e o snapshot, usar `npm run catalog:review-muscles -- --apply --target=<fingerprint-do-destino>`. Não é tarefa de startup/deploy recorrente: uma reaplicação deliberada pode substituir decisões manuais posteriores.

O script recusa IDs globais não revisados, renomeações e alterações entre o snapshot e a transação. A migração inicial aceita ambientes com apenas parte do catálogo; trabalha por IDs existentes e recusa renomeações nos IDs globais revisados. Migração e script são idempotentes quanto às associações e não tocam exercícios personalizados. Para desfazer dados, restaurar **somente** as associações dos IDs alterados a partir do snapshot anterior, dentro de transação, e atualizar Exercise.updatedAt. Não restaurar tabelas de histórico ou excluir exercícios. As adições do enum podem permanecer.

## Classificação por exercício

A fonte de verdade é src/domain/exercise-catalog-review.json na API, validada em runtime. Esta tabela permite a conferência humana da revisão. IDs permanecem os do manifesto.

| Exercício | Principais | Secundários |
|---|---|---|
| Abdominal com AbMat | Core | Flexores do quadril |
| Abdominal Crunch no Solo | Core | Nenhum cadastrado |
| Abdominal na Máquina | Core | Nenhum cadastrado |
| Abdominal no Cabo | Core | Nenhum cadastrado |
| Abdominal Reverso | Core | Flexores do quadril |
| Abdução de Quadril no Cabo | Abdutores do quadril | Glúteos (ênfase no máximo), Core |
| Adução de Quadril no Cabo | Adutores | Core |
| Afundo Estático com Halteres | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Abdutores do quadril, Posteriores, Core |
| Afundo Lateral com Halter | Quadríceps, Glúteos (ênfase no máximo), Adutores | Abdutores do quadril, Core |
| Afundo Reverso com Halteres | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Abdutores do quadril, Posteriores, Core |
| Afundo Reverso com Press Unilateral no Landmine | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Peito, Abdutores do quadril, Core |
| Agachamento | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores |
| Agachamento Búlgaro | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Abdutores do quadril, Core, Posteriores |
| Agachamento com Peso Corporal — alias: air squat | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core |
| Agachamento com Press no Landmine | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Peito, Core |
| Agachamento Frontal | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores |
| Agachamento Goblet | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores |
| Agachamento Hack na Máquina | Quadríceps, Glúteos (ênfase no máximo) | Adutores |
| Agachamento Livre | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores |
| Agachamento no Banco — alias: box squat | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores |
| Agachamento no Belt Squat | Quadríceps, Glúteos (ênfase no máximo) | Adutores |
| Agachamento no Landmine | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core |
| Agachamento no Pêndulo | Quadríceps, Glúteos (ênfase no máximo) | Adutores |
| Agachamento no Smith | Quadríceps, Glúteos (ênfase no máximo) | Adutores |
| Agachamento Sumô com Halter | Quadríceps, Glúteos (ênfase no máximo), Adutores | Core |
| Agachamento Zercher | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Core, Costas / eretores, Bíceps |
| Anti-Rotação no Landmine | Core | Ombros, Glúteos (ênfase no máximo), Costas / eretores |
| Arch Hold — alias: Superman hold | Costas / eretores, Glúteos (ênfase no máximo) | Posteriores, Ombros |
| Arremesso de Medicine Ball Acima da Cabeça para Frente | Costas / eretores, Core, Tríceps | Ombros, Peito, Glúteos (ênfase no máximo), Quadríceps |
| Arremesso de Medicine Ball para Trás Acima da Cabeça | Glúteos (ênfase no máximo), Quadríceps, Posteriores | Costas / eretores, Ombros, Panturrilhas, Core |
| Arremesso de Peito com Medicine Ball na Parede | Peito, Tríceps | Ombros, Core |
| Arremesso de Peito Sentado com Medicine Ball | Peito, Tríceps | Ombros, Core |
| Arremesso Rotacional de Medicine Ball na Parede | Core, Glúteos (ênfase no máximo) | Quadríceps, Peito, Ombros, Tríceps |
| Avanço com Halteres | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Abdutores do quadril, Posteriores, Panturrilhas, Core |
| Barra Fixa | Costas / eretores | Bíceps, Antebraços, Core |
| Barra Fixa Assistida na Máquina | Costas / eretores | Bíceps, Antebraços |
| Barra Fixa com Pegada Neutra | Costas / eretores | Bíceps, Antebraços, Core |
| Barra Fixa com Pegada Supinada — alias: chin-up | Costas / eretores, Bíceps | Antebraços, Core |
| Battle Rope com Ondas Alternadas | Ombros | Costas / eretores, Bíceps, Tríceps, Antebraços, Core, Quadríceps, Glúteos (ênfase no máximo) |
| Bicicleta de Ar — alias: air bike | Quadríceps, Glúteos (ênfase no máximo) | Posteriores, Panturrilhas, Peito, Costas / eretores, Ombros, Tríceps, Bíceps, Core |
| Bird Dog | Core, Costas / eretores | Glúteos (ênfase no máximo), Ombros |
| Burpee | Peito, Tríceps, Quadríceps, Glúteos (ênfase no máximo) | Ombros, Core, Panturrilhas |
| Burpee com Salto por Cima da Caixa | Peito, Tríceps, Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Ombros, Core, Posteriores |
| Burpee sobre a Barra | Peito, Tríceps, Quadríceps, Glúteos (ênfase no máximo) | Ombros, Core, Panturrilhas |
| Butterfly Pull-up | Costas / eretores | Bíceps, Ombros, Core, Flexores do quadril, Glúteos (ênfase no máximo), Antebraços |
| Cadeira Abdutora | Abdutores do quadril | Glúteos (ênfase no máximo) |
| Cadeira Adutora | Adutores | Nenhum cadastrado |
| Cadeira Extensora | Quadríceps | Nenhum cadastrado |
| Cadeira Flexora | Posteriores | Panturrilhas |
| Caminhada Lateral com Miniband | Abdutores do quadril | Glúteos (ênfase no máximo), Quadríceps, Core |
| Chest-to-Bar Pull-up | Costas / eretores | Bíceps, Ombros, Core, Flexores do quadril, Glúteos (ênfase no máximo), Antebraços |
| Clean — aliases: squat clean, full clean | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Antebraços, Core |
| Clean a Partir de Blocos | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Antebraços, Core |
| Clean and Jerk | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Ombros | Tríceps, Costas / eretores, Panturrilhas, Antebraços, Core |
| Clean com Medicine Ball | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Costas / eretores, Ombros, Antebraços, Core |
| Clean Deadlift | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Costas / eretores, Core, Antebraços |
| Clean High Pull | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores | Panturrilhas, Ombros, Bíceps, Antebraços, Core |
| Clean Pull | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores | Panturrilhas, Antebraços, Core |
| Corrida | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Panturrilhas | Flexores do quadril, Abdutores do quadril, Core, Tibial anterior |
| Corrida de Ida e Volta — alias: shuttle run | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Panturrilhas | Flexores do quadril, Abdutores do quadril, Adutores, Core, Tibial anterior |
| Crossover no Cabo Alto | Peito | Ombros |
| Crucifixo Inclinado | Peito | Ombros |
| Crucifixo Inverso com Halteres | Ombros, Costas / eretores | Core |
| Crucifixo Inverso na Máquina | Ombros, Costas / eretores | Nenhum cadastrado |
| Crucifixo Inverso no Cabo | Ombros, Costas / eretores | Nenhum cadastrado |
| Crucifixo na Máquina — aliases: peck deck, pec deck, voador | Peito | Ombros |
| Crucifixo no Cabo Baixo | Peito | Ombros |
| Crucifixo no Cabo na Altura do Peito | Peito | Ombros |
| Crucifixo Reto com Halteres | Peito | Ombros |
| Dead Bug | Core | Flexores do quadril, Ombros |
| Depth Jump — queda da caixa seguida de salto | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| Desenvolvimento Arnold | Ombros | Tríceps, Costas / eretores |
| Desenvolvimento Bilateral no Landmine | Ombros, Peito | Tríceps, Costas / eretores, Core |
| Desenvolvimento com Halteres | Ombros | Tríceps, Costas / eretores |
| Desenvolvimento de Ombros na Máquina | Ombros | Tríceps, Costas / eretores |
| Desenvolvimento de Ombros no Smith | Ombros | Tríceps, Costas / eretores |
| Desenvolvimento Militar | Ombros | Tríceps, Costas / eretores, Core |
| Desenvolvimento Unilateral Meio-Ajoelhado no Landmine | Ombros, Peito | Tríceps, Costas / eretores, Core, Glúteos (ênfase no máximo) |
| Desenvolvimento Unilateral no Landmine — alias: single-arm landmine press | Ombros, Peito | Tríceps, Costas / eretores, Core |
| Devil Press com Halteres | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Ombros, Peito | Tríceps, Costas / eretores, Panturrilhas, Core, Antebraços |
| Drop Landing — queda da caixa com estabilização | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Abdutores do quadril, Core |
| Elevação de Joelhos Suspenso | Flexores do quadril, Core | Antebraços, Costas / eretores |
| Elevação de Pernas Suspenso | Flexores do quadril, Core | Antebraços, Costas / eretores |
| Elevação de Tibial Anterior | Tibial anterior | Nenhum cadastrado |
| Elevação Frontal com Halteres | Ombros | Peito, Costas / eretores |
| Elevação Lateral | Ombros | Costas / eretores |
| Elevação Lateral na Máquina | Ombros | Costas / eretores |
| Elevação Lateral no Cabo | Ombros | Costas / eretores |
| Elevação Pélvica | Glúteos (ênfase no máximo) | Posteriores, Adutores, Core |
| Elevação Pélvica Unilateral | Glúteos (ênfase no máximo) | Posteriores, Adutores, Abdutores do quadril, Core |
| Empurrar Trenó | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Peito, Tríceps, Ombros, Core |
| Encolhimento com Barra | Costas / eretores | Antebraços |
| Encolhimento com Halteres | Costas / eretores | Antebraços |
| Extensão de Punho com Barra | Antebraços | Nenhum cadastrado |
| Extensão de Quadril no Cabo | Glúteos (ênfase no máximo) | Posteriores, Core |
| Face Pull no Cabo | Ombros, Costas / eretores | Bíceps, Antebraços |
| Farmer Carry com Halteres | Antebraços, Costas / eretores, Core | Glúteos (ênfase no máximo), Quadríceps, Panturrilhas, Abdutores do quadril |
| Flexão de Braços | Peito | Tríceps, Ombros, Core |
| Flexão de Braços com Joelhos Apoiados | Peito | Tríceps, Ombros, Core |
| Flexão de Braços com Mãos Elevadas | Peito | Tríceps, Ombros, Core |
| Flexão de Braços com Pés Elevados | Peito | Tríceps, Ombros, Core |
| Flexão de Braços nas Argolas | Peito | Tríceps, Ombros, Core |
| Flexão de Joelhos com Bola Suíça | Posteriores, Glúteos (ênfase no máximo) | Panturrilhas, Core |
| Flexão de Joelhos em Pé na Máquina | Posteriores | Panturrilhas |
| Flexão de Joelhos Unilateral na Máquina | Posteriores | Panturrilhas |
| Flexão Nórdica de Posteriores — alias: Nordic curl | Posteriores | Panturrilhas, Glúteos (ênfase no máximo), Core |
| Flexão Pliométrica | Peito, Tríceps | Ombros, Core |
| Front Rack Carry com Kettlebells | Core, Costas / eretores | Antebraços, Ombros, Bíceps, Glúteos (ênfase no máximo), Quadríceps, Panturrilhas |
| Good Morning com Barra | Posteriores, Glúteos (ênfase no máximo) | Costas / eretores, Core, Adutores |
| Handstand Push-up Estrito | Ombros, Tríceps | Costas / eretores, Core |
| Handstand Walk | Ombros, Tríceps | Core, Costas / eretores, Antebraços |
| Hang Clean | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Antebraços, Core |
| Hang Power Clean | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Antebraços, Core |
| Hang Power Clean com Halteres | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Bíceps, Antebraços, Core |
| Hang Power Snatch | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Hang Snatch | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Hiperextensão Lombar | Costas / eretores | Glúteos (ênfase no máximo), Posteriores, Core |
| Hollow Hold | Core | Flexores do quadril, Quadríceps |
| Jerk Dip | Quadríceps, Glúteos (ênfase no máximo) | Panturrilhas, Costas / eretores, Core |
| Jerk Drive | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Costas / eretores, Core |
| Kettlebell Clean Unilateral | Glúteos (ênfase no máximo), Posteriores, Quadríceps | Costas / eretores, Ombros, Bíceps, Core, Antebraços |
| Kettlebell Jerk Unilateral | Ombros, Quadríceps, Glúteos (ênfase no máximo) | Tríceps, Panturrilhas, Costas / eretores, Core, Antebraços |
| Kettlebell Push Press Unilateral | Ombros, Quadríceps, Glúteos (ênfase no máximo) | Tríceps, Panturrilhas, Costas / eretores, Core, Antebraços |
| Kettlebell Snatch Unilateral | Glúteos (ênfase no máximo), Posteriores, Quadríceps | Costas / eretores, Ombros, Tríceps, Core, Antebraços |
| Kettlebell Swing Acima da Cabeça — alias: American swing | Glúteos (ênfase no máximo), Posteriores | Quadríceps, Costas / eretores, Ombros, Core, Antebraços |
| Kettlebell Swing até a Altura dos Ombros — alias: Russian swing | Glúteos (ênfase no máximo), Posteriores | Quadríceps, Costas / eretores, Core, Antebraços |
| Kettlebell Swing Unilateral | Glúteos (ênfase no máximo), Posteriores | Quadríceps, Costas / eretores, Ombros, Core, Antebraços |
| Kipping Handstand Push-up | Ombros, Tríceps | Quadríceps, Glúteos (ênfase no máximo), Flexores do quadril, Core |
| Kipping Pull-up | Costas / eretores | Bíceps, Ombros, Core, Flexores do quadril, Glúteos (ênfase no máximo), Antebraços |
| Knees-to-Elbows | Core, Flexores do quadril | Costas / eretores, Ombros, Antebraços |
| L-Sit nas Paralelas | Core, Flexores do quadril | Quadríceps, Tríceps, Ombros |
| Leg Press 45 | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Posteriores, Panturrilhas |
| Leg Press Horizontal | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Posteriores, Panturrilhas |
| Leg Press Unilateral | Quadríceps, Glúteos (ênfase no máximo) | Adutores, Posteriores, Panturrilhas |
| Levantamento Terra | Glúteos (ênfase no máximo), Quadríceps, Posteriores | Costas / eretores, Core, Adutores, Antebraços |
| Levantamento Terra com Trap Bar | Quadríceps, Glúteos (ênfase no máximo) | Posteriores, Costas / eretores, Core, Antebraços |
| Levantamento Terra no Landmine | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Costas / eretores, Core, Antebraços |
| Levantamento Terra Romeno com Barra | Posteriores, Glúteos (ênfase no máximo) | Costas / eretores, Core, Adutores, Antebraços |
| Levantamento Terra Romeno Unilateral com Halter | Posteriores, Glúteos (ênfase no máximo) | Abdutores do quadril, Costas / eretores, Core, Adutores, Antebraços |
| Levantamento Terra Sumô | Glúteos (ênfase no máximo), Quadríceps, Adutores | Posteriores, Costas / eretores, Core, Antebraços |
| Mesa Flexora | Posteriores | Panturrilhas |
| Muscle Clean | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores | Panturrilhas, Ombros, Bíceps, Antebraços, Core |
| Muscle Snatch | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores, Ombros | Panturrilhas, Tríceps, Antebraços, Core |
| Muscle-up na Barra | Costas / eretores, Peito, Tríceps | Bíceps, Ombros, Core, Antebraços |
| Muscle-up nas Argolas | Costas / eretores, Peito, Tríceps | Bíceps, Ombros, Core, Antebraços |
| Overhead Carry Unilateral | Ombros, Core | Tríceps, Costas / eretores, Antebraços, Glúteos (ênfase no máximo), Quadríceps, Panturrilhas, Abdutores do quadril |
| Overhead Squat | Quadríceps, Glúteos (ênfase no máximo) | Ombros, Tríceps, Costas / eretores, Adutores, Core |
| Pallof Press no Cabo | Core | Ombros, Peito, Glúteos (ênfase no máximo) |
| Panturrilha em Pé | Panturrilhas | Nenhum cadastrado |
| Panturrilha no Leg Press | Panturrilhas | Nenhum cadastrado |
| Panturrilha Sentado | Panturrilhas | Nenhum cadastrado |
| Panturrilha Unilateral em Pé | Panturrilhas | Abdutores do quadril, Core |
| Paralelas | Peito, Tríceps | Ombros |
| Paralelas Assistidas na Máquina | Peito, Tríceps | Ombros |
| Paralelas nas Argolas | Peito, Tríceps | Ombros, Core |
| Pistol Squat | Quadríceps, Glúteos (ênfase no máximo) | Abdutores do quadril, Adutores, Panturrilhas, Core |
| Pogo Jump Bilateral | Panturrilhas | Quadríceps, Glúteos (ênfase no máximo), Core |
| Pogo Jump Unilateral | Panturrilhas | Quadríceps, Glúteos (ênfase no máximo), Abdutores do quadril, Core |
| Ponte de Glúteos no Solo | Glúteos (ênfase no máximo) | Posteriores, Adutores, Core |
| Power Clean | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Antebraços, Core |
| Power Clean com Halteres | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Bíceps, Antebraços, Core |
| Power Snatch | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Prancha Lateral | Core | Abdutores do quadril, Ombros, Glúteos (ênfase no máximo) |
| Prancha Ventral | Core | Ombros, Glúteos (ênfase no máximo), Quadríceps |
| Press Rotacional Unilateral no Landmine | Ombros, Core, Glúteos (ênfase no máximo) | Quadríceps, Tríceps, Peito, Panturrilhas |
| Pular Corda com Giro Duplo — alias: double-under | Panturrilhas | Quadríceps, Glúteos (ênfase no máximo), Core, Ombros, Antebraços |
| Pular Corda com Giro Simples — alias: single-under | Panturrilhas | Quadríceps, Glúteos (ênfase no máximo), Core, Ombros, Antebraços |
| Pulldown com Braços Estendidos no Cabo | Costas / eretores | Tríceps, Core |
| Pullover com Halter | Peito, Costas / eretores | Tríceps, Core |
| Push Jerk | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Push Press com Barra | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Push Press com Halteres | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Push Press Unilateral no Landmine | Ombros, Quadríceps, Glúteos (ênfase no máximo) | Tríceps, Peito, Panturrilhas, Core |
| Puxada Frontal | Costas / eretores | Bíceps, Antebraços |
| Puxada Frontal com Pegada Neutra | Costas / eretores | Bíceps, Antebraços |
| Puxada Frontal com Pegada Supinada | Costas / eretores | Bíceps, Antebraços |
| Puxada Frontal na Máquina | Costas / eretores | Bíceps, Antebraços |
| Puxada Unilateral no Cabo | Costas / eretores | Bíceps, Antebraços, Core |
| Puxar Trenó Caminhando para Trás | Quadríceps | Glúteos (ênfase no máximo), Panturrilhas, Costas / eretores, Antebraços, Core |
| Remada Alta com Barra | Ombros, Costas / eretores | Bíceps, Antebraços |
| Remada Baixa no Cabo com Barra Aberta | Costas / eretores | Ombros, Bíceps, Antebraços |
| Remada Baixa no Cabo com Triângulo | Costas / eretores | Bíceps, Ombros, Antebraços |
| Remada Cavalinho | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remada com Halteres e Peito Apoiado | Costas / eretores | Bíceps, Ombros, Antebraços |
| Remada Curvada | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remada Curvada com Barra | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remada Invertida na Barra | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remada Meadows | Costas / eretores | Ombros, Bíceps, Antebraços, Core |
| Remada nas Argolas | Costas / eretores | Bíceps, Ombros, Core, Antebraços |
| Remada Pendlay | Costas / eretores | Bíceps, Ombros, Antebraços, Core, Glúteos (ênfase no máximo), Posteriores |
| Remada Renegade com Halteres | Costas / eretores, Core | Bíceps, Ombros, Tríceps, Glúteos (ênfase no máximo), Antebraços |
| Remada Sentada na Máquina | Costas / eretores | Bíceps, Ombros, Antebraços |
| Remada Unilateral com Halteres | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remada Unilateral na Máquina | Costas / eretores | Bíceps, Ombros, Antebraços |
| Remada Unilateral no Landmine | Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Remo no Ergômetro | Quadríceps, Glúteos (ênfase no máximo), Costas / eretores | Posteriores, Bíceps, Antebraços, Core |
| Roda Abdominal — alias: ab wheel rollout | Core | Costas / eretores, Ombros, Tríceps, Flexores do quadril |
| Rosca Alternada com Halteres | Bíceps | Antebraços |
| Rosca Concentrada | Bíceps | Antebraços |
| Rosca de Punho com Barra | Antebraços | Nenhum cadastrado |
| Rosca Direta | Bíceps | Antebraços |
| Rosca Direta com Barra | Bíceps | Antebraços |
| Rosca Direta no Cabo | Bíceps | Antebraços |
| Rosca Inclinada com Halteres | Bíceps | Antebraços |
| Rosca Inversa com Barra | Antebraços, Bíceps | Nenhum cadastrado |
| Rosca Martelo | Bíceps, Antebraços | Nenhum cadastrado |
| Rosca Scott | Bíceps | Antebraços |
| Rosca Scott na Máquina | Bíceps | Antebraços |
| Rosca Spider | Bíceps | Antebraços |
| Salto Horizontal Parado — alias: standing broad jump | Glúteos (ênfase no máximo), Quadríceps, Panturrilhas | Posteriores, Core |
| Salto Lateral Alternado — alias: skater jump | Glúteos (ênfase no máximo), Quadríceps, Panturrilhas | Abdutores do quadril, Adutores, Posteriores, Core |
| Salto Lateral sobre Obstáculo | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Abdutores do quadril, Adutores, Posteriores, Core |
| Salto na Caixa — alias: box jump | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| Salto por Cima da Caixa — alias: box jump-over | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| Salto Unilateral para Frente | Glúteos (ênfase no máximo), Quadríceps, Panturrilhas | Abdutores do quadril, Posteriores, Core |
| Salto Vertical com Contramovimento | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| Salto Vertical Partindo de Agachamento — alias: squat jump | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| Saltos Alternados em Afundo — alias: split squat jump | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Abdutores do quadril, Adutores, Posteriores, Core |
| Saltos Horizontais Consecutivos | Glúteos (ênfase no máximo), Quadríceps, Panturrilhas | Posteriores, Core |
| Saltos sobre Barreiras | Quadríceps, Glúteos (ênfase no máximo), Panturrilhas | Posteriores, Core |
| SkiErg | Costas / eretores, Tríceps, Core | Ombros, Glúteos (ênfase no máximo), Quadríceps |
| Slam Ball no Solo | Costas / eretores, Core, Tríceps | Ombros, Glúteos (ênfase no máximo), Quadríceps |
| Slam Ball Rotacional | Core, Costas / eretores, Tríceps | Ombros, Glúteos (ênfase no máximo), Quadríceps |
| Snatch — aliases: squat snatch, full snatch | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Snatch a Partir de Blocos | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Snatch Balance | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Snatch Deadlift | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Costas / eretores, Core, Antebraços |
| Snatch High Pull | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores | Panturrilhas, Ombros, Bíceps, Antebraços, Core |
| Snatch Pull | Quadríceps, Glúteos (ênfase no máximo), Posteriores, Costas / eretores | Panturrilhas, Antebraços, Core |
| Snatch Unilateral com Halter | Quadríceps, Glúteos (ênfase no máximo), Posteriores | Panturrilhas, Costas / eretores, Ombros, Tríceps, Antebraços, Core |
| Split Jerk | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Abdutores do quadril, Core |
| Sprint | Glúteos (ênfase no máximo), Posteriores, Quadríceps, Panturrilhas, Flexores do quadril | Abdutores do quadril, Core, Tibial anterior |
| Squat Jerk | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Step-up com Halteres | Quadríceps, Glúteos (ênfase no máximo) | Abdutores do quadril, Posteriores, Panturrilhas, Core |
| Stiff | Posteriores, Glúteos (ênfase no máximo) | Costas / eretores, Core, Adutores, Antebraços |
| Subida na Corda | Costas / eretores, Bíceps, Antebraços | Ombros, Core, Flexores do quadril, Quadríceps, Glúteos (ênfase no máximo) |
| Suitcase Carry com Halter | Core, Antebraços | Costas / eretores, Glúteos (ênfase no máximo), Quadríceps, Panturrilhas, Abdutores do quadril |
| Supino com Pegada Fechada | Tríceps, Peito | Ombros |
| Supino Declinado com Barra | Peito | Tríceps, Ombros |
| Supino Declinado com Halteres | Peito | Tríceps, Ombros |
| Supino Declinado no Smith | Peito | Tríceps, Ombros |
| Supino Inclinado | Peito | Tríceps, Ombros |
| Supino Inclinado com Halteres | Peito | Tríceps, Ombros |
| Supino Inclinado na Máquina | Peito | Tríceps, Ombros |
| Supino Inclinado no Smith | Peito | Tríceps, Ombros |
| Supino Reto | Peito | Tríceps, Ombros |
| Supino Reto com Barra | Peito | Tríceps, Ombros |
| Supino Reto com Halteres | Peito | Tríceps, Ombros |
| Supino Reto na Máquina | Peito | Tríceps, Ombros |
| Supino Reto no Smith | Peito | Tríceps, Ombros |
| Tall Clean | Quadríceps, Glúteos (ênfase no máximo), Costas / eretores | Bíceps, Ombros, Antebraços, Core |
| Tall Snatch | Ombros, Costas / eretores, Quadríceps, Glúteos (ênfase no máximo) | Tríceps, Antebraços, Core |
| Thruster com Barra | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Thruster com Halteres | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Costas / eretores, Panturrilhas, Core |
| Toes-to-Bar | Core, Flexores do quadril | Costas / eretores, Ombros, Antebraços |
| Tríceps Acima da Cabeça no Cabo | Tríceps | Nenhum cadastrado |
| Tríceps Coice com Halter | Tríceps | Ombros |
| Tríceps Corda | Tríceps | Nenhum cadastrado |
| Tríceps Francês Unilateral | Tríceps | Nenhum cadastrado |
| Tríceps no Cabo com Barra Reta | Tríceps | Nenhum cadastrado |
| Tríceps Testa | Tríceps | Nenhum cadastrado |
| Tríceps Unilateral no Cabo | Tríceps | Nenhum cadastrado |
| Turkish Get-up | Core, Ombros, Glúteos (ênfase no máximo), Quadríceps | Tríceps, Costas / eretores, Abdutores do quadril, Antebraços |
| Wall Ball — agachamento com lançamento da bola ao alvo | Quadríceps, Glúteos (ênfase no máximo), Ombros | Tríceps, Peito, Core, Panturrilhas |
| Wall Walk | Ombros, Tríceps, Core | Peito, Costas / eretores, Glúteos (ênfase no máximo) |
| Woodchop no Cabo Alto | Core | Costas / eretores, Ombros, Glúteos (ênfase no máximo) |
