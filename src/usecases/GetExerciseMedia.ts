import { ExerciseInstructions } from "../domain/canonical-media-catalog.js";
import {
  getExerciseAnatomy,
  type ExerciseAnatomy,
} from "../domain/exercise-anatomy.js";
import { NotFoundError } from "../errors/index.js";
import { ExerciseMediaType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import {
  AnimationKeySchema,
  type ExerciseDemonstrationInput,
} from "../schemas/exercise-demonstration.js";

export interface GetExerciseMediaInputDto {
  userId: string;
  exerciseId: string;
}

export interface GetExerciseMediaOutputDto {
  demonstration?: ExerciseDemonstrationInput | null;
  biomechanicalReviewStatus?: string;
  safetyDisclaimerMd?: string | null;
  anatomy?: ExerciseAnatomy | null;
  exerciseId: string;
  hasMedia: boolean;
  mediaType: ExerciseMediaType | null;
  startImagePath: string | null;
  endImagePath: string | null;
  motionPath: string | null;
  instructions: ExerciseInstructions | null;
  attributionName: string | null;
  attributionUrl: string | null;
}

export class GetExerciseMedia {
  async execute(
    dto: GetExerciseMediaInputDto,
  ): Promise<GetExerciseMediaOutputDto> {
    const exercise = await prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: {
        muscles: true,
        media: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    // Exercício não existe
    if (!exercise) {
      throw new NotFoundError("Exercise not found");
    }

    // Custom exercises are visible to their owner and the owner's active students.
    // This read permission does not grant any editing rights or catalog discovery.
    if (exercise.ownerUserId !== null && exercise.ownerUserId !== dto.userId) {
      const link = await prisma.coachAthlete.findFirst({
        where: {
          coachId: exercise.ownerUserId,
          athleteId: dto.userId,
          status: "ACTIVE",
          coach: { accountType: "COACH", deletedAt: null },
        },
      });
      if (!link) throw new NotFoundError("Exercise not found");
    }

    const own = await prisma.exerciseDemonstration.findUnique({
      where: {
        exerciseId_ownerUserId: {
          exerciseId: exercise.id,
          ownerUserId: dto.userId,
        },
      },
    });
    const resolved =
      own ??
      (await prisma.exerciseDemonstration.findFirst({
        where: {
          exerciseId: exercise.id,
          ...(exercise.ownerUserId
            ? { ownerUserId: exercise.ownerUserId }
            : {}),
          owner: {
            accountType: "COACH",
            deletedAt: null,
            coachAthletesAsCoach: {
              some: { athleteId: dto.userId, status: "ACTIVE" },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }));
    const demonstration = resolved
      ? {
          youtubeUrl: resolved.youtubeUrl,
          animationKey: AnimationKeySchema.nullable()
            .catch(null)
            .parse(resolved.animationKey),
        }
      : null;

    const activeMedia = exercise.media[0];
    const anatomy = getExerciseAnatomy(
      exercise.anatomyReview,
      exercise.muscles,
    );

    // Caso não possua mídia vinculada ou esteja inativa
    if (!activeMedia) {
      return {
        demonstration,
        exerciseId: exercise.id,
        anatomy,
        biomechanicalReviewStatus: exercise.biomechanicalReviewStatus,
        safetyDisclaimerMd: exercise.safetyDisclaimerMd,
        hasMedia: Boolean(demonstration),
        mediaType: null,
        startImagePath: null,
        endImagePath: null,
        motionPath: null,
        instructions: anatomy?.instructions ?? null,
        attributionName: null,
        attributionUrl: null,
      };
    }

    return {
      demonstration,
      exerciseId: exercise.id,
      anatomy,
      biomechanicalReviewStatus: exercise.biomechanicalReviewStatus,
      safetyDisclaimerMd: exercise.safetyDisclaimerMd,
      hasMedia: true,
      mediaType: activeMedia.mediaType,
      startImagePath: activeMedia.startImagePath,
      endImagePath: activeMedia.endImagePath,
      motionPath: activeMedia.motionPath,
      instructions:
        anatomy?.instructions ??
        (activeMedia.instructions as unknown as ExerciseInstructions),
      attributionName: activeMedia.attributionName,
      attributionUrl: activeMedia.attributionUrl,
    };
  }
}
