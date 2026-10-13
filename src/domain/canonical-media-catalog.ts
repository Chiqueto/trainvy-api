export interface ExerciseInstructions {
  description: string;
  setup: string;
  execution: string;
  tips: string;
}

export interface CanonicalMediaDefinition {
  exerciseId: string;
  provider: "REPDB";
  providerExerciseId: string;
  mediaType: "IMAGE_SEQUENCE";
  startImagePath: string;
  endImagePath: string;
  motionPath?: string | null;
  attributionName: string;
  attributionUrl: string;
  instructions: ExerciseInstructions;
}

export const ATTRIBUTION_REPDB = {
  name: "Exercise data by RepDB (repdb.co)",
  url: "https://repdb.co",
} as const;

/**
 * Catálogo Canônico de Mídias e Instruções do Trainvy (Task 4.X).
 * Mapeamento auditado 1-para-1 a partir dos IDs canônicos globais do Trainvy
 * para os assets estáticos verificados do RepDB Free.
 */
export const CANONICAL_MEDIA_CATALOG: readonly CanonicalMediaDefinition[] = [
  // 101 - Supino Reto com Barra
  {
    exerciseId: "00000000-0000-4000-8000-000000000101",
    provider: "REPDB",
    providerExerciseId: "bench-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/bench-press-start.webp",
    endImagePath: "/exercise-media/repdb/bench-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício composto de empurrar para peitoral maior, deltoide anterior e tríceps.",
      setup: "Deite-se no banco com os olhos sob a barra, pés firmes no chão, escápulas retraídas e pegada ligeiramente mais larga que os ombros.",
      execution: "Tire a barra do suporte, desça de forma controlada até o terço inferior do esterno e empurre de volta à posição inicial sem hiperestender os cotovelos.",
      tips: "Mantenha os cotovelos a aproximadamente 45° a 75° do tronco, evitando abri-los totalmente a 90°.",
    },
  },
  // 102 - Supino Reto
  {
    exerciseId: "00000000-0000-4000-8000-000000000102",
    provider: "REPDB",
    providerExerciseId: "bench-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/bench-press-start.webp",
    endImagePath: "/exercise-media/repdb/bench-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício fundamental para desenvolvimento de força e hipertrofia da caixa torácica e tríceps.",
      setup: "Apoie cabeça, tronco e glúteos no banco. Mantenha os pés no chão e escápulas aduzidas.",
      execution: "Desça a carga de maneira cadenciada até o peito e empurre verticalmente até a extensão quase completa dos braços.",
      tips: "Evite quicar o peso contra o peito e mantenha os punhos alinhados com os antebraços.",
    },
  },
  // 103 - Supino Inclinado com Halteres
  {
    exerciseId: "00000000-0000-4000-8000-000000000103",
    provider: "REPDB",
    providerExerciseId: "incline-db-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/incline-db-press-start.webp",
    endImagePath: "/exercise-media/repdb/incline-db-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Supino em banco inclinado com foco no feixe clavicular do peitoral (porção superior).",
      setup: "Ajuste o banco em inclinação de 30° a 45°. Sente-se segurando os halteres nos joelhos e impulsione-os para os ombros ao deitar.",
      execution: "Empurre os halteres para cima convergindo ligeiramente sem tocá-los. Desça controlando até a altura dos ombros sentindo o peitoral alongar.",
      tips: "Evite inclinações excessivas (acima de 45°) para não sobrecarregar demasiadamente os deltoides frontais.",
    },
  },
  // 104 - Supino Inclinado
  {
    exerciseId: "00000000-0000-4000-8000-000000000104",
    provider: "REPDB",
    providerExerciseId: "incline-bench-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/incline-bench-press-start.webp",
    endImagePath: "/exercise-media/repdb/incline-bench-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Variação de supino com barra em banco inclinado para ênfase na porção superior do peitoral.",
      setup: "Deite no banco inclinado, posicione as mãos com abertura ligeiramente superior aos ombros e fixe as escápulas.",
      execution: "Retire a barra do cavalete, conduza a descida até a região clavicular do peito e pressione até a extensão controlada.",
      tips: "Mantenha o abdômen contraído e os glúteos em contato com o assento durante toda a série.",
    },
  },
  // 105 - Agachamento Livre
  {
    exerciseId: "00000000-0000-4000-8000-000000000105",
    provider: "REPDB",
    providerExerciseId: "squat",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/squat-start.webp",
    endImagePath: "/exercise-media/repdb/squat-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Movimento composto dominante de joelho para quadríceps, glúteos e estabilização do core.",
      setup: "Apoie a barra sobre o trapézio (barra alta ou baixa), afaste os pés na largura dos ombros com pontas levemente voltadas para fora.",
      execution: "Inicie flexionando quadris e joelhos simultaneamente, descendo até que a coxa fique ao menos paralela ao solo. Empurre o chão para subir.",
      tips: "Mantenha os joelhos alinhados à ponta dos pés, peito aberto e coluna neutra ao longo de toda a amplitude.",
    },
  },
  // 106 - Agachamento
  {
    exerciseId: "00000000-0000-4000-8000-000000000106",
    provider: "REPDB",
    providerExerciseId: "squat",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/squat-start.webp",
    endImagePath: "/exercise-media/repdb/squat-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Padrão de agachamento padrão para fortalecimento de toda a cadeia inferior.",
      setup: "Postura ereta, pés firmes no chão na largura dos quadris/ombros, olhar à frente.",
      execution: "Desça flexionando quadril e joelho mantendo o tronco estável. Suba estendendo com força controlada.",
      tips: "Não deixe os joelhos colapsarem para dentro (valgo dinâmico) nem tire os calcanhares do piso.",
    },
  },
  // 107 - Agachamento Búlgaro
  {
    exerciseId: "00000000-0000-4000-8000-000000000107",
    provider: "REPDB",
    providerExerciseId: "bulgarian-split-squat",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/bulgarian-split-squat-start.webp",
    endImagePath: "/exercise-media/repdb/bulgarian-split-squat-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Agachamento unilateral búlgaro com pé traseiro elevado para isolamento de quadríceps e glúteos.",
      setup: "Fique em pé de costas para o banco, apoie o peito do pé de trás no banco e dê um passo à frente com a perna de apoio.",
      execution: "Desça verticalmente até que o joelho traseiro quase toque o chão e a coxa dianteira fique paralela ao piso. Suba empurrando pelo calcanhar dianteiro.",
      tips: "Mantenha o tronco levemente inclinado à frente para focar em glúteos ou mais ereto para ênfase em quadríceps.",
    },
  },
  // 108 - Leg Press 45
  {
    exerciseId: "00000000-0000-4000-8000-000000000108",
    provider: "REPDB",
    providerExerciseId: "leg-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/leg-press-start.webp",
    endImagePath: "/exercise-media/repdb/leg-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício multiarticular em máquina inclinada a 45 graus para membros inferiores.",
      setup: "Sente-se no aparelho com a lombar e glúteos firmemente apoiados no encosto. Apoie os pés na plataforma na largura dos ombros.",
      execution: "Destrave a máquina e flexione os joelhos trazendo a plataforma em direção ao tronco até 90°. Empurre a plataforma estendendo as pernas sem travar os joelhos.",
      tips: "Nunca tire a lombar ou a pelve do encosto no ponto mais baixo para proteger a coluna.",
    },
  },
  // 109 - Leg Press Horizontal
  {
    exerciseId: "00000000-0000-4000-8000-000000000109",
    provider: "REPDB",
    providerExerciseId: "horizontal-leg-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/horizontal-leg-press-start.webp",
    endImagePath: "/exercise-media/repdb/horizontal-leg-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Prensa de pernas com trajetória horizontal para quadríceps e glúteos com menor sobrecarga na coluna.",
      setup: "Ajuste o assento para que os joelhos fiquem a cerca de 90° ao sentar. Mantenha os pés paralelos na plataforma.",
      execution: "Empurre a plataforma com os calcanhares e a planta dos pés de maneira suave e controlada. Retorne antes que os pesos toquem a torre.",
      tips: "Mantenha a respiração ritmada e não trave os joelhos em hiperextensão.",
    },
  },
  // 110 - Cadeira Extensora
  {
    exerciseId: "00000000-0000-4000-8000-000000000110",
    provider: "REPDB",
    providerExerciseId: "leg-extension",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/leg-extension-start.webp",
    endImagePath: "/exercise-media/repdb/leg-extension-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício monoarticular isolador para todas as porções do quadríceps.",
      setup: "Ajuste o encosto de modo que o eixo de rotação da máquina coincida com a linha dos seus joelhos. O rolo deve ficar sobre os tornozelos.",
      execution: "Estenda as pernas controladamente até a contração máxima do quadríceps. Segure brevemente e retorne descendo sem bater as placas.",
      tips: "Segure as manoplas laterais para estabilizar a pelve firmemente contra o assento.",
    },
  },
  // 111 - Cadeira Flexora
  {
    exerciseId: "00000000-0000-4000-8000-000000000111",
    provider: "REPDB",
    providerExerciseId: "seated-leg-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/seated-leg-curl-start.webp",
    endImagePath: "/exercise-media/repdb/seated-leg-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício isolador sentado para flexão de joelhos e hipertrofia dos isquiotibiais.",
      setup: "Ajuste o encosto e a trava de coxas para firmar as pernas. O rolo móvel deve ficar atrás dos tendões de Aquiles.",
      execution: "Puxe o rolo flexionando os joelhos para baixo até o pico de contração posterior. Retorne na fase excêntrica de modo controlado.",
      tips: "A trava de coxas deve estar bem ajustada para impedir que as coxas subam durante a flexão.",
    },
  },
  // 112 - Mesa Flexora
  {
    exerciseId: "00000000-0000-4000-8000-000000000112",
    provider: "REPDB",
    providerExerciseId: "leg-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/leg-curl-start.webp",
    endImagePath: "/exercise-media/repdb/leg-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Flexão de joelhos em decúbito ventral (deitado de bruços) com foco em isquiotibiais.",
      setup: "Deite de bruços no banco anatômico. O rolo deve ficar logo acima dos calcanhares e as manoplas firmemente seguradas.",
      execution: "Flexione os joelhos elevando os calcanhares em direção aos glúteos. Retorne controlando o peso sem hiperextender bruscamente.",
      tips: "Evite arquear a lombar ou levantar o quadril do banco durante a contração.",
    },
  },
  // 113 - Stiff
  {
    exerciseId: "00000000-0000-4000-8000-000000000113",
    provider: "REPDB",
    providerExerciseId: "stiff-leg-deadlift",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/stiff-leg-deadlift-start.webp",
    endImagePath: "/exercise-media/repdb/stiff-leg-deadlift-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Padrão de flexão de quadril (hip hinge) para posterior de coxa, glúteo máximo e eretores da espinha.",
      setup: "Pés na largura dos quadris, barra ou halteres à frente das coxas com pegada pronada, joelhos semiflexionados e travados.",
      execution: "Projete o quadril para trás enquanto desce a barra rente às pernas, mantendo as costas retas até sentir forte alongamento nos isquiotibiais. Retorne estendendo o quadril.",
      tips: "Não curve a coluna lombar; o movimento deve acontecer exclusivamente na articulação do quadril.",
    },
  },
  // 114 - Elevação Pélvica
  {
    exerciseId: "00000000-0000-4000-8000-000000000114",
    provider: "REPDB",
    providerExerciseId: "hip-thrust",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/hip-thrust-start.webp",
    endImagePath: "/exercise-media/repdb/hip-thrust-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício de extensão pura de quadril com máxima ativação do glúteo máximo.",
      setup: "Apoie a parte superior das costas em um banco estável. Posicione a barra ou almofada sobre os quadris com pés firmes no chão a 90°.",
      execution: "Empurre a barra para cima estendendo os quadris até o alinhamento de tronco e coxas. Aperte os glúteos no topo por 1 segundo e desça controladamente.",
      tips: "Mantenha o queixo levemente apontado para o peito para evitar hiperlordose lombar no pico de contração.",
    },
  },
  // 115 - Cadeira Abdutora
  {
    exerciseId: "00000000-0000-4000-8000-000000000115",
    provider: "REPDB",
    providerExerciseId: "hip-abduction",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/hip-abduction-start.webp",
    endImagePath: "/exercise-media/repdb/hip-abduction-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Isolamento dos abdutores de quadril, prioritariamente glúteo médio e mínimo.",
      setup: "Sente-se no aparelho com as costas no encosto e apoie a parte externa das pernas/joelhos nos apoios estofados.",
      execution: "Abra as pernas empurrando para fora até a amplitude máxima confortável. Retorne resistindo à carga.",
      tips: "Evite dar trancos com o corpo para mover a placa; mantenha o tronco firme.",
    },
  },
  // 116 - Cadeira Adutora
  {
    exerciseId: "00000000-0000-4000-8000-000000000116",
    provider: "REPDB",
    providerExerciseId: "hip-adduction",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/hip-adduction-start.webp",
    endImagePath: "/exercise-media/repdb/hip-adduction-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício isolador para a musculatura interna das coxas (adutores longo, magno e curto).",
      setup: "Sente-se com as costas alinhadas e apoie a parte interna dos joelhos e pernas nas almofadas do aparelho.",
      execution: "Aproxime as pernas até quase encostar os apoios centrais. Retorne de forma lenta e controlada sentindo o alongamento dos adutores.",
      tips: "Controle especialmente a fase excêntrica para prevenir estiramentos nos tendões adutores.",
    },
  },
  // 117 - Panturrilha em Pé
  {
    exerciseId: "00000000-0000-4000-8000-000000000117",
    provider: "REPDB",
    providerExerciseId: "standing-calf-raise",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/standing-calf-raise-start.webp",
    endImagePath: "/exercise-media/repdb/standing-calf-raise-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Flexão plantar com pernas estendidas para ênfase no gastrocnêmio.",
      setup: "Apoie os ombros nas almofadas da máquina e posicione o terço anterior dos pés na borda da plataforma, pernas quase estendidas.",
      execution: "Desça os calcanhares para o alongamento completo. Eleve-se na ponta dos pés o mais alto possível, sustentando no topo por 1 segundo.",
      tips: "Pause por um instante na transição inferior para dissipar a energia elástica do tendão de Aquiles e recrutar mais fibras.",
    },
  },
  // 118 - Panturrilha Sentado
  {
    exerciseId: "00000000-0000-4000-8000-000000000118",
    provider: "REPDB",
    providerExerciseId: "seated-calf-raise",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/seated-calf-raise-start.webp",
    endImagePath: "/exercise-media/repdb/seated-calf-raise-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Flexão plantar sentado com joelhos a 90° para isolamento do músculo sóleo.",
      setup: "Sente-se no aparelho e ajuste a almofada sobre as coxas, próxima aos joelhos. Apoie a ponta dos pés no suporte.",
      execution: "Destrave a alavanca. Desça os calcanhares para alongar a panturrilha e suba empurrando ao topo da flexão plantar.",
      tips: "Mantenha o movimento cadenciado sem quicar os pesos.",
    },
  },
  // 119 - Puxada Frontal na Máquina
  {
    exerciseId: "00000000-0000-4000-8000-000000000119",
    provider: "REPDB",
    providerExerciseId: "lat-pulldown",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/lat-pulldown-start.webp",
    endImagePath: "/exercise-media/repdb/lat-pulldown-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Padrão vertical de puxada em polia ou máquina para dorsal (grande dorsal) e bíceps.",
      setup: "Ajuste os rolos de coxa para prender as pernas firmemente. Segure a barra com pegada pronada aberta e sente-se.",
      execution: "Inicie o movimento deprimindo as escápulas e puxe a barra até a altura superior do peitoral, conduzindo os cotovelos para baixo. Retorne estendendo os braços controladamente.",
      tips: "Evite inclinar excessivamente o tronco para trás; mantenha leve inclinação natural de cerca de 10° a 15°.",
    },
  },
  // 120 - Puxada Frontal
  {
    exerciseId: "00000000-0000-4000-8000-000000000120",
    provider: "REPDB",
    providerExerciseId: "lat-pulldown",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/lat-pulldown-start.webp",
    endImagePath: "/exercise-media/repdb/lat-pulldown-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Puxada frontal tradicional no pulley alto para largura e densidade de dorsais.",
      setup: "Posicione-se sob a barra com boa pegada pronada e peito estufado.",
      execution: "Traga a barra em direção à clavícula/esterno puxando pelos cotovelos. Suba controlando o peso até o alongamento das costas.",
      tips: "Foque em puxar com as costas e cotovelos, sem sobrecarregar a pegada com os antebraços.",
    },
  },
  // 121 - Remada Curvada com Barra
  {
    exerciseId: "00000000-0000-4000-8000-000000000121",
    provider: "REPDB",
    providerExerciseId: "barbell-row",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/barbell-row-start.webp",
    endImagePath: "/exercise-media/repdb/barbell-row-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício composto de puxada horizontal para espessura da musculatura dorsal, romboides e trapézio.",
      setup: "Pés na largura dos ombros, incline o tronco para frente entre 45° e 60° mantendo a coluna lombar perfeitamente neutra e barra com pegada pronada.",
      execution: "Puxe a barra em direção ao abdômen inferior retraindo as escápulas. Desça os braços mantendo a postura firme sem oscilar o tronco.",
      tips: "Mantenha o core rígido para proteger a região lombar durante toda a execução.",
    },
  },
  // 122 - Remada Curvada
  {
    exerciseId: "00000000-0000-4000-8000-000000000122",
    provider: "REPDB",
    providerExerciseId: "barbell-row",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/barbell-row-start.webp",
    endImagePath: "/exercise-media/repdb/barbell-row-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Remada com tronco inclinado para fortalecimento de toda a musculatura das costas.",
      setup: "Flexione levemente os joelhos e incline o tronco à frente mantendo a curvatura natural da coluna.",
      execution: "Puxe a carga em direção à cintura conduzindo com os cotovelos e feche as escápulas no ponto final.",
      tips: "Não use impulso excessivo do quadril para erguer o peso.",
    },
  },
  // 123 - Desenvolvimento Militar
  {
    exerciseId: "00000000-0000-4000-8000-000000000123",
    provider: "REPDB",
    providerExerciseId: "ohp",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/ohp-start.webp",
    endImagePath: "/exercise-media/repdb/ohp-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Desenvolvimento estrito acima da cabeça (Overhead Press) em pé com barra para deltoides e estabilidade central.",
      setup: "Em pé, pés na largura dos quadris, barra apoiada nas clavículas com mãos ligeiramente mais largas que os ombros e glúteos contraídos.",
      execution: "Empurre a barra verticalmente passando rente ao queixo até a extensão completa acima da cabeça, alinhando a barra com o centro de gravidade.",
      tips: "Evite hiperextender a lombar; mantenha glúteos e abdômen firmemente ativados.",
    },
  },
  // 124 - Desenvolvimento com Halteres
  {
    exerciseId: "00000000-0000-4000-8000-000000000124",
    provider: "REPDB",
    providerExerciseId: "dumbbell-shoulder-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/dumbbell-shoulder-press-start.webp",
    endImagePath: "/exercise-media/repdb/dumbbell-shoulder-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Desenvolvimento sentado com halteres para deltoides anteriores e médios, permitindo liberdade natural de punho.",
      setup: "Sente-se em banco vertical (cerca de 80° a 85°), erga os halteres na altura das orelhas com cotovelos ligeiramente à frente do plano coronal.",
      execution: "Empurre os halteres para cima até quase tocar acima da cabeça. Desça de forma controlada até o nível dos ombros.",
      tips: "Posicione os cotovelos no plano da escápula (ligeiramente apontados à frente) para proteger a articulação do ombro.",
    },
  },
  // 125 - Elevação Lateral
  {
    exerciseId: "00000000-0000-4000-8000-000000000125",
    provider: "REPDB",
    providerExerciseId: "lateral-raise",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/lateral-raise-start.webp",
    endImagePath: "/exercise-media/repdb/lateral-raise-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício isolador por excelência para a cabeça lateral do deltoide, conferindo largura aos ombros.",
      setup: "Em pé, joelhos levemente destravados, segure os halteres ao lado das coxas com cotovelos com microflexão.",
      execution: "Eleve os braços lateralmente até a altura dos ombros, conduzindo o movimento pelos cotovelos. Pause no topo e desça com controle.",
      tips: "Evite encolher os ombros com o trapézio e não ultrapasse significativamente a linha dos ombros.",
    },
  },
  // 126 - Crucifixo Inverso na Máquina
  {
    exerciseId: "00000000-0000-4000-8000-000000000126",
    provider: "REPDB",
    providerExerciseId: "machine-reverse-fly",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/machine-reverse-fly-start.webp",
    endImagePath: "/exercise-media/repdb/machine-reverse-fly-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Isolamento guiado para deltoide posterior, romboides e estabilizadores escapulares.",
      setup: "Ajuste a altura do banco no peck deck para que as manoplas fiquem na linha dos ombros. Apoie o peito firmemente no encosto frontal.",
      execution: "Abra os braços para trás em arco horizontal mantendo os cotovelos ligeiramente flexionados. Retorne controlando até a posição inicial.",
      tips: "Mantenha o foco em empurrar com a parte posterior dos ombros, sem deixar o tronco balançar para trás.",
    },
  },
  // 127 - Rosca Direta com Barra
  {
    exerciseId: "00000000-0000-4000-8000-000000000127",
    provider: "REPDB",
    providerExerciseId: "barbell-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/barbell-curl-start.webp",
    endImagePath: "/exercise-media/repdb/barbell-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício construtor fundamental para bíceps braquial e braquial anterior.",
      setup: "Em pé, segure a barra reta ou W com pegada supinada na largura dos ombros, cotovelos colados junto às costelas.",
      execution: "Flexione os cotovelos erguendo a barra em direção ao peito sem mover os ombros ou balançar o quadril. Desça controlando até a extensão quase total.",
      tips: "Fixe os cotovelos ao lado do corpo; não os projete para frente durante a subida para não transferir carga ao deltoide anterior.",
    },
  },
  // 128 - Rosca Direta
  {
    exerciseId: "00000000-0000-4000-8000-000000000128",
    provider: "REPDB",
    providerExerciseId: "barbell-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/barbell-curl-start.webp",
    endImagePath: "/exercise-media/repdb/barbell-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Flexão de cotovelos em pé para pico de contração e força no bíceps.",
      setup: "Postura reta, abdômen contraído, pegada firme supinada.",
      execution: "Erga a carga contraindo os bíceps e sustente a contração máxima antes de descer de forma ritmada.",
      tips: "Não utilize embalo lombar; controle 100% da velocidade na fase negativa.",
    },
  },
  // 129 - Rosca Martelo
  {
    exerciseId: "00000000-0000-4000-8000-000000000129",
    provider: "REPDB",
    providerExerciseId: "hammer-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/hammer-curl-start.webp",
    endImagePath: "/exercise-media/repdb/hammer-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Variação com pegada neutra para desenvolvimento do braquiorradial e braquial profundo.",
      setup: "Em pé ou sentado, segure os halteres com as palmas voltadas para dentro (pegada neutra).",
      execution: "Flexione os cotovelos subindo os halteres simultaneamente ou alternadamente, mantendo as palmas paralelas o tempo todo.",
      tips: "Excelente para aliviar a tensão nos punhos e construir espessura no antebraço e braço.",
    },
  },
  // 130 - Rosca Scott
  {
    exerciseId: "00000000-0000-4000-8000-000000000130",
    provider: "REPDB",
    providerExerciseId: "preacher-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/preacher-curl-start.webp",
    endImagePath: "/exercise-media/repdb/preacher-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Exercício de bíceps com braços apoiados em banco Scott, eliminando qualquer impulso corporal.",
      setup: "Apoie a parte posterior dos braços e axilas firmemente na bancada inclinada, segurando a barra ou pegadores da máquina.",
      execution: "Flexione os braços puxando a barra em direção à cabeça. Desça de forma lenta e controlada sem hiperextender os cotovelos no final.",
      tips: "Não estique totalmente os braços de maneira abrupta no fundo para proteger a inserção do tendão do bíceps.",
    },
  },
  // 131 - Tríceps Corda
  {
    exerciseId: "00000000-0000-4000-8000-000000000131",
    provider: "REPDB",
    providerExerciseId: "tricep-pushdown",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/tricep-pushdown-start.webp",
    endImagePath: "/exercise-media/repdb/tricep-pushdown-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Extensão de tríceps na polia alta com corda para ênfase na cabeça lateral e longa.",
      setup: "Prenda a corda na polia alta, posicione-se próximo com tronco levemente inclinado à frente e cotovelos fixos ao lado do tronco.",
      execution: "Estenda os cotovelos empurrando a corda para baixo e abrindo as pontas no final do movimento para contração máxima. Retorne até 90° de flexão.",
      tips: "Mantenha os cotovelos imóveis; apenas os antebraços devem se movimentar.",
    },
  },
  // 132 - Tríceps Testa
  {
    exerciseId: "00000000-0000-4000-8000-000000000132",
    provider: "REPDB",
    providerExerciseId: "skull-crusher",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/skull-crusher-start.webp",
    endImagePath: "/exercise-media/repdb/skull-crusher-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Extensão de tríceps deitado (Skull Crusher) com barra ou halteres com grande sobrecarga na cabeça longa do tríceps.",
      setup: "Deite-se no banco reto com a barra estendida acima dos ombros, braços ligeiramente inclinados para trás em relação à vertical.",
      execution: "Flexione apenas os cotovelos descendo a barra controladamente em direção à testa ou topo da cabeça. Estenda os braços de volta à posição inicial.",
      tips: "Evite abrir os cotovelos para os lados; mantenha-os paralelos e estáveis.",
    },
  },
  // 133 - Tríceps Francês Unilateral
  {
    exerciseId: "00000000-0000-4000-8000-000000000133",
    provider: "REPDB",
    providerExerciseId: "single-arm-dumbbell-overhead-tricep-extension",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/single-arm-dumbbell-overhead-tricep-extension-start.webp",
    endImagePath: "/exercise-media/repdb/single-arm-dumbbell-overhead-tricep-extension-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Extensão de cotovelo acima da cabeça unilateral com haltere, promovendo máximo alongamento da cabeça longa do tríceps.",
      setup: "Sentado ou em pé, eleve o haltere verticalmente com um braço próximo à cabeça e cotovelo apontado para o teto.",
      execution: "Flexione o cotovelo descendo o haltere por trás da cabeça até sentir alongamento no tríceps. Estenda o braço de volta ao topo.",
      tips: "Você pode apoiar o outro braço no cotovelo ativo para garantir estabilização da articulação do ombro.",
    },
  },
  // 134 - Paralelas
  {
    exerciseId: "00000000-0000-4000-8000-000000000134",
    provider: "REPDB",
    providerExerciseId: "dips",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/dips-start.webp",
    endImagePath: "/exercise-media/repdb/dips-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Mergulho nas barras paralelas, exercício composto potente para peitoral inferior, tríceps e deltoide anterior.",
      setup: "Segure nas barras paralelas com os braços estendidos e tronco levemente inclinado para frente para enfatizar o peito.",
      execution: "Desça o corpo flexionando os cotovelos até que os braços formem cerca de 90°. Empurre com força de volta à posição inicial.",
      tips: "Evite descer excessivamente para proteger as articulações dos ombros; mantenha o core engajado.",
    },
  },
  // 135 - Crucifixo Inclinado
  {
    exerciseId: "00000000-0000-4000-8000-000000000135",
    provider: "REPDB",
    providerExerciseId: "incline-dumbbell-fly",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/incline-dumbbell-fly-start.webp",
    endImagePath: "/exercise-media/repdb/incline-dumbbell-fly-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Crucifixo no banco inclinado com halteres para isolamento e alongamento da porção clavicular do peitoral.",
      setup: "Deite-se em um banco ajustado a 30°-45° com os halteres acima do peito e cotovelos ligeiramente flexionados.",
      execution: "Abra os braços em arco controlado até sentir um bom alongamento no peitoral. Retorne contraindo o peito no topo.",
      tips: "Mantenha o ângulo dos cotovelos constante durante toda a trajetória; não transforme o exercício em supino.",
    },
  },
  // 136 - Barra Fixa
  {
    exerciseId: "00000000-0000-4000-8000-000000000136",
    provider: "REPDB",
    providerExerciseId: "pull-up",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/pull-up-start.webp",
    endImagePath: "/exercise-media/repdb/pull-up-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Barra fixa pronada (Pull-up), movimento clássico de peso corporal para largura dorsal, romboides e bíceps.",
      setup: "Segure a barra com pegada pronada ligeiramente mais larga que os ombros, corpo suspenso e escápulas ativadas.",
      execution: "Puxe o peito em direção à barra levando os cotovelos para baixo e para trás até o queixo passar da barra. Desça de forma controlada.",
      tips: "Inicie o movimento deprimindo as escápulas antes de flexionar os cotovelos, evitando embalos com as pernas.",
    },
  },
  // 137 - Remada Cavalinho
  {
    exerciseId: "00000000-0000-4000-8000-000000000137",
    provider: "REPDB",
    providerExerciseId: "t-bar-row",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/t-bar-row-start.webp",
    endImagePath: "/exercise-media/repdb/t-bar-row-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Remada em T (Cavalinho) para espessura do meio das costas, latíssimo do dorso e trapézio.",
      setup: "Posicione-se sobre a barra com os pés na largura dos ombros, joelhos semiflexionados e coluna neutra inclinada a 45°.",
      execution: "Puxe a barra em direção ao abdômen inferior retraindo as escápulas e aproximando os cotovelos do tronco. Retorne alongando.",
      tips: "Não use impulso excessivo da lombar para puxar a carga; mantenha o abdômen contraído.",
    },
  },
  // 138 - Remada Unilateral com Halteres
  {
    exerciseId: "00000000-0000-4000-8000-000000000138",
    provider: "REPDB",
    providerExerciseId: "single-arm-db-row",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/single-arm-db-row-start.webp",
    endImagePath: "/exercise-media/repdb/single-arm-db-row-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Remada unilateral com haltere (Serrote), excelente para corrigir assimetrias e recrutar o latíssimo do dorso.",
      setup: "Apoie um joelho e mão no banco plano, mantendo a coluna alinhada paralelamente ao solo e segure o haltere com o outro braço.",
      execution: "Puxe o haltere direcionando o cotovelo para o quadril até a altura do tronco. Retorne controlando até o alongamento completo.",
      tips: "Concentre a tração no cotovelo e nas costas, evitando girar excessivamente o tronco durante a subida.",
    },
  },
  // 139 - Rosca Concentrada
  {
    exerciseId: "00000000-0000-4000-8000-000000000139",
    provider: "REPDB",
    providerExerciseId: "concentration-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/concentration-curl-start.webp",
    endImagePath: "/exercise-media/repdb/concentration-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Rosca concentrada com haltere sentado, exercício isolador para pico e definição do bíceps braquial.",
      setup: "Sentado na ponta do banco, apoie a parte de trás do braço na parte interna da coxa correspondente, braço estendido para baixo.",
      execution: "Flexione o cotovelo elevando o haltere em direção ao ombro sem mover o braço de apoio. Contraia no topo e desça controladamente.",
      tips: "Mantenha o tronco estável sem balanço para isolar puramente a ação flexora do cotovelo.",
    },
  },
  // 140 - Levantamento Terra
  {
    exerciseId: "00000000-0000-4000-8000-000000000140",
    provider: "REPDB",
    providerExerciseId: "deadlift",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/deadlift-start.webp",
    endImagePath: "/exercise-media/repdb/deadlift-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Levantamento terra convencional com barra, exercício fundamental para a cadeia posterior completa e força geral.",
      setup: "Pés na largura do quadril sob a barra, canelas próximas, pegada fora dos joelhos, peito estufado e coluna neutra.",
      execution: "Empurre o chão com os pés estendendo joelhos e quadril em sincronia até ficar totalmente ereto. Retorne conduzindo a descida.",
      tips: "Mantenha a barra colada nas pernas em toda a trajetória para proteger a região lombar.",
    },
  },
  // 141 - Levantamento Terra Sumô
  {
    exerciseId: "00000000-0000-4000-8000-000000000141",
    provider: "REPDB",
    providerExerciseId: "sumo-deadlift",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/sumo-deadlift-start.webp",
    endImagePath: "/exercise-media/repdb/sumo-deadlift-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Levantamento terra em postura sumô, com base aberta enfatizando glúteos, quadríceps e adutores com tronco mais vertical.",
      setup: "Base ampla com pontas dos pés apontadas para fora, canelas tocando a barra e pegada na largura dos ombros por dentro dos joelhos.",
      execution: "Inicie empurrando o chão com os calcanhares e abrindo os joelhos até a extensão completa do quadril. Desça controlando o peso.",
      tips: "Mantenha os joelhos alinhados na direção das pontas dos pés e o tronco o mais ereto possível.",
    },
  },
  // 142 - Agachamento Frontal
  {
    exerciseId: "00000000-0000-4000-8000-000000000142",
    provider: "REPDB",
    providerExerciseId: "front-squat",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/front-squat-start.webp",
    endImagePath: "/exercise-media/repdb/front-squat-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Agachamento com a barra apoiada nos ombros anteriores (Front Squat), com ênfase dominante no quadríceps e postura ereta.",
      setup: "Barra apoiada sobre os deltoides anteriores com cotovelos altos apontados para frente e pés na largura dos ombros.",
      execution: "Flexione os joelhos e quadril descendo verticalmente mantendo os cotovelos altos. Suba empurrando o chão com os calcanhares.",
      tips: "Não deixe os cotovelos caírem para frente, pois isso faz o tronco curvar e sobrecarrega a coluna.",
    },
  },
  // 143 - Remada Alta com Barra
  {
    exerciseId: "00000000-0000-4000-8000-000000000143",
    provider: "REPDB",
    providerExerciseId: "upright-row",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/upright-row-start.webp",
    endImagePath: "/exercise-media/repdb/upright-row-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Remada alta com barra em pé para desenvolvimento do trapézio superior e deltoides laterais.",
      setup: "Em pé com pegada na barra na largura dos ombros (ou ligeiramente mais aberta para conforto articular) e braços estendidos.",
      execution: "Puxe a barra verticalmente rente ao tronco liderando o movimento com os cotovelos até a altura do peito médio. Desça controlando.",
      tips: "Evite puxar a barra até o queixo com pegada muito fechada para preservar o espaço subacromial dos ombros.",
    },
  },
  // 144 - Hiperextensão Lombar
  {
    exerciseId: "00000000-0000-4000-8000-000000000144",
    provider: "REPDB",
    providerExerciseId: "back-extension",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/back-extension-start.webp",
    endImagePath: "/exercise-media/repdb/back-extension-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Extensão de tronco no banco romano ou 45°, fortalecendo eretores da espinha, glúteos e isquiotibiais.",
      setup: "Posicione-se no banco com o apoio logo abaixo do quadril, calcanhares travados e mãos cruzadas no peito.",
      execution: "Flexione o quadril descendo o tronco de forma controlada. Suba estendendo a coluna e quadril até alinhar o corpo.",
      tips: "Evite a hiperextensão forçada no topo; pare quando o corpo formar uma linha reta da cabeça aos pés.",
    },
  },
  // 145 - Leg Press Unilateral
  {
    exerciseId: "00000000-0000-4000-8000-000000000145",
    provider: "REPDB",
    providerExerciseId: "single-leg-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/single-leg-press-start.webp",
    endImagePath: "/exercise-media/repdb/single-leg-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Leg press executado unilateralmente para equilíbrio de força, estabilidade pélvica e recrutamento intenso de quadríceps.",
      setup: "Sente-se no aparelho com as costas firmes no encosto e posicione um pé no centro da plataforma na linha do quadril.",
      execution: "Destrave a carga e flexione o joelho controlando o peso até cerca de 90°. Empurre a plataforma com o calcanhar até quase estender.",
      tips: "Não tire a lombar ou o glúteo do encosto no ponto mais baixo; não trave a articulação do joelho no topo.",
    },
  },
  // 146 - Desenvolvimento Arnold
  {
    exerciseId: "00000000-0000-4000-8000-000000000146",
    provider: "REPDB",
    providerExerciseId: "arnold-press",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/arnold-press-start.webp",
    endImagePath: "/exercise-media/repdb/arnold-press-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Desenvolvimento com halteres com rotação dos punhos, ativando as três cabeças do deltoide em amplitude ampliada.",
      setup: "Sentado no banco com halteres na altura do peito, palmas das mãos voltadas para você e cotovelos próximos ao corpo.",
      execution: "Empurre os halteres para cima rotacionando as palmas para frente à medida que os braços sobem. Reverta a rotação na descida.",
      tips: "Faça a transição de rotação de maneira suave e contínua durante todo o trajeto de subida e descida.",
    },
  },
  // 147 - Face Pull no Cabo
  {
    exerciseId: "00000000-0000-4000-8000-000000000147",
    provider: "REPDB",
    providerExerciseId: "face-pull",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/face-pull-start.webp",
    endImagePath: "/exercise-media/repdb/face-pull-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Puxada com corda na altura do rosto para saúde postural dos ombros, manguito rotador e deltoide posterior.",
      setup: "Ajuste a polia na altura dos olhos com a corda, segure com pegada neutra e dê um passo para trás com postura firme.",
      execution: "Puxe a corda em direção aos olhos separando as mãos e rotacionando os ombros externamente. Segure a contração por 1 segundo e retorne.",
      tips: "Foque em puxar com os cotovelos altos e para trás, sentindo as escápulas retraírem.",
    },
  },
  // 148 - Elevação Lateral no Cabo
  {
    exerciseId: "00000000-0000-4000-8000-000000000148",
    provider: "REPDB",
    providerExerciseId: "cable-lateral-raise",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/cable-lateral-raise-start.webp",
    endImagePath: "/exercise-media/repdb/cable-lateral-raise-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Elevação lateral na polia baixa com tensão constante em toda a amplitude para máxima hipertrofia do deltoide lateral.",
      setup: "Posicione a polia baixa, fique de lado com a mão oposta segurando o pegador em frente ao corpo.",
      execution: "Eleve o braço lateralmente até a altura do ombro mantendo o cotovelo levemente flexionado. Desça de forma controlada.",
      tips: "Evite inclinar o tronco para dar impulso; mantenha o movimento estrito e sob controle.",
    },
  },
  // 149 - Encolhimento com Halteres
  {
    exerciseId: "00000000-0000-4000-8000-000000000149",
    provider: "REPDB",
    providerExerciseId: "db-shrug",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/db-shrug-start.webp",
    endImagePath: "/exercise-media/repdb/db-shrug-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Encolhimento com halteres em pé para foco isolado na porção superior do trapézio.",
      setup: "Em pé com postura ereta, segure os halteres ao lado das coxas com braços estendidos e peito aberto.",
      execution: "Eleve os ombros em direção às orelhas em linha reta vertical. Segure o pico de contração no topo e desça totalmente.",
      tips: "Não role os ombros em círculos; o movimento correto é puramente vertical para evitar desgaste na articulação.",
    },
  },
  // 150 - Abdominal no Cabo
  {
    exerciseId: "00000000-0000-4000-8000-000000000150",
    provider: "REPDB",
    providerExerciseId: "cable-crunch",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/cable-crunch-start.webp",
    endImagePath: "/exercise-media/repdb/cable-crunch-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Abdominal ajoelhado na polia alta com corda (Cable Crunch), permitindo sobrecarga progressiva no reto abdominal.",
      setup: "Ajoelhe-se em frente à polia alta segurando a corda ao lado da cabeça, quadril travado fixo para trás.",
      execution: "Flexione a coluna vertebral levando os cotovelos em direção aos joelhos contraindo fortemente o abdômen. Retorne devagar.",
      tips: "O quadril deve permanecer imóvel; todo o movimento deve vir da flexão da coluna e contração abdominal.",
    },
  },
  // 151 - Elevação de Pernas Suspenso
  {
    exerciseId: "00000000-0000-4000-8000-000000000151",
    provider: "REPDB",
    providerExerciseId: "hanging-leg-raise",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/hanging-leg-raise-start.webp",
    endImagePath: "/exercise-media/repdb/hanging-leg-raise-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Elevação de pernas suspenso na barra fixa para ênfase nos flexores de quadril e porção inferior do abdômen.",
      setup: "Pendure-se na barra com os braços estendidos, pernas retas ou ligeiramente flexionadas e tronco estável.",
      execution: "Eleve as pernas flexionando o quadril e arredondando a pelve em direção ao peito. Retorne sem balançar o corpo.",
      tips: "Concentre-se em retroverter a pelve no final do movimento para contração máxima do abdômen em vez de apenas levantar as coxas.",
    },
  },
  // 152 - Avanço com Halteres
  {
    exerciseId: "00000000-0000-4000-8000-000000000152",
    provider: "REPDB",
    providerExerciseId: "walking-lunge",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/walking-lunge-start.webp",
    endImagePath: "/exercise-media/repdb/walking-lunge-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Passada / Avanço com halteres, exercício funcional dinâmico para quadríceps, glúteos e estabilização de core.",
      setup: "Em pé com postura ereta segurando um haltere em cada mão ao lado do corpo.",
      execution: "Dê um passo à frente flexionando ambos os joelhos até cerca de 90°, mantendo o tronco ereto. Empurre o chão com o pé da frente para dar o próximo passo.",
      tips: "Evite que o joelho da frente colapse para dentro; mantenha o joelho alinhado com o segundo dedo do pé.",
    },
  },
  // 153 - Rosca Spider
  {
    exerciseId: "00000000-0000-4000-8000-000000000153",
    provider: "REPDB",
    providerExerciseId: "spider-curl",
    mediaType: "IMAGE_SEQUENCE",
    startImagePath: "/exercise-media/repdb/spider-curl-start.webp",
    endImagePath: "/exercise-media/repdb/spider-curl-peak.webp",
    attributionName: ATTRIBUTION_REPDB.name,
    attributionUrl: ATTRIBUTION_REPDB.url,
    instructions: {
      description: "Rosca no banco inclinado de bruços (Spider Curl), com braços verticais para isolamento sem auxílio de balanço corporal.",
      setup: "Deite de bruços no banco inclinado a 45° com o peito apoiado no topo e braços estendidos verticalmente para baixo segurando a barra ou halteres.",
      execution: "Flexione os cotovelos elevando a carga em direção aos ombros mantendo os braços perpendiculares ao chão. Retorne controladamente.",
      tips: "Mantenha os cotovelos apontados para o chão sem deixá-los moverem para trás durante a contração.",
    },
  },
] as const;

export const CANONICAL_MEDIA_BY_EXERCISE_ID = new Map<string, CanonicalMediaDefinition>(
  CANONICAL_MEDIA_CATALOG.map((item) => [item.exerciseId, item]),
);

export function getCanonicalMediaByExerciseId(
  exerciseId: string,
): CanonicalMediaDefinition | undefined {
  return CANONICAL_MEDIA_BY_EXERCISE_ID.get(exerciseId);
}
