# Compliance Jurídico Trainvy

Versão inicial: 1.0.0. Referências conferidas em 06/11/2026.
Classificações são a matriz operacional do produto, não certificação de conformidade. Status PENDING/PARTIAL deve refletir evidência operacional, inclusive contratos com operadores, registro societário, retenção, reembolsos e revisão técnica real.

## Matriz jurídica

### CREF-01 — Exibição do CREF nas prescrições

**OBRIGATORIO_LEI** · CREF_PROFISSIONAL

Base: Lei 9.696/1998; Res. CONFEF 542/2024, art. 7º.

Todo plano prescrito por profissional identifica nome completo e CREF 000000-G/UF. O snapshot é preservado na aprovação.

### CREF-02 — Declaração de habilitação e trava de envio

**RECOMENDAVEL_RISCO** · CREF_PROFISSIONAL

Base: Código Civil, arts. 186 e 927; CDC, art. 14; Código Penal, art. 299.

Rascunhos e demonstrações não exigem ativação. Convidar, vincular ou enviar prescrições exige CPF válido, CREF/UF e aceite versionado. Declaração não equivale a consulta oficial. Suspensão exige revisão administrativa.

### CREF-03 — Enquadramento societário de tecnologia SaaS

**OBRIGATORIO_LEI** · CREF_PROFISSIONAL

Base: Lei 6.839/1980, art. 1º.

O Trainvy é atualmente mantido por Luís Felipe Mozer Chiqueto, pessoa física, sem CNPJ informado, como ferramenta de software e sem consultoria física direta. O CNAE 6203-1/00 é apenas referência para eventual formalização futura, não um enquadramento já existente. Na constituição de sociedade, o registro em conselho depende da atividade básica e dos serviços efetivamente prestados; o CNAE isolado não garante dispensa. Confirmar o enquadramento aplicável com assessoria especializada.

### IA-01 — Supervisão e aprovação humana

**OBRIGATORIO_LEI** · IA_PRESCRICAO

Base: Lei 9.696/1998, art. 3º; PL 2338/2023 como referência de governança.

Sugestões profissionais são DRAFT_AI e PROFESSIONAL_AI_ASSISTED. Exigem revisão explícita da versão antes de publicar para alunos. O PL 2338/2023 é projeto em tramitação, não fundamento de obrigação legal vigente; a supervisão é controle do produto para atuação profissional regulada.

### IA-02 — Guardrails da IA do aluno

**OBRIGATORIO_LEI** · IA_PRESCRICAO

Base: Lei 9.696/1998; CDC, arts. 6º, I e 14.

Diário pessoal auto-organizado. IA organiza dados fornecidos, descreve catálogo e execução. Não diagnostica, não prescreve reabilitação e não impõe cargas máximas. Dor aguda, tontura ou lesão exigem interrupção do exercício e avaliação profissional.

### IA-03 — Confirmação de importação OCR

**RECOMENDAVEL_RISCO** · IA_PRESCRICAO

Base: CDC, art. 14.

PDF, imagem ou texto extraído por IA exige prévia editável e confirmação explícita antes de salvar. Conferir séries, repetições e cargas: 10 kg não pode virar 100 kg silenciosamente.

### 3D-01 — Avisos de segurança biomecânica

**OBRIGATORIO_LEI** · ANIMACOES_3D

Base: CDC, arts. 8º e 9º.

Animações são ilustrativas. Amplitude e postura variam com individualidade biológica. Dor ou desconforto articular exigem interrupção. Cores mostram grupos ilustrativos; não representam EMG ou esforço medido.

### 3D-02 — Revisão técnica cinesiológica

**RECOMENDAVEL_RISCO** · ANIMACOES_3D

Base: CDC, art. 14, § 3º, I.

Registrar nome e CREF do revisor, data, exercício e nota de segurança. Somente revisão efetivamente realizada permite selo. O registro administrativo não substitui a análise técnica.

### LGPD-01 — Consentimento para saúde e IA

**OBRIGATORIO_LEI** · LGPD_DADOS

Base: LGPD, arts. 5º, II, 8º, 11, I e 18; Marco Civil, art. 15.

Consentimento específico e destacado para medidas, restrições e desempenho; aceites separados de termos e privacidade. Conta autônoma restrita a maiores de 18 anos. Revogação, exportação e exclusão disponíveis. Logs de acesso a aplicações têm retenção legal de seis meses; não se confunde com prazo universal dos dados de saúde ou aceites.

### LGPD-02 — Pseudonimização no envio a LLMs

**RECOMENDAVEL_RISCO** · LGPD_DADOS

Base: LGPD, art. 6º, III; Res. CD/ANPD 19/2024.

Remover identificadores diretos dos payloads e limitar informações técnicas. Pseudonimização não é anonimização irreversível. Transferências internacionais exigem mecanismo válido dos arts. 33 a 36 da LGPD. O art. 13, § 4º não constitui autorização geral para uso comercial de dados de saúde.

### SAAS-01 — Arrependimento e cancelamento

