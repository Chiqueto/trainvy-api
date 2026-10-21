import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
  sessionExerciseId?: string;
}

export interface SessionAiContextOutput {
  sessionId: string;
  sessionName: string;
  origin: string;
  startedAt: string;
  completedAt: string | null;
  exercises: Array<{
    id: string;
    exerciseId: string | null;
    name: string;
    isUnilateral: boolean;
    order: number;
    wasSubstituted: boolean;
    substitutedAt: string | null;
    plannedExerciseName: string | null;
    alternative1Name: string | null;
    alternative2Name: string | null;
    prescription: {
      plannedWarmupSets: number | null;
      plannedWorkingSets: number | null;
      plannedReps: number | null;
      plannedRestTimeInSeconds: number | null;
    };
    loggedSets: Array<{
      order: number;
      type: string;
      weightKg: number | null;
      reps: number | null;
      rir: number | null;
      durationInSeconds: number | null;
      completed: boolean;
    }>;
    recentHistory?: {
      sessionDate: string;
      bestSet: {
        weightKg: number | null;
        reps: number | null;
        rir: number | null;
      } | null;
      workingSetsCount: number;
    } | null;
  }>;
  selectedExerciseId?: string | null;
  previousHistoryAllowed: boolean;
  consentNotice?: string | null;
}

export class GetSessionAiContext {
  async execute(dto: InputDto): Promise<SessionAiContextOutput> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, aiTrainingHistoryAccess: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
      include: {
        sessionExercises: {
          orderBy: { order: "asc" },
          include: {
            exercise: {
              select: { isUnilateral: true },
            },
            sets: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    const hasHistoryConsent = user.aiTrainingHistoryAccess === true;

    const exercises = await Promise.all(
      session.sessionExercises.map(async (ex) => {
        let recentHistory: SessionAiContextOutput["exercises"][0]["recentHistory"] = null;

        if (hasHistoryConsent && ex.exerciseId) {
          // Busca minimizada: no máximo a última sessão concluída onde este exercício foi realizado
          const previousSets = await prisma.workoutSet.findMany({
            where: {
              exerciseId: ex.exerciseId,
              sessionExercise: {
                workoutSession: {
                  athleteId: dto.userId,
                  completedAt: { not: null },
                  id: { not: session.id },
                },
              },
              completedAt: { not: null },
              type: "WORKING",
            },
            orderBy: { completedAt: "desc" },
            take: 10,
            select: {
              weightInGrams: true,
              reps: true,
              rir: true,
              completedAt: true,
            },
          });

          if (previousSets.length > 0) {
            let maxWeightGrams = -1;
            let bestSet: { weightKg: number | null; reps: number | null; rir: number | null } | null = null;

            for (const s of previousSets) {
              const w = s.weightInGrams ?? 0;
              if (w > maxWeightGrams) {
                maxWeightGrams = w;
                bestSet = {
                  weightKg: s.weightInGrams ? s.weightInGrams / 1000 : null,
                  reps: s.reps,
                  rir: s.rir,
                };
              }
            }

            recentHistory = {
              sessionDate: previousSets[0].completedAt?.toISOString().split("T")[0] ?? "",
              bestSet,
              workingSetsCount: previousSets.length,
            };
          }
        }

        return {
          id: ex.id,
          exerciseId: ex.exerciseId,
          name: ex.exerciseNameSnapshot,
          isUnilateral: Boolean(ex.exercise?.isUnilateral),
          order: ex.order,
          wasSubstituted: ex.wasSubstituted,
          substitutedAt: ex.substitutedAt ? ex.substitutedAt.toISOString() : null,
          plannedExerciseName: ex.plannedExerciseNameSnapshot ?? null,
          alternative1Name: ex.alternative1ExerciseNameSnapshot ?? null,
          alternative2Name: ex.alternative2ExerciseNameSnapshot ?? null,
          prescription: {
            plannedWarmupSets: ex.plannedWarmupSets,
            plannedWorkingSets: ex.plannedSets,
            plannedReps: ex.plannedReps,
            plannedRestTimeInSeconds: ex.plannedRestTimeInSeconds,
          },
          loggedSets: ex.sets.map((s) => ({
            order: s.order,
            type: s.type,
            weightKg: s.weightInGrams !== null ? s.weightInGrams / 1000 : null,
            reps: s.reps,
            rir: s.rir,
            durationInSeconds: s.durationInSeconds,
            completed: Boolean(s.completedAt),
          })),
          recentHistory,
        };
      }),
    );

    const sessionName =
      session.workoutDayNameSnapshot ??
      (session.origin === "FREE" ? "Treino Livre" : "Sessão de Treino");

    return {
      sessionId: session.id,
      sessionName,
      origin: session.origin,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
      exercises,
      selectedExerciseId: dto.sessionExerciseId ?? null,
      previousHistoryAllowed: hasHistoryConsent,
      consentNotice: hasHistoryConsent
        ? null
        : "Consentimento de acesso ao histórico de treinos desativado pelo atleta (LGPD). A IA só tem visibilidade da sessão atual.",
    };
  }
}
