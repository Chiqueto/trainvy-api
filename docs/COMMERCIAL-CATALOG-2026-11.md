# Catálogo comercial sem IA — 17/11/2026

Esta revisão substitui os valores e benefícios históricos do catálogo padrão descritos em 03 e 09.

| Plano | Código estável | Mensalidade de catálogo | Alunos |
| --- | --- | ---: | ---: |
| Atleta Grátis | ATHLETE_FREE | R$ 0 | Uso pessoal |
| Personal Essencial | COACH | R$ 19,90 | Até 20 |
| Personal Pro | COACH_AI | R$ 39,90 | Ilimitados |
| Internal | INTERNAL | R$ 0, privado | Ilimitados |

O código legado COACH_AI permanece por compatibilidade; o plano passa a se chamar Personal Pro e não inclui IA. IDs, vínculos, assinaturas, históricos e snapshots de preço/moeda são preservados. O novo preço vale para novas contratações; não há reajuste ou cobrança automática de assinantes existentes.

Atletas mantêm treinos manuais, séries, histórico e evolução. Ambos os planos profissionais oferecem área do personal, gestão de alunos, atribuição de fichas, histórico e estatísticas; diferem pela capacidade de alunos. Modelos e acompanhamento usam os fluxos profissionais existentes. Permissões profissionais continuam exigindo habilitação e vínculo nas operações correspondentes. A liberação comercial continua manual nesta fase.

## Referências de mercado

Consulta em 17/11/2026: a [MFIT](https://mfit.mfitpersonal.com.br/pages/assinaturas.html) anuncia 1 aluno gratuito, 3 por R$ 10,90/mês e ilimitados por R$ 39,90/mês. A [Tecnofit Personal](https://www.tecnofit.com.br/solucoes-tecnofit-personal/) anuncia Starter gratuito com 5 alunos e Performance a partir de R$ 24,90/mês, sujeito às condições da oferta.

Os preços do Trainvy são uma decisão de posicionamento baseada nessas referências; não representam equivalência de todos os recursos concorrentes. Não são prometidos pagamentos automáticos, RAG ou biblioteca de PDFs ainda indisponíveis.

## IA opcional

A migração `20261117120000_manual_commercial_catalog` remove AI_CHAT e AI_PLAN_GENERATION de **todos os planos existentes**, incluindo personalizados e internos. Remove também SOURCE_LIBRARY dos quatro planos padrão, pois o recurso ainda é futuro. As flags globais não são alteradas.

O bootstrap insert-only cria somente ofertas sem IA e continua preservando edições administrativas em execuções posteriores. A migração é pontual: habilitar uma flag depois não devolve IA aos planos revisados. O administrador pode criar um novo plano com IA e cotas explícitas quando a flag da audiência estiver habilitada. Planos internos exigem ambas as flags, pois podem ser atribuídos aos dois perfis. A mesma validação se aplica à edição de permissões. Remover IA é sempre permitido, inclusive com as flags desligadas.

A interface consulta as flags pelo provider existente; a API revalida dentro da transação e retorna `409 PLAN_AI_DISABLED` para evitar concessão com flag desligada. Uso de IA continua sujeito às cotas, consentimentos e demais autorizações existentes.

## Aplicação e validação

Aplicar a migração no backend pelo fluxo normal de release antes de publicar a interface. Ela é transacional e mantém publicação/ativação atuais dos planos; não republica ofertas ocultadas pelo administrador. Planos personalizados conservam preços, nomes e demais permissões.

O deploy de migrations no banco de teste encontrou P3005 (schema preexistente sem baseline compatível). Não foi realizado reset ou baseline forçado. A revisão SQL foi validada pelos testes comerciais em schema temporário, com rollback.

Após autorização explícita do usuário em 17/11/2026, a migração foi aplicada ao banco da aplicação via `npm run migrate:deploy`. Era a única migração pendente. A verificação posterior confirmou os novos nomes, preços e limites, zero permissões de IA em todos os planos, ambas as flags ainda desligadas e a preservação dos snapshots de preço/moeda das quatro assinaturas existentes.