**OBRIGATORIO_LEI** · COMERCIALIZACAO_SAAS

Base: CDC, art. 49; Decreto 7.962/2013.

Na contratação à distância, assegurar arrependimento em sete dias e restituição integral quando aplicável, além de cancelamento claro da renovação. Planos mensais e anuais precisam de preço, periodicidade e condições visíveis. Cobrança automática ainda não está implementada: não declarar reembolso operacional concluído.

### SAAS-02 — Seguro de responsabilidade civil e cyber risk

**OPCIONAL** · RESPONSABILIDADE_CIVIL

Base: Gestão de risco empresarial.

Avaliar contratação de E&O/cyber risk após o MVP. Não existe apólice presumida nem transferência automática das responsabilidades legais.

## Documentos legais versionados

### termos-de-uso · 1.0.0

Audiência: ALL_USERS. Exige aceite explícito.

# Termos de Uso do Trainvy

## Responsável pelo serviço
O Trainvy é mantido por Luís Felipe Mozer Chiqueto, pessoa física. Contato para privacidade e solicitações sobre o serviço: [lfchiqueto@gmail.com](mailto:lfchiqueto@gmail.com).

## Serviço e responsabilidades
O Trainvy oferece software para registrar, organizar e acompanhar treinos. O profissional responde pela avaliação, habilitação, revisão e prescrição técnica aos seus alunos. A plataforma responde por suas próprias obrigações legais de segurança, informação e prestação do software. Nenhuma cláusula exclui direitos indisponíveis do consumidor ou responsabilidade legal da plataforma.

## Uso autônomo e maioridade
Contas autônomas exigem 18 anos completos. Treinos criados pelo próprio usuário são Diário de Treino Pessoal (Auto-organizado), sem certificação profissional. Não utilize o aplicativo para diagnóstico ou reabilitação. Interrompa exercícios diante de dor aguda, tontura ou desconforto e procure avaliação.

## Profissionais e IA
Informe nome, CPF e CREF/UF verdadeiros e mantenha habilitação ativa. A declaração eletrônica não é verificação oficial. Fraudes podem resultar em suspensão. O profissional deve revisar e aprovar cada versão antes de enviar ao aluno. A IA pode errar; seus resultados são propostas editáveis. Animações 3D são referências ilustrativas.

## Planos e cancelamento
Antes de contratar plano mensal ou anual, confira preço total, periodicidade, limites e condições de renovação apresentados na oferta. Na contratação à distância, o consumidor pode exercer o arrependimento em sete dias corridos, com restituição integral nos termos do art. 49 do CDC. O cancelamento de renovação deve ser acessível pelo mesmo ambiente de contratação. Funcionalidades de cobrança não disponíveis não geram contratação automática.

## Dados e encerramento
Consulte a Política de Privacidade. Você pode revogar vínculos com treinadores, exportar seus dados e solicitar exclusão pelo perfil. Documentos profissionais históricos podem ser conservados no mínimo necessário ao cumprimento de obrigações e exercício regular de direitos. Alterações dos termos geram nova versão e novo aceite.

### politica-de-privacidade · 1.0.0

Audiência: ALL_USERS. Exige aceite explícito.

# Política de Privacidade do Trainvy

## Controlador e contato
O controlador dos dados pessoais é Luís Felipe Mozer Chiqueto, pessoa física responsável pelo Trainvy. Solicitações de acesso, correção, revogação, exportação, exclusão e informações sobre compartilhamentos podem ser enviadas a [lfchiqueto@gmail.com](mailto:lfchiqueto@gmail.com). Não é necessário informar CPF neste contato inicial; eventual confirmação de identidade será limitada ao necessário para proteger o titular.

## Dados e finalidades
Tratamos identidade e sessão para autenticação; CPF e CREF para credenciais profissionais; planos e execuções para registro e acompanhamento. Medidas corporais, restrições e desempenho podem revelar saúde e recebem proteção específica. Não utilizamos esses dados para publicidade comportamental.

## Bases e escolhas
Execução do serviço, obrigações legais e exercício regular de direitos têm finalidades próprias. O tratamento consentido de dados de saúde e seu processamento por IA exigem escolha específica, destacada e inicialmente desmarcada. Aceitar a política não substitui esse consentimento. A revogação impede novos tratamentos dependentes dele e não invalida tratamentos anteriores lícitos.

## Provedores e transferência internacional
Autenticação, hospedagem, banco de dados e IA podem envolver operadores e nuvem no exterior. Google Gemini e eventual OpenAI recebem somente o contexto necessário, com redução de identificadores. Pseudonimização não elimina todos os riscos de reidentificação. Antes da operação, o controlador deve documentar países, operadores e mecanismo válido de transferência conforme LGPD arts. 33 a 36 e Resolução CD/ANPD 19/2024; o aceite desta política não substitui as garantias exigidas.

