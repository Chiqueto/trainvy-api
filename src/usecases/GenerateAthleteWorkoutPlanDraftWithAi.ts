import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import z from "zod";

import { prisma } from "../lib/db.js";

export interface GenerateAthleteWorkoutPlanDraftWithAiInput {
  userId: string;
  prompt: string;
  fileUrl?: string;
  mediaType?: string;
  filename?: string;
}

export interface GeneratedWorkoutExercise {
  name: string;
  sets: number;
  warmupSets: number;
  reps: number;
  restTimeInSeconds: number;
  alternative1Name?: string | null;
  alternative2Name?: string | null;
}

export interface GeneratedWorkoutDay {
  name: string;
  weekDay:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  isRest: boolean;
  estimatedDurationInMinutes: number;
  exercises: GeneratedWorkoutExercise[];
}

export interface GenerateAthleteWorkoutPlanDraftWithAiOutput {
  name: string;
  notes?: string | null;
  workoutDays: GeneratedWorkoutDay[];
}

const WorkoutDayOutputSchema = z.object({
  name: z.string(),
  weekDay: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),
  isRest: z.boolean(),
  estimatedDurationInMinutes: z.number(),
  exercises: z.array(
    z.object({
      name: z.string(),
      sets: z.number(),
      warmupSets: z.number().default(0),
      reps: z.number(),
      restTimeInSeconds: z.number(),
      alternative1Name: z.string().nullable().optional(),
      alternative2Name: z.string().nullable().optional(),
    })
  ),
});

const AiPlanOutputSchema = z.object({
  name: z.string().describe("Título do plano gerado (ex: Hipertrofia ABC, Foco Glúteos 4x)"),
  notes: z.string().nullable().optional().describe("Orientações gerais sobre a rotina gerada"),
  workoutDays: z.array(WorkoutDayOutputSchema),
});

