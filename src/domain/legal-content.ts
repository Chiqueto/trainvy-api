import { legalIdentity, renderLegalIdentity } from "./legal-identity.js";

// Canonical seed content. Repository Markdown is generated from these same records.
export const complianceItems = [
  [
    "CREF-01",
    "CREF_PROFISSIONAL",
    "Exibição do CREF nas prescrições",
    "OBRIGATORIO_LEI",
    "Lei 9.696/1998; Res. CONFEF 542/2024, art. 7º",
    "Todo plano prescrito por profissional identifica nome completo e CREF 000000-G/UF. O snapshot é preservado na aprovação.",
  ],
  [
    "CREF-02",
    "CREF_PROFISSIONAL",
    "Declaração de habilitação e trava de envio",
    "RECOMENDAVEL_RISCO",
    "Código Civil, arts. 186 e 927; CDC, art. 14; Código Penal, art. 299",
    "Rascunhos e demonstrações não exigem ativação. Convidar, vincular ou enviar prescrições exige CPF válido, CREF/UF e aceite versionado. Declaração não equivale a consulta oficial. Suspensão exige revisão administrativa.",
  ],
  [
    "CREF-03",
    "CREF_PROFISSIONAL",
    "Enquadramento societário de tecnologia SaaS",
    "OBRIGATORIO_LEI",
    "Lei 6.839/1980, art. 1º",
    `O Trainvy é atualmente mantido por ${legalIdentity.LEGAL_ENTITY_NAME}, como ferramenta de software e sem consultoria física direta. O CNAE 6203-1/00 é apenas referência para eventual formalização futura, não um enquadramento já existente. Na constituição de sociedade, o registro em conselho depende da atividade básica e dos serviços efetivamente prestados; o CNAE isolado não garante dispensa. Confirmar o enquadramento aplicável com assessoria especializada.`,
  ],
  [
    "IA-01",
    "IA_PRESCRICAO",
    "Supervisão e aprovação humana",
    "OBRIGATORIO_LEI",
    "Lei 9.696/1998, art. 3º; PL 2338/2023 como referência de governança",
    "Sugestões profissionais são DRAFT_AI e PROFESSIONAL_AI_ASSISTED. Exigem revisão explícita da versão antes de publicar para alunos. O PL 2338/2023 é projeto em tramitação, não fundamento de obrigação legal vigente; a supervisão é controle do produto para atuação profissional regulada.",
  ],
  [
    "IA-02",
    "IA_PRESCRICAO",
    "Guardrails da IA do aluno",
    "OBRIGATORIO_LEI",
    "Lei 9.696/1998; CDC, arts. 6º, I e 14",
    "Diário pessoal auto-organizado. IA organiza dados fornecidos, descreve catálogo e execução. Não diagnostica, não prescreve reabilitação e não impõe cargas máximas. Dor aguda, tontura ou lesão exigem interrupção do exercício e avaliação profissional.",
  ],
  [
    "IA-03",
    "IA_PRESCRICAO",
    "Confirmação de importação OCR",
    "RECOMENDAVEL_RISCO",
    "CDC, art. 14",
    "PDF, imagem ou texto extraído por IA exige prévia editável e confirmação explícita antes de salvar. Conferir séries, repetições e cargas: 10 kg não pode virar 100 kg silenciosamente.",
  ],
  [
    "3D-01",
    "ANIMACOES_3D",
    "Avisos de segurança biomecânica",
    "OBRIGATORIO_LEI",
    "CDC, arts. 8º e 9º",
    "Animações são ilustrativas. Amplitude e postura variam com individualidade biológica. Dor ou desconforto articular exigem interrupção. Cores mostram grupos ilustrativos; não representam EMG ou esforço medido.",
  ],
  [
    "3D-02",
    "ANIMACOES_3D",
    "Revisão técnica cinesiológica",
    "RECOMENDAVEL_RISCO",
    "CDC, art. 14, § 3º, I",
    "Registrar nome e CREF do revisor, data, exercício e nota de segurança. Somente revisão efetivamente realizada permite selo. O registro administrativo não substitui a análise técnica.",
  ],
  [
    "LGPD-01",
    "LGPD_DADOS",
    "Consentimento para saúde e IA",
    "OBRIGATORIO_LEI",
    "LGPD, arts. 5º, II, 8º, 11, I e 18; Marco Civil, art. 15",
    "Consentimento específico e destacado para medidas, restrições e desempenho; aceites separados de termos e privacidade. Conta autônoma restrita a maiores de 18 anos. Revogação, exportação e exclusão disponíveis. Logs de acesso a aplicações têm retenção legal de seis meses; não se confunde com prazo universal dos dados de saúde ou aceites.",
  ],
  [
    "LGPD-02",
    "LGPD_DADOS",
    "Pseudonimização no envio a LLMs",
    "RECOMENDAVEL_RISCO",
    "LGPD, art. 6º, III; Res. CD/ANPD 19/2024",
    "Remover identificadores diretos dos payloads e limitar informações técnicas. Pseudonimização não é anonimização irreversível. Transferências internacionais exigem mecanismo válido dos arts. 33 a 36 da LGPD. O art. 13, § 4º não constitui autorização geral para uso comercial de dados de saúde.",
  ],
  [
    "SAAS-01",
    "COMERCIALIZACAO_SAAS",
    "Arrependimento e cancelamento",
    "OBRIGATORIO_LEI",
    "CDC, art. 49; Decreto 7.962/2013",
    "Na contratação à distância, assegurar arrependimento em sete dias e restituição integral quando aplicável, além de cancelamento claro da renovação. Planos mensais e anuais precisam de preço, periodicidade e condições visíveis. Cobrança automática ainda não está implementada: não declarar reembolso operacional concluído.",
  ],
  [
    "SAAS-02",
    "RESPONSABILIDADE_CIVIL",
    "Seguro de responsabilidade civil e cyber risk",
    "OPCIONAL",
    "Gestão de risco empresarial",
    "Avaliar contratação de E&O/cyber risk após o MVP. Não existe apólice presumida nem transferência automática das responsabilidades legais.",
  ],
].map(([code, module, title, classification, legalBasis, descriptionMd]) => ({
  code,
  module,
  title,
  classification,
  legalBasis,
  descriptionMd,
  implementationStatus: "PENDING",
}));

