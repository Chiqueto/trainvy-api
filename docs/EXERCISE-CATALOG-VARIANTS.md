# Variações do catálogo — 12/11/2026

O catálogo foi ampliado de 265 para 401 exercícios globais: 136 variações com UUIDs estáveis, unilateralidade e músculos principais/secundários. Os 265 registros anteriores foram preservados, incluindo nomes, IDs e datas; não foram alterados planos, sessões, cargas ou mídias.

| Família | Novos cadastros |
| --- | ---: |
| Ombros, braços e antebraços | 65 |
| Peito | 11 |
| Costas | 14 |
| Pernas e quadril | 41 |
| Core e estabilidade | 5 |

Foram contemplados acessórios de polia (barra reta, W, V, corda e pegador individual, conforme o exercício), barras, halteres, máquinas, Smith, apoios e execução por lado. Não foi criado um produto cartesiano de equipamentos: somente combinações usuais e coerentes com cada movimento.

Tríceps testa agora tem opções explícitas com barra reta, barra W, halteres, halter unilateral, polia com barra reta/W/corda e polia unilateral. Roscas incluem direta, Scott, spider, martelo, inversa, concentrada, inclinada e Bayesian nas variações descritas no manifesto. Os nomes genéricos antigos continuam disponíveis para preservar a identidade histórica sem presumir equipamento.

A fonte versionada das novas entradas é `src/domain/exercise-catalog-variants.json`. Ela integra a revisão editorial de músculos e referências; `exercise-catalog-expansion.json` contém as mesmas identidades para importação operacional. A fila 3D foi ampliada ao final, preservando a ordem anterior; não foram produzidas animações nem atribuídas mídias de outros exercícios. Os registros continuam sujeitos à revisão profissional individual.

## Fundamentação e limites

As referências de cada entrada distinguem descrição técnica e inferência anatômica de evidência direta. [Maeo et al.](https://pubmed.ncbi.nlm.nih.gov/35819335/) estudaram extensões de cotovelo no cabo com diferentes posições do ombro; [Attarieh et al.](https://pubmed.ncbi.nlm.nih.gov/40082069/) compararam roscas Scott e Bayesian no cabo. Essas pesquisas fundamentam a diferenciação de execução, sem comprovar individualmente cada acessório. As demais entradas referenciam a biblioteca técnica ACE e as fontes anatômicas/biomecânicas já documentadas no catálogo.

Classificação por grupo muscular é editorial e ilustrativa. Não representa EMG medido, isolamento de cabeças musculares ou superioridade de hipertrofia de uma variação.

## Aplicação e verificação

`npm run catalog:expand -- --variants` simula; `npm run catalog:expand -- --variants --apply` insere somente os novos exercícios e suas associações musculares em uma transação. O script valida o destino já configurado e salva snapshot/relatório local ignorado pelo Git em `.tmp/catalog-expansion`. Não substitui classificações manuais existentes.

A operação foi aplicada ao banco configurado em 12/11/2026. A migração aditiva `20261112120000_expand_equipment_variants` reproduz a inclusão em outros ambientes e não duplica os registros já inseridos pelo script. Aplicar pelo fluxo normal de migrations; não requer alteração do contrato HTTP ou regeneração do Orval. Publicar a API atualizada disponibiliza também famílias, fontes e notas editoriais no admin.

Validação: testes de cobertura e classificação; migração executada duas vezes em tabelas temporárias no banco de testes; proteção contra colisão com ID de usuário; preservação de dados manuais; TypeScript. Conferência operacional compara os 265 registros originais com o snapshot e valida os músculos dos 136 novos cadastros.