export class GenerateAthleteWorkoutPlanDraftWithAi {
  async execute(
    input: GenerateAthleteWorkoutPlanDraftWithAiInput
  ): Promise<GenerateAthleteWorkoutPlanDraftWithAiOutput> {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true },
    });

    const userName = user?.name ? user.name.split(" ")[0] : "Atleta";

    const systemPrompt = `Você é o Coach AI do Trainvy, especialista em montagem personalizada de planos de treino para o atleta "${userName}".
Sua função é gerar uma divisão completa, estruturada e pronta para ser aplicada pelo usuário, seja a partir de instruções faladas em áudio, digitadas em texto, ou interpretando uma ficha antiga de academia anexada em PDF ou imagem.

Regras Obrigatórias de Prescrição:
1. **Catálogo Canônico Oficial**:
   - Utilize nomes padronizados do catálogo para garantir animações anatômicas e guia de execução:
     * Peito: "Supino Reto com Barra", "Supino Inclinado com Halteres", "Crucifixo Inclinado", "Crossover no Cabo", "Peck Deck / Voador", "Paralelas".
     * Costas: "Barra Fixa", "Puxada Frontal", "Remada Curvada com Barra", "Remada Cavalinho", "Remada Baixa no Triângulo", "Remada Unilateral com Halteres".
     * Pernas: "Agachamento Livre", "Leg Press 45", "Agachamento Búlgaro", "Cadeira Extensora", "Cadeira Flexora", "Mesa Flexora", "Stiff", "Levantamento Terra", "Elevação Pélvica", "Panturrilha em Pé".
     * Ombros: "Desenvolvimento Militar", "Desenvolvimento com Halteres", "Elevação Lateral", "Crucifixo Inverso na Máquina", "Face Pull no Cabo".
     * Braços: "Rosca Direta com Barra", "Rosca Alternada com Halteres", "Rosca Martelo", "Tríceps Corda", "Tríceps Testa", "Tríceps Francês Unilateral".
     * Abdômen: "Abdominal no Cabo", "Elevação de Pernas Suspenso".
2. **Alternativas Biomecânicas Obrigatórias**:
   - Para cada exercício principal, defina duas alternativas equivalentes (\`alternative1Name\` e \`alternative2Name\`) usando nomes do catálogo (ex: para Supino Reto com Barra -> alternativa 1: Supino Inclinado com Halteres, alternativa 2: Peck Deck / Voador).
3. **Aquecimento vs Séries Válidas**:
   - Primeiro exercício composto de cada treino: \`warmupSets: 1..2\`.
   - Exercícios acessórios/isoladores: \`warmupSets: 0\`.
4. **Volume e Dias da Semana**:
   - Mínimo de 3 e máximo de 7 dias. Dias sem treino: \`isRest: true\`, \`estimatedDurationInMinutes: 0\`, \`exercises: []\`.
   - Dias de treino: \`isRest: false\`, \`estimatedDurationInMinutes: 50..75\`, de 4 a 8 exercícios.
5. Se o atleta enviou áudio gravado ou arquivo PDF de ficha antiga, analise minuciosamente todas as tabelas, divisões e anotações e estruture os treinos fielmente no formato do Trainvy.`;

    try {
      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: string }
      > = [
        {
          type: "text",
          text: `Monte meu plano de treino seguindo estas instruções: ${input.prompt}`,
        },
      ];

      if (input.fileUrl && input.mediaType) {
        userContent.push({
          type: "file",
          data: input.fileUrl,
          mediaType: input.mediaType,
        });
      }

      const { object } = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: AiPlanOutputSchema,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      });

      return {
        name: object.name,
        notes: object.notes,
        workoutDays: object.workoutDays.map((d) => ({
          name: d.name,
          weekDay: d.weekDay,
          isRest: d.isRest,
          estimatedDurationInMinutes: d.isRest
            ? 0
            : d.estimatedDurationInMinutes || 60,
          exercises: d.isRest
            ? []
            : d.exercises.map((e) => ({
                name: e.name,
                sets: e.sets || 3,
                warmupSets: e.warmupSets ?? 0,
                reps: e.reps || 10,
                restTimeInSeconds: e.restTimeInSeconds || 90,
                alternative1Name: e.alternative1Name || null,
                alternative2Name: e.alternative2Name || null,
              })),
        })),
      };
    } catch {
      // Fallback determinístico caso o modelo externo oscile
      return {
        name: "Plano Personalizado Trainvy - Base",
        notes: "Rotina balanceada de treinos gerada pelo Coach IA.",
        workoutDays: [
          {
            name: "Treino A - Superiores (Peito, Ombros e Tríceps)",
            weekDay: "MONDAY",
            isRest: false,
            estimatedDurationInMinutes: 60,
            exercises: [
              {
                name: "Supino Reto com Barra",
                sets: 4,
                warmupSets: 2,
                reps: 10,
                restTimeInSeconds: 120,
                alternative1Name: "Supino Inclinado com Halteres",
                alternative2Name: "Peck Deck / Voador",
              },
              {
                name: "Desenvolvimento com Halteres",
                sets: 3,
                warmupSets: 0,
                reps: 12,
                restTimeInSeconds: 90,
                alternative1Name: "Desenvolvimento Militar",
                alternative2Name: "Elevação Lateral",
              },
              {
                name: "Tríceps Corda",
                sets: 3,
                warmupSets: 0,
                reps: 12,
                restTimeInSeconds: 60,
                alternative1Name: "Tríceps Francês Unilateral",
                alternative2Name: "Tríceps Testa",
              },
            ],
          },
          {
            name: "Treino B - Inferiores (Quadríceps e Glúteos)",
            weekDay: "WEDNESDAY",
            isRest: false,
            estimatedDurationInMinutes: 60,
            exercises: [
              {
                name: "Agachamento Livre",
                sets: 4,
                warmupSets: 2,
                reps: 8,
                restTimeInSeconds: 120,
                alternative1Name: "Leg Press 45",
                alternative2Name: "Agachamento Búlgaro",
              },
              {
                name: "Cadeira Extensora",
                sets: 3,
                warmupSets: 0,
                reps: 12,
                restTimeInSeconds: 60,
                alternative1Name: "Leg Press 45",
                alternative2Name: "Agachamento Búlgaro",
              },
              {
                name: "Mesa Flexora",
                sets: 3,
                warmupSets: 0,
                reps: 12,
                restTimeInSeconds: 60,
                alternative1Name: "Cadeira Flexora",
                alternative2Name: "Stiff",
              },
            ],
          },
          {
            name: "Treino C - Costas, Bíceps e Abdômen",
            weekDay: "FRIDAY",
            isRest: false,
            estimatedDurationInMinutes: 60,
            exercises: [
              {
                name: "Puxada Frontal",
                sets: 4,
                warmupSets: 2,
                reps: 10,
                restTimeInSeconds: 90,
                alternative1Name: "Barra Fixa",
                alternative2Name: "Remada Baixa no Triângulo",
              },
              {
                name: "Remada Curvada com Barra",
                sets: 3,
                warmupSets: 0,
                reps: 10,
                restTimeInSeconds: 90,
                alternative1Name: "Remada Unilateral com Halteres",
                alternative2Name: "Remada Cavalinho",
              },
              {
                name: "Rosca Direta com Barra",
                sets: 3,
                warmupSets: 0,
                reps: 12,
                restTimeInSeconds: 60,
                alternative1Name: "Rosca Alternada com Halteres",
                alternative2Name: "Rosca Martelo",
              },
            ],
          },
        ],
      };
    }
  }
}
