import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { CANONICAL_GLOBAL_CATALOG } from "./canonical-catalog.js";
import { CANONICAL_MEDIA_CATALOG } from "./canonical-media-catalog.js";

export interface CanonicalMediaSyncReport {
  totalDefined: number;
  synced: number;
  skipped: number;
  unmatchedExercises: string[];
}

/**
 * Sincroniza as mídias canônicas verificadas do Trainvy com o banco de dados.
 * Idempotente: atualiza registros existentes sem duplicar ou alterar dados de treino.
 */
export async function syncCanonicalMedia(
  client: Prisma.TransactionClient = prisma,
): Promise<CanonicalMediaSyncReport> {
  let synced = 0;
  let skipped = 0;
  const unmatchedExercises: string[] = [];

  for (const def of CANONICAL_MEDIA_CATALOG) {
    // 1. Validar se o exercício canônico existe no banco (por ID ou por nome canônico global)
    let targetExerciseId = def.exerciseId;
    const exercise = await client.exercise.findUnique({
      where: { id: def.exerciseId },
    });

    if (!exercise) {
      const canonicalDef = CANONICAL_GLOBAL_CATALOG.find((c) => c.id === def.exerciseId);
      const fallbackGlobal = canonicalDef
        ? await client.exercise.findFirst({
            where: {
              ownerUserId: null,
              name: { equals: canonicalDef.name, mode: "insensitive" },
            },
          })
        : null;

      if (fallbackGlobal) {
        targetExerciseId = fallbackGlobal.id;
      } else {
        skipped++;
        unmatchedExercises.push(def.exerciseId);
        continue;
      }
    }

    // 2. Upsert idempotente na tabela ExerciseMedia
    await client.exerciseMedia.upsert({
      where: {
        exerciseId_provider_mediaType: {
          exerciseId: targetExerciseId,
          provider: def.provider,
          mediaType: def.mediaType,
        },
      },
      create: {
        exerciseId: targetExerciseId,
        provider: def.provider,
        providerExerciseId: def.providerExerciseId,
        mediaType: def.mediaType,
        startImagePath: def.startImagePath,
        endImagePath: def.endImagePath,
        motionPath: def.motionPath ?? null,
        attributionName: def.attributionName,
        attributionUrl: def.attributionUrl,
        instructions: def.instructions as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
      update: {
        provider: def.provider,
        providerExerciseId: def.providerExerciseId,
        mediaType: def.mediaType,
        startImagePath: def.startImagePath,
        endImagePath: def.endImagePath,
        motionPath: def.motionPath ?? null,
        attributionName: def.attributionName,
        attributionUrl: def.attributionUrl,
        instructions: def.instructions as unknown as Prisma.InputJsonValue,
        isActive: true,
      },
    });

    synced++;
  }

  return {
    totalDefined: CANONICAL_MEDIA_CATALOG.length,
    synced,
    skipped,
    unmatchedExercises,
  };
}
