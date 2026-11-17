# Detalhamento de exercícios personalizados — 17/11/2026

`Exercise.muscleDetails` é JSON opcional, adicionado pela migration
`20261117170000_custom_muscle_details`. Não modifica `anatomyReview`, reservado
às revisões científicas do catálogo, nem os identificadores dos exercícios.

POST/PATCH de exercícios recebem `muscleDetails`: lista de grupo, papel e
`detailIds`. O schema limita tamanho, rejeita grupos duplicados, identificadores
desconhecidos ou de outro grupo. Os use cases verificam a correspondência com
a classificação geral e preservam ownership. PATCH sem o campo conserva os
detalhes compatíveis; `[]` limpa explicitamente. Remover um grupo invalida seus
detalhes. Listagem e evolução devolvem somente detalhes compatíveis.

As opções em `src/domain/muscle-detail-options.json` espelham identificadores
das revisões anatômicas, consolidando aliases equivalentes no seletor. Manter
sincronizado com `app/_lib/muscle-detail-options.json` do frontend.

A busca considera os nomes dos detalhes selecionados. A evolução expõe a
classificação atual do exercício sem reescrever séries/sessões históricas.
Não há medição de ativação nem métricas de volume por região nesta mudança.

Aplicar a migration antes de publicar a API. O OpenAPI e o cliente Orval foram
regenerados pelo script `openapi:export`.