export const legalDocuments = [
  {
    slug: "termos-de-uso",
    title: "Termos e Condições Gerais de Uso do Trainvy",
    category: "TERMS_OF_USE",
    targetAudience: "ALL_USERS",
    contentMd:
      renderLegalIdentity(`# Termos e Condições Gerais de Uso do Trainvy

**Última atualização:** Versão 1.0.0

Bem-vindo ao **Trainvy**. Estes Termos e Condições Gerais de Uso ("Termos") regulam o acesso e a utilização da plataforma web e demais aplicações do Trainvy ("Plataforma"), disponibilizada por **{{LEGAL_CONTROLLER_NAME}}** ("Trainvy" ou "Nós"), com canal oficial de atendimento e privacidade pelo e-mail **{{LEGAL_CONTACT_EMAIL}}**.

Ao criar uma conta ou utilizar a Plataforma, você ("Usuário", seja na qualidade de "Aluno/Praticante" ou "Profissional de Educação Física") declara ter lido, compreendido e aceitado integralmente estes Termos.

---

## 1. Natureza do Serviço (Software como Serviço — SaaS)
1.1. O Trainvy é uma plataforma exclusivamente tecnológica (Software como Serviço — SaaS) voltada à organização, registro, visualização e gerenciamento de rotinas de treinamento físico.
1.2. **O Trainvy não é uma academia, clínica médica ou consultoria esportiva, e não presta serviços diretos de Educação Física ou Medicina.** Toda prescrição técnica realizada dentro do fluxo profissional da Plataforma é de autoria e responsabilidade exclusiva do Profissional de Educação Física habilitado vinculado ao Aluno.

## 2. Elegibilidade e Maioridade
2.1. O cadastro autônomo na Plataforma é restrito a pessoas físicas maiores de **18 (dezoito) anos** plenamente capazes.
2.2. Menores de 18 anos somente poderão utilizar a Plataforma caso estejam vinculados a um Profissional de Educação Física responsável e mediante autorização expressa de seus pais ou responsáveis legais.

## 3. Perfis de Uso e Responsabilidades

### 3.1. Uso Autônomo pelo Aluno (Diário de Treino Pessoal)
a) O Usuário pode utilizar o Trainvy de forma independente, sem vínculo com um personal trainer, para criar, importar, organizar e registrar seus próprios treinos.
b) Todas as fichas criadas ou importadas diretamente pelo Aluno são classificadas como **"Diário de Treino Pessoal (Auto-organizado)"** e não constituem prescrição, certificação ou validação profissional por parte do Trainvy.
c) O Aluno reconhece que a prática de exercícios físicos envolve riscos inerentes e declara ser o único responsável por avaliar sua aptidão médica, escolher cargas compatíveis com sua condição física e interromper imediatamente o treino em caso de dor aguda, tontura, mal-estar ou desconforto articular.

### 3.2. Uso pelo Profissional de Educação Física
a) Para utilizar as ferramentas de prescrição de treinos e vincular alunos reais na Plataforma, o Profissional deve informar seu Nome Completo, CPF e número de registro ativo no Conselho Regional de Educação Física (**CREF/UF**), além de firmar o Termo de Declaração e Responsabilidade Técnica.
b) Conforme a Resolução CONFEF nº 542/2024, o nome e o número do CREF/UF do Profissional serão exibidos automaticamente nas fichas de treino prescritas aos seus alunos.
c) O Profissional responde de forma exclusiva, civil, ética e penalmente, pela veracidade de suas credenciais, pela anamnese de seus alunos e pela adequação das cargas, volumes e exercícios prescritos. A identificação de número de CREF inválido, suspenso ou pertencente a terceiros acarretará o bloqueio imediato da conta, sem prejuízo das medidas legais cabíveis.

## 4. Recursos de Inteligência Artificial e Animações 3D
4.1. **Copiloto para Profissionais:** As sugestões de treinos, séries e adaptações geradas pela Inteligência Artificial para o Profissional possuem caráter meramente auxiliar (rascunho). Nenhuma sugestão da IA é disponibilizada ao Aluno sem a prévia **revisão e aprovação humana explícita** do Profissional habilitado.
4.2. **Assistente para Alunos:** No fluxo autônomo, o assistente de IA atua estritamente na estruturação de dados informados pelo próprio Usuário, leitura automatizada de fichas (PDF/imagem/texto) e esclarecimento de dúvidas descritivas sobre o catálogo de exercícios. **A IA não realiza diagnósticos clínicos, não prescreve reabilitação de lesões e não substitui um Profissional de Educação Física.**
4.3. **Conferência de Fichas Importadas:** Ao utilizar a ferramenta de importação automática de fichas (via PDF, imagem ou texto), o Usuário compromete-se a revisar e confirmar todos os exercícios, séries, repetições e cargas extraídos antes de salvar o treino.
4.4. **Demonstrações em 3D:** As animações tridimensionais disponíveis no catálogo têm finalidade meramente ilustrativa e demonstrativa do padrão geral do movimento. A amplitude, postura e execução ideais variam conforme a biomecânica individual de cada praticante.

## 5. Assinaturas, Pagamentos e Cancelamento
5.1. O acesso aos recursos pagos do Trainvy ocorre mediante assinatura recorrente (mensal ou anual), cujos preços, limites de uso e condições são exibidos de forma clara antes da contratação.
5.2. **Direito de Arrependimento (Art. 49 do CDC):** O Usuário poderá desistir da assinatura no prazo de até **7 (sete) dias corridos** a contar da data da contratação inicial, solicitando o cancelamento e o reembolso integral (100%) dos valores pagos diretamente pela Plataforma ou canal de suporte.
5.3. **Cancelamento de Renovação:** Após o prazo de 7 dias, o Usuário poderá cancelar a renovação automática da sua assinatura a qualquer momento pelo painel da sua conta, mantendo o acesso aos recursos contratados até o encerramento do ciclo de faturamento vigente.

## 6. Privacidade, Proteção de Dados e Disposições Finais
6.1. O tratamento de dados pessoais e sensíveis observa rigorosamente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD), conforme detalhado em nossa **Política de Privacidade**.
6.2. O Trainvy poderá atualizar estes Termos periodicamente para refletir melhorias no serviço ou alterações legais, notificando o Usuário para novo aceite quando houver mudanças substanciais.
6.3. Fica eleito o foro da comarca de domicílio do Usuário consumidor, no Brasil, para dirimir eventuais controvérsias oriundas destes Termos.`),
  },
  {
    slug: "politica-de-privacidade",
    title: "Política de Privacidade e Proteção de Dados do Trainvy",
    category: "PRIVACY_POLICY",
    targetAudience: "ALL_USERS",
    contentMd:
      renderLegalIdentity(`# Política de Privacidade e Proteção de Dados do Trainvy

**Última atualização:** Versão 1.0.0

Esta Política de Privacidade explica de forma clara e transparente como o **Trainvy** coleta, utiliza, armazena e protege os seus dados pessoais e dados sensíveis de saúde, em conformidade com a **Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)** e com o **Marco Civil da Internet (Lei nº 12.965/2014)**.

---

## 1. Identificação do Controlador e Canal de Contato
Para os fins da LGPD, o controlador dos dados pessoais tratados na operação da Plataforma é **{{LEGAL_CONTROLLER_NAME}}**, responsável pelo **Trainvy**.
* **E-mail para solicitações de privacidade e direitos do titular:** {{LEGAL_CONTACT_EMAIL}}
* *Nota sobre a relação Personal ↔ Aluno:* Quando um Profissional de Educação Física utiliza o Trainvy para gerenciar e prescrever treinos aos seus próprios clientes, o Profissional atua como Controlador independente em relação à sua assessoria esportiva, e o Trainvy atua como Operador da infraestrutura tecnológica.

## 2. Dados Coletados e Finalidades
Coletamos apenas os dados estritamente necessários para a prestação dos serviços da Plataforma:
1. **Dados Cadastrais e de Identificação:** Nome completo, e-mail, data de nascimento, senha criptografada e, no caso de Profissionais de Educação Física, CPF e número do registro profissional (CREF/UF). *Finalidade:* Criação da conta, autenticação, prevenção a fraudes e identificação profissional obrigatória nas prescrições.
2. **Dados de Treinamento e Uso:** Fichas de treino, exercícios selecionados, séries, repetições, cargas registradas e arquivos enviados para importação de fichas. *Finalidade:* Entrega das funcionalidades de organização e acompanhamento de treinos.
3. **Dados Pessoais Sensíveis (Relacionados à Saúde e Condição Física):** Medidas corporais, peso, estatura, histórico de desempenho, limitações articulares ou restrições físicas informadas pelo usuário ou em conversas com o assistente de IA. *Finalidade:* Personalização do acompanhamento físico e alertas de segurança. **Jamais utilizamos dados de saúde para fins de publicidade ou perfilamento comercial.**
4. **Registros de Conexão e Auditoria:** Endereço IP, data e hora de acesso e registros de aceite de termos (*clickwrap*). *Finalidade:* Segurança da informação e cumprimento de obrigação legal.

## 3. Bases Legais para o Tratamento (Arts. 7º e 11 da LGPD)
* **Execução de Contrato (Art. 7º, V):** Para viabilizar o uso da Plataforma, gerenciamento de fichas e processamento de assinaturas.
* **Consentimento Específico e Destacado (Art. 11, I):** Para o tratamento de seus dados físicos e de saúde na Plataforma e seu processamento técnico pelas ferramentas de Inteligência Artificial. Você pode revogar esse consentimento a qualquer momento nas configurações do seu perfil.
* **Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II):** Para guarda de registros de acesso à aplicação por 6 (seis) meses (Art. 15 do Marco Civil da Internet) e cumprimento de obrigações fiscais.
* **Exercício Regular de Direitos (Art. 7º, VI e Art. 11, II, 'd'):** Para preservação de logs de aceite e histórico de prescrições assinadas por profissionais para fins de defesa técnica em eventuais processos judiciais ou administrativos.

## 4. Uso de Inteligência Artificial e Transferência Internacional de Dados
4.1. Para oferecer recursos de estruturação de treinos e assistentes inteligentes, o Trainvy utiliza infraestrutura em nuvem e APIs corporativas de Inteligência Artificial (como **Google Gemini API** e **OpenAI API**), cujos servidores podem estar localizados no exterior (como nos Estados Unidos), configurando transferência internacional de dados nos termos do Art. 33 da LGPD e da Resolução CD/ANPD nº 19/2024.
4.2. **Pseudonimização e Minimização de Dados:** Antes de enviar qualquer requisição técnica aos provedores de IA, o Trainvy aplica filtros automatizados de pseudonimização que **removem seus identificadores pessoais diretos** (como nome completo, CPF, e-mail e telefone), enviando apenas o contexto técnico estritamente necessário sobre os exercícios.
4.3. Utilizamos camadas comerciais de API que asseguram contratualmente a confidencialidade das informações e vedam o uso dos seus dados privados para o treinamento de modelos públicos de terceiros.

## 5. Compartilhamento entre Aluno e Profissional e Prazo de Retenção
5.1. Quando você aceita o vínculo com um Profissional de Educação Física no Trainvy, ele passa a ter acesso às suas fichas e evolução de cargas.
5.2. **Revogação de Vínculo:** Você pode desvincular um Profissional do seu perfil a qualquer momento. Após a desvinculação, o Profissional perde imediatamente o acesso à sua evolução futura e aos seus dados atuais, mantendo acesso apenas de leitura ao registro estático (*snapshot*) das fichas que ele próprio prescreveu no passado, exclusivamente para fins de comprovação e defesa técnica profissional.
5.3. Seus dados são mantidos apenas enquanto sua conta estiver ativa. Caso solicite a exclusão da conta, seus dados pessoais e de saúde serão eliminados ou anonimizados, ressalvada a guarda isolada dos registros exigidos por lei (como os 6 meses de logs de conexão do Marco Civil da Internet e documentos fiscais pelo prazo legal).

## 6. Seus Direitos como Titular de Dados (Art. 18 da LGPD)
Diretamente pelo painel do seu perfil no Trainvy ou pelo e-mail **{{LEGAL_CONTACT_EMAIL}}**, você pode a qualquer momento:
* Confirmar a existência de tratamento e acessar seus dados;
* Corrigir dados incompletos, inexatos ou desatualizados;
* **Exportar seus dados** em formato estruturado (JSON/PDF);
* **Revogar vínculos** com treinadores e **revogar seu consentimento** para tratamento de dados de saúde/IA;
* Solicitar a **exclusão definitiva** da sua conta e dos seus dados pessoais.`),
  },
  {
    slug: "declaracao-responsabilidade-cref",
    title: "Declaração de Habilitação e Responsabilidade Técnica",
    category: "CREF_DECLARATION",
    targetAudience: "PROFESSIONAL",
    contentMd: `# Declaração de Habilitação e Responsabilidade Técnica

Declaro que meu nome, CPF e registro CREF/UF informados são verdadeiros, de minha titularidade, ativos e compatíveis com minha atuação. Comprometo-me a manter minha habilitação e informar suspensão ou alteração imediatamente.

Assumo responsabilidade técnica pelas avaliações e prescrições que revisar e aprovar, inclusive sugestões obtidas com IA. Conferirei execução, exercícios, séries, repetições, cargas, contraindicações e individualidade do aluno antes do envio. A identificação profissional ficará registrada no snapshot da prescrição.

O Trainvy fornece software e não dirige minha avaliação técnica. Esta declaração não isenta a plataforma das suas próprias obrigações legais, não elimina direitos do consumidor e não é confirmação oficial do registro pelo conselho. Estou ciente de auditoria e suspensão por inconsistência ou fraude.

Ao marcar o aceite e enviar, assino eletronicamente esta declaração vinculada à versão, data, hora, IP da conexão e navegador registrados.`,
  },
  {
    slug: "termo-saude-parq-lgpd",
    title:
      "Termo de Prontidão para Atividade Física (PAR-Q) e Consentimento de Saúde/IA",
    category: "HEALTH_PARQ_CONSENT",
    targetAudience: "STUDENT",
    contentMd:
      renderLegalIdentity(`# Termo de Prontidão para Atividade Física e Consentimento de Dados de Saúde

**Última atualização:** Versão 1.0.0

Para sua segurança física e para a proteção da sua privacidade, leia atentamente os itens abaixo antes de iniciar o registro dos seus treinos no **Trainvy**.

---

## 1. Verificação Preventiva de Prontidão Física (PAR-Q Simplificado)
Antes de iniciar ou aumentar o nível de qualquer rotina de exercícios físicos, reflita sobre as seguintes questões de saúde:
1. Algum médico já afirmou que você possui um problema cardíaco ou pressão arterial descontrolada e que só deveria realizar atividade física com supervisão clínica?
2. Você sente dores no peito, tonturas, episódios de desmaio ou falta de ar incomum durante o repouso ou durante esforços físicos?
3. Você possui alguma lesão osteomuscular, problema articular ou ósseo (como hérnias, lesões no joelho, ombro ou coluna) que possa ser agravado pela prática de exercícios?
4. Você está gestante ou possui qualquer outra condição clínica que exija acompanhamento especializado?

> **Importante:** Caso a resposta para qualquer uma das perguntas acima seja **SIM**, ou caso você tenha qualquer dúvida sobre seu estado de saúde atual, **procure avaliação médica e orientação presencial de um Profissional de Educação Física antes de realizar qualquer treinamento.**

## 2. Ciência de Uso Seguro e Limites da Plataforma
Ao utilizar o Trainvy, declaro estar ciente de que:
* **Auto-organização (Sem Personal):** Caso eu utilize a plataforma sem vínculo com um Profissional de Educação Física, todas as minhas fichas constituem mero **Diário de Treino Pessoal**, organizado sob minha exclusiva responsabilidade.
* **Sinais de Alerta:** Comprometo-me a interromper imediatamente qualquer exercício caso sinta dor aguda, tontura, mal-estar ou desconforto articular.
* **Limites da Inteligência Artificial e Animações 3D:** O assistente de IA e as animações 3D têm caráter exclusivamente informativo, ilustrativo e organizacional, podendo apresentar imprecisões e jamais substituindo a avaliação presencial de um profissional habilitado. Comprometo-me a conferir todos os dados e cargas de fichas importadas via PDF, imagem ou texto antes de salvá-las.

## 3. Consentimento Específico e Destacado (Art. 11, I da LGPD)
Nos termos do Art. 11, inciso I, da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), **autorizo de forma livre, informada, específica e destacada** que o Trainvy realize o tratamento dos meus dados físicos, medidas corporais, histórico de desempenho e eventuais restrições físicas por mim informadas, incluindo o processamento técnico pseudonimizado (sem envio do meu nome, CPF ou e-mail) pelos provedores de Inteligência Artificial da plataforma, exclusivamente para organizar, adaptar e acompanhar meus treinamentos.

Estou ciente de que meus dados de saúde jamais serão usados para fins publicitários e de que posso revogar este consentimento ou excluir minha conta a qualquer momento nas configurações do meu perfil.`),
  },
  {
    slug: "diretrizes-ia-seguranca",
    title: "Aviso de Uso Consciente de Inteligência Artificial",
    category: "AI_DISCLAIMER",
    targetAudience: "ALL_USERS",
    contentMd:
      renderLegalIdentity(`# Aviso de Uso Consciente de Inteligência Artificial

**Última atualização:** Versão 1.0.0

O **Trainvy** utiliza recursos de Inteligência Artificial para tornar a organização e o gerenciamento de treinos mais ágeis. Para utilizar esses recursos com total segurança, observe as diretrizes abaixo:

1. **Ferramenta Informativa e de Apoio:** O assistente de IA processa dados por meio de modelos probabilísticos. Suas respostas possuem caráter estritamente informativo e organizacional, podendo conter imprecisões técnicas, e **não substituem o julgamento clínico de um médico ou a prescrição de um Profissional de Educação Física**.
2. **Regras para Alunos e Praticantes:**
   * Utilize a IA para organizar seus registros de treino, estruturar fichas que você já possui (via texto, imagem ou PDF) e tirar dúvidas gerais sobre a execução descritiva dos exercícios do catálogo.
   * **Conferência Obrigatória:** Sempre revise as séries, repetições e cargas extraídas automaticamente de PDFs ou fotos antes de confirmar o salvamento da ficha.
   * **Proibição de Uso Clínico:** Não utilize a IA para diagnosticar dores, tratar lesões ou definir cargas máximas de segurança. Diante de qualquer dor aguda ou lesão, interrompa o treino e busque atendimento presencial.
3. **Regras para Profissionais de Educação Física:**
   * No painel profissional, a IA atua exclusivamente como um **copiloto gerador de rascunhos**.
   * Nenhuma sugestão gerada pela IA é enviada diretamente ao aluno: cabe exclusivamente ao Profissional habilitado revisar, editar quando necessário e aprovar formalmente a prescrição final sob sua responsabilidade técnica (CREF).
4. **Privacidade nas Interações:** Nosso sistema remove automaticamente seus dados cadastrais (nome, CPF e e-mail) antes de processar solicitações na IA. Ainda assim, evite digitar dados pessoais sensíveis de terceiros ou números de documentos nas caixas de diálogo abertas do chat.`),
  },
].map((d) => ({
  ...d,
  version: "1.0.0",
  classification: "OBRIGATORIO_LEI",
  requiresClickwrap: true,
  isActive: true,
}));

