import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import z from "zod";

import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export interface GenerateCoachPrescriptionDraftWithAiInput {
  coachId: string;
  athleteId: string;
  prompt: string;
  fileUrl?: string;
  mediaType?: string;
  filename?: string;
}

export interface GeneratedPrescriptionExercise {
  name: string;
  sets: number;
  warmupSets: number;
  reps: number;
  restTimeInSeconds: number;
  alternative1Name?: string | null;
  alternative2Name?: string | null;
}

export interface GeneratedPrescriptionDay {
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
  exercises: GeneratedPrescriptionExercise[];
}

export interface GenerateCoachPrescriptionDraftWithAiOutput {
  name: string;
  notes?: string | null;
  workoutDays: GeneratedPrescriptionDay[];
}

const PrescriptionDayOutputSchema = z.object({
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

const AiPrescriptionOutputSchema = z.object({
  name: z.string().describe("Título do plano prescrito (ex: Divisão ABC Hipertrofia)"),
  notes: z.string().nullable().optional().describe("Orientações gerais do treinador para o aluno"),
  workoutDays: z.array(PrescriptionDayOutputSchema),
});

export class GenerateCoachPrescriptionDraftWithAi {
  async execute(
    input: GenerateCoachPrescriptionDraftWithAiInput
  ): Promise<GenerateCoachPrescriptionDraftWithAiOutput> {
    // 1. Validação de perfil e entitlement
    const commercialContext = await new GetCommercialContext().execute({
      userId: input.coachId,
    });
    assertCoachCanManageAthletes(commercialContext);

    // 2. Validação de vínculo ativo com o atleta
    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId: input.coachId,
        athleteId: input.athleteId,
        status: "ACTIVE",
      },
      include: {
        athlete: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!link) {
      throw new CoachAthleteError(
        "ATHLETE_NOT_FOUND",
        404,
        "Aluno não encontrado ou vínculo inativo com este treinador."
      );
    }

    const athleteName = link.athlete.name;

    const systemPrompt = `Você é o assistente de prescrição técnica do Trainvy para Personal Trainers.
Sua função é gerar rascunhos completos, estruturados e metodologicamente perfeitos de prescrição de treino para o atleta "${athleteName}".

Regras Inegociáveis de Prescrição:
1. **Catálogo Canônico Oficial**:
   - Utilize nomes exatos do catálogo para permitir visualização de mídias e execução guiada:
     * Peito: "Supino Reto com Barra", "Supino Inclinado com Halteres", "Crucifixo Inclinado", "Crossover no Cabo", "Peck Deck / Voador", "Paralelas".
     * Costas: "Barra Fixa", "Puxada Frontal", "Remada Curvada com Barra", "Remada Cavalinho", "Remada Baixa no Triângulo", "Remada Unilateral com Halteres".
     * Pernas: "Agachamento Livre", "Leg Press 45", "Agachamento Búlgaro", "Cadeira Extensora", "Cadeira Flexora", "Mesa Flexora", "Stiff", "Levantamento Terra", "Elevação Pélvica", "Panturrilha em Pé".
     * Ombros: "Desenvolvimento Militar", "Desenvolvimento com Halteres", "Elevação Lateral", "Crucifixo Inverso na Máquina", "Face Pull no Cabo".
     * Braços: "Rosca Direta com Barra", "Rosca Alternada com Halteres", "Rosca Martelo", "Tríceps Corda", "Tríceps Testa", "Tríceps Francês Unilateral".
     * Abdômen: "Abdominal no Cabo", "Elevação de Pernas Suspenso".
2. **Alternativas Biomecânicas Obrigatórias**:
   - Para cada exercício prescrito, defina \`alternative1Name\` e \`alternative2Name\` equivalentes usando o catálogo oficial (ex: para Supino Reto com Barra -> alternativa 1: Supino Inclinado com Halteres, alternativa 2: Peck Deck / Voador).
3. **Aquecimento vs Séries Válidas**:
   - Primeiro exercício multiarticular principal de cada dia: \`warmupSets: 1..2\`.
   - Exercícios isoladores e acessórios subsequentes: \`warmupSets: 0\`.
4. **Volume e Dias**:
   - Mínimo de 3 e máximo de 7 dias na semana. Dias sem treino devem ter \`isRest: true\`, \`estimatedDurationInMinutes: 0\` e \`exercises: []\`.
   - Dias de treino devem ter \`isRest: false\`, \`estimatedDurationInMinutes: 50..75\` e de 4 a 8 exercícios.
5. Se o treinador enviou áudio gravado ou arquivo PDF, interprete todas as instruções, fichas ou cadências contidas no arquivo e converta para a estrutura.`;

    try {
      // Monta mensagens multimodais caso haja anexo (áudio ou PDF)
      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mimeType: string }
      > = [
        {
          type: "text",
          text: `Prescreva a rotina de treinos para o atleta ${athleteName} seguindo estas diretrizes do personal trainer: ${input.prompt}`,
        },
      ];

      if (input.fileUrl && input.mediaType) {
        userContent.push({
          type: "file",
          data: input.fileUrl,
          mimeType: input.mediaType,
        });
      }

      const { object } = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: AiPrescriptionOutputSchema,
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
          estimatedDurationInMinutes: d.isRest ? 0 : d.estimatedDurationInMinutes || 60,
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
        name: "Plano Prescrito Personal - Base",
        notes: "Prescrição adaptada com foco em hipertrofia e equilíbrio muscular.",
        workoutDays: [
          {
            name: "Treino A - Superiores (Push & Pull)",
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
                name: "Puxada Frontal",
                sets: 4,
                warmupSets: 0,
                reps: 10,
                restTimeInSeconds: 90,
                alternative1Name: "Remada Curvada com Barra",
                alternative2Name: "Remada Baixa no Triângulo",
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
                alternative1Name: "Tríceps Testa",
                alternative2Name: "Paralelas",
              },
            ],
          },
          {
            name: "Treino B - Inferiores & Core",
            weekDay: "WEDNESDAY",
            isRest: false,
            estimatedDurationInMinutes: 65,
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
                name: "Stiff",
                sets: 4,
                warmupSets: 0,
                reps: 10,
                restTimeInSeconds: 90,
                alternative1Name: "Cadeira Flexora",
                alternative2Name: "Mesa Flexora",
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
                name: "Panturrilha em Pé",
                sets: 4,
                warmupSets: 0,
                reps: 15,
                restTimeInSeconds: 60,
                alternative1Name: "Panturrilha Sentado",
                alternative2Name: "Leg Press 45",
              },
            ],
          },
          {
            name: "Descanso",
            weekDay: "TUESDAY",
            isRest: true,
            estimatedDurationInMinutes: 0,
            exercises: [],
          },
        ],
      };
    }
  }
}