## Acesso e conservação
Treinadores acessam informações conforme vínculo ativo e permissões do titular. Após revogação, somente snapshots de prescrições próprias permanecem para defesa técnica, sem novos registros de desempenho. Retenção é limitada à finalidade e à base legal. Logs de acesso a aplicações sujeitos ao art. 15 do Marco Civil ficam sob sigilo por seis meses; retenção fiscal segue norma própria. Dados de saúde não têm retenção automática de seis meses por esse artigo.

## Direitos
No perfil, exporte seus dados em JSON, revogue consentimento e vínculos ou solicite exclusão. Também pode requerer confirmação, acesso, correção e informação sobre compartilhamentos. A exclusão remove credenciais e dados desnecessários e restringe resíduos legalmente conservados. Utilize o canal de suporte disponível no aplicativo para outros pedidos, identificação do controlador e esclarecimentos sobre operadores. Segurança envolve controle de acesso, redução de dados, auditoria e revisão de incidentes.

### declaracao-responsabilidade-cref · 1.0.0

Audiência: PROFESSIONAL. Exige aceite explícito.

# Declaração de Habilitação e Responsabilidade Técnica

Declaro que meu nome, CPF e registro CREF/UF informados são verdadeiros, de minha titularidade, ativos e compatíveis com minha atuação. Comprometo-me a manter minha habilitação e informar suspensão ou alteração imediatamente.

Assumo responsabilidade técnica pelas avaliações e prescrições que revisar e aprovar, inclusive sugestões obtidas com IA. Conferirei execução, exercícios, séries, repetições, cargas, contraindicações e individualidade do aluno antes do envio. A identificação profissional ficará registrada no snapshot da prescrição.

O Trainvy fornece software e não dirige minha avaliação técnica. Esta declaração não isenta a plataforma das suas próprias obrigações legais, não elimina direitos do consumidor e não é confirmação oficial do registro pelo conselho. Estou ciente de auditoria e suspensão por inconsistência ou fraude.

Ao marcar o aceite e enviar, assino eletronicamente esta declaração vinculada à versão, data, hora, IP da conexão e navegador registrados.

### termo-saude-parq-lgpd · 1.0.0

Audiência: STUDENT. Exige aceite explícito.

# Prontidão para Atividade Física e Consentimento de Saúde/IA

## Verificação de prontidão simplificada
Antes de treinar, considere: já recebeu orientação médica para limitar atividade? Sente dor no peito, tontura, desmaio ou falta de ar incomum? Possui lesão, condição cardíaca, alteração articular, gestação ou outra restrição que exija avaliação? Se a resposta for sim ou houver dúvida, busque avaliação antes de iniciar ou prosseguir. Este questionário simplificado não é diagnóstico, liberação médica nem certificação de aptidão.

## Ciência
Declaro que li estas perguntas e buscarei avaliação quando indicada. Interromperei o exercício em caso de dor aguda, tontura ou desconforto articular. Sem profissional vinculado, organizo meu próprio diário pessoal. IA pode errar e não substitui profissional habilitado ou médico. Conferirei toda ficha importada antes de salvar.

## Consentimento específico e destacado
Autorizo o Trainvy a tratar medidas físicas, restrições declaradas e histórico de desempenho para organizar e acompanhar meus treinos. Autorizo o processamento necessário dessas informações técnicas por provedores de IA, com redução de identificadores pessoais e observância das garantias de transferência internacional descritas na política. Não autorizo publicidade com meus dados de saúde. Posso revogar esta autorização pelo perfil, impedindo novos tratamentos que dependam dela. Este aceite é separado dos Termos de Uso e da Política de Privacidade.

### diretrizes-ia-seguranca · 1.0.0

Audiência: ALL_USERS. Exige aceite explícito.

# Aviso de Uso de IA

Assistente informativo baseado em IA. Pode cometer erros e não substitui a avaliação presencial de um Profissional de Educação Física ou médico.

O aluno pode organizar dados já fornecidos e consultar descrições do catálogo. Não utilize IA para diagnosticar lesões, reabilitar patologias ou impor cargas máximas. Em caso de dor aguda, tontura ou lesão, interrompa o exercício e procure avaliação profissional.

Sugestões destinadas a alunos por profissional são rascunhos sujeitos à revisão humana explícita da versão. Conferir dados extraídos de PDFs, imagens e textos antes de salvar é obrigatório. Não inclua identificadores, documentos pessoais ou dados de terceiros em mensagens e anexos.

## Fontes oficiais

- [CONFEF 542/2024](https://www.confef.org.br/confefv2/includes/api/resolucoes/imprimir.php?id=627)
- [LGPD atualizada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
- [Enquadramento por atividade efetiva](https://www.planalto.gov.br/ccivil_03/leis/l6839.htm)
- [Resolução ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [Tramitação do PL 2338/2023](https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262)

## Operação

Executar migrations antes do seed. Seed é insert-only e não sobrescreve edições administrativas. Cada edição gera revisão imutável, incrementa patch da versão e exige novo aceite. O Markdown no repositório representa a versão inicial do seed; versões administrativas ficam no banco e podem ser exportadas. Não atribuir revisão biomecânica sem análise profissional efetiva. Não confundir auditoria administrativa com consulta automática do conselho.