export const complianceMarkdown = `# Compliance Jurídico Trainvy

Versão inicial: 1.0.0. Referências conferidas em 06/11/2026.
Classificações são a matriz operacional do produto, não certificação de conformidade. Status PENDING/PARTIAL deve refletir evidência operacional, inclusive contratos com operadores, registro societário, retenção, reembolsos e revisão técnica real.

## Matriz jurídica

${complianceItems.map((i) => `### ${i.code} — ${i.title}\n\n**${i.classification}** · ${i.module}\n\nBase: ${i.legalBasis}.\n\n${i.descriptionMd}`).join("\n\n")}

## Documentos legais versionados

${legalDocuments.map((d) => `### ${d.slug} · ${d.version}\n\nAudiência: ${d.targetAudience}. Exige aceite explícito.\n\n${d.contentMd}`).join("\n\n")}

## Fontes oficiais

- [CONFEF 542/2024](https://www.confef.org.br/confefv2/includes/api/resolucoes/imprimir.php?id=627)
- [LGPD atualizada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
- [Enquadramento por atividade efetiva](https://www.planalto.gov.br/ccivil_03/leis/l6839.htm)
- [Resolução ANPD 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [Tramitação do PL 2338/2023](https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262)

## Operação

Executar migrations antes do seed. Seed é insert-only por padrão e não sobrescreve edições administrativas. A atualização contratual explícita usa --refresh-legal-content, preserva revisões e aceites anteriores e incrementa a versão dos registros alterados. Cada edição gera revisão imutável, incrementa patch da versão e exige novo aceite. Os corpos contratuais mantêm a redação fornecida (Versão 1.0.0); a versão do registro no banco é incrementada quando há publicação sobre conteúdo existente. O Markdown no repositório representa o conteúdo canônico do seed; versões administrativas ficam no banco e podem ser exportadas. Não atribuir revisão biomecânica sem análise profissional efetiva. Não confundir auditoria administrativa com consulta automática do conselho.
`;
