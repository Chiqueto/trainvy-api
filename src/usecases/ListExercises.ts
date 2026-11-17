import {
  anatomySearchTerms,
  broadMuscleSearchTerms,
  type ExerciseAnatomy,
  getExerciseAnatomy,
} from "../domain/exercise-anatomy.js";
import { RETIRED_GLOBAL_EXERCISES } from "../domain/retired-global-exercises.js";
import { MuscleGroup, MuscleRole, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import {
  AnimationKeySchema,
  type ExerciseDemonstrationInput,
} from "../schemas/exercise-demonstration.js";

interface InputDto {
  userId: string;
  query?: string;
  limit?: number;
  onlyWithHistory?: boolean;
  onlyCustom?: boolean;
  onlyGlobal?: boolean;
  minCompletedAt?: Date;
}

export interface ExerciseOutputDto {
  demonstration?: ExerciseDemonstrationInput | null;
  id: string;
  name: string;
  ownerUserId: string | null;
  isUnilateral: boolean;
  hasMedia: boolean;
  anatomy?: ExerciseAnatomy | null;
  muscles: Array<{
    id: string;
    muscleGroup: MuscleGroup;
    role: MuscleRole;
  }>;
}

export class ListExercises {
  async execute(dto: InputDto): Promise<ExerciseOutputDto[]> {
    // 1. Identifica exercícios que o atleta já realizou em sessões concluídas
    const exercisedSessions = await prisma.sessionExercise.findMany({
      where: {
        workoutSession: {
          athleteId: dto.userId,
          completedAt: dto.minCompletedAt
            ? { not: null, gte: dto.minCompletedAt }
            : { not: null },
        },
        exerciseId: { not: null },
      },
      select: { exerciseId: true },
      distinct: ["exerciseId"],
    });

    const exercisedIds = new Set(
      exercisedSessions
        .map((s) => s.exerciseId)
        .filter((id): id is string => Boolean(id)),
    );

    // 2. Busca exercícios globais e customizados do usuário
    const where: Prisma.ExerciseWhereInput = dto.onlyCustom
      ? { ownerUserId: dto.userId }
      : dto.onlyGlobal
        ? { ownerUserId: null }
        : {
            OR: [{ ownerUserId: null }, { ownerUserId: dto.userId }],
          };

    if (dto.onlyWithHistory) {
      where.id = { in: Array.from(exercisedIds) };
    }

    const exercises = await prisma.exercise.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        isUnilateral: true,
        anatomyReview: true,
        demonstrations: { where: { ownerUserId: dto.userId }, take: 1 },
        media: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
        muscles: {
          select: {
            id: true,
            muscleGroup: true,
            role: true,
          },
          orderBy: [{ role: "asc" }, { muscleGroup: "asc" }],
        },
      },
    });

    // 3. Deduplicação inteligente por nome normalizado:
    // Evita duplicatas visuais (ex: versão global vs custom do mesmo exercício)
    // Dando preferência para a versão que já tem histórico ou à versão personalizada do usuário
    const deduplicatedMap = new Map<string, (typeof exercises)[0]>();

    for (const ex of exercises) {
      if (
        ex.ownerUserId === null &&
        RETIRED_GLOBAL_EXERCISES.has(ex.id) &&
        !dto.onlyWithHistory
      )
        continue;
      const normalizedName = normalizeExerciseSearch(ex.name);
      const existing = deduplicatedMap.get(normalizedName);

      if (!existing) {
        deduplicatedMap.set(normalizedName, ex);
      } else {
        const currentHasHistory = exercisedIds.has(ex.id);
        const existingHasHistory = exercisedIds.has(existing.id);

        if (currentHasHistory && !existingHasHistory) {
          deduplicatedMap.set(normalizedName, ex);
        } else if (
          !existingHasHistory &&
          ex.ownerUserId === dto.userId &&
          existing.ownerUserId === null
        ) {
          deduplicatedMap.set(normalizedName, ex);
        }
      }
    }

    const deduplicatedExercises = Array.from(deduplicatedMap.values());

    const normalizedQuery = normalizeExerciseSearch(dto.query ?? "");
    const matchingExercises = normalizedQuery
      ? deduplicatedExercises
          .filter((exercise) =>
            [
              exercise.name,
              ...anatomySearchTerms(
                getExerciseAnatomy(exercise.anatomyReview, exercise.muscles),
              ),
              ...broadMuscleSearchTerms(exercise.muscles),
            ].some((term) =>
              normalizeExerciseSearch(term).includes(normalizedQuery),
            ),
          )
          .sort((a, b) => {
            const aHasHistory = exercisedIds.has(a.id) ? 0 : 1;
            const bHasHistory = exercisedIds.has(b.id) ? 0 : 1;
            if (aHasHistory !== bHasHistory) return aHasHistory - bHasHistory;

            const aName = normalizeExerciseSearch(a.name);
            const bName = normalizeExerciseSearch(b.name);
            const aRank =
              aName === normalizedQuery
                ? 0
                : aName.startsWith(normalizedQuery)
                  ? 1
                  : 2;
            const bRank =
              bName === normalizedQuery
                ? 0
                : bName.startsWith(normalizedQuery)
                  ? 1
                  : 2;
            return (
              aRank - bRank ||
              aName.localeCompare(bName) ||
              a.id.localeCompare(b.id)
            );
          })
      : deduplicatedExercises.sort((a, b) => {
          const aHasHistory = exercisedIds.has(a.id) ? 0 : 1;
          const bHasHistory = exercisedIds.has(b.id) ? 0 : 1;
          if (aHasHistory !== bHasHistory) return aHasHistory - bHasHistory;
          return a.name.localeCompare(b.name);
        });

    const mappedExercises: ExerciseOutputDto[] = matchingExercises.map(
      (ex) => ({
        id: ex.id,
        demonstration: ex.demonstrations[0]
          ? {
              youtubeUrl: ex.demonstrations[0].youtubeUrl,
              animationKey: AnimationKeySchema.nullable()
                .catch(null)
                .parse(ex.demonstrations[0].animationKey),
            }
          : null,
        name: ex.name,
        ownerUserId: ex.ownerUserId,
        isUnilateral: ex.isUnilateral,
        hasMedia: ex.media.length > 0 || ex.demonstrations.length > 0,
        muscles: ex.muscles,
        anatomy: getExerciseAnatomy(ex.anatomyReview, ex.muscles),
      }),
    );

    return dto.limit === undefined
      ? mappedExercises
      : mappedExercises.slice(0, Math.max(0, dto.limit));
  }
}

function normalizeExerciseSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}
