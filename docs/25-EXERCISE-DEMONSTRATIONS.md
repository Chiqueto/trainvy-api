# Demonstrações de exercícios — 17/11/2026

Implementado no código: em `/personal/exercicios`, o personal pode adicionar um link de vídeo do YouTube e/ou selecionar uma execução da biblioteca 3D ao criar ou editar um exercício próprio. A aba Biblioteca Trainvy permite personalizar a demonstração dos exercícios globais sem duplicar exercícios, alterar músculos ou modificar a mídia compartilhada.

O guia de execução usado no treino e na sessão abre primeiro o vídeo quando configurado. Permite alternar para 3D e ilustrações. O player só carrega o iframe após o usuário clicar, utiliza `youtube-nocookie.com`, suporta tela cheia e oferece link externo caso o vídeo não possa ser reproduzido. Não há upload nem cópia do arquivo para os servidores do Trainvy. Incorporação segue a [documentação oficial do YouTube](https://developers.google.com/youtube/player_parameters).

## Dados e permissões

`ExerciseDemonstration` tem unicidade por `(exerciseId, ownerUserId)`, `youtubeUrl` e `animationKey` opcionais. Os dois campos nulos removem a configuração; omitir `demonstration` na edição preserva a configuração. Cadastro/edição de exercício próprio salva os dados atomicamente. A configuração só referencia modelos existentes; não altera biomecânica, cores ou mapas anatômicos. A interface identifica a referência escolhida e mantém sua anatomia e suas instruções ilustrativas.

`PUT /exercises/:exerciseId/demonstration` grava somente a configuração do usuário autenticado. Exercícios privados de outro usuário retornam 404. Personalizações de exercícios globais exigem conta de personal, configuração inicial, habilitação profissional e entitlement `MANAGE_ATHLETES` pelas verificações existentes no backend.

`GET /exercises/:exerciseId/media` retorna a configuração própria primeiro; para alunos, consulta apenas personal com vínculo `ACTIVE` e conta não excluída. Exercícios privados do personal também exigem esse vínculo. Outro personal ou aluno sem vínculo não recebe a personalização. Revogar o vínculo bloqueia novas consultas à mídia privada; exercícios globais voltam à demonstração padrão. A resposta não é armazenada em cache. O catálogo retorna apenas configurações do próprio usuário e sua versão considera alterações/remoções dessas configurações.

Se houver múltiplos vínculos ativos legados, a resolução usa a configuração atualizada mais recentemente entre os professores vinculados, com desempate pelo ID. Não aceita `coachId` arbitrário do cliente.

A exclusividade é dentro do Trainvy: links públicos ou não listados continuam sujeitos à visibilidade e às permissões de incorporação definidas no YouTube. Uma reprodução já aberta no YouTube não pode ser revogada pelo Trainvy.

## Entrega e validação

Migration aditiva: `20261117150000_exercise_demonstrations`. Aplicar na API antes de publicar o código. O contrato Zod/OpenAPI e cliente Orval foram atualizados. Upload de vídeo permanece futuro.

Testes cobrem URLs maliciosas, formatos de link, referência 3D explícita, carregamento do player mediante clique, ownership, personalizações de coaches diferentes, aluno sem vínculo, revogação, preservação/remoção e imutabilidade do catálogo global.
