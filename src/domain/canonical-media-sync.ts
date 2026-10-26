import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { CANONICAL_GLOBAL_CATALOG } from "./canonical-catalog.js";
import { CANONICAL_MEDIA_CATALOG } from "./canonical-media-catalog.js";

export interface CanonicalMediaSyncOptions {
  /** Se true, sobrescreve assets e instruções de registros já existentes. Padrão: false (insert-only). */
  forceUpdate?: boolean;
}

export interface CanonicalMediaSyncReport {
  totalDefined: number;
  synced: number;
  created: number;
  preserved: number;
  skipped: number;
  unmatchedExercises: string[];
}

/**
 * Sincroniza as mídias canônicas verificadas do Trainvy com o banco de dados.
 * Estratégia aditiva e segura:
 * - Insere registros ausentes.
 * - Por padrão (forceUpdate: false), NÃO sobrescreve registros existentes, preservando
 *   desativações manuais (isActive: false) e edições operacionais de instruções.
 */
export async function syncCanonicalMedia(
  client: Prisma.TransactionClient = prisma,
  options?: CanonicalMediaSyncOptions,
): Promise<CanonicalMediaSyncReport> {
  const forceUpdate = options?.forceUpdate ?? false;
  let created = 0;
  let preserved = 0;
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

    // 2. Inicialização aditiva (Insert-only por padrão):
    // Verifica se já existe registro para a chave única [exerciseId, provider, mediaType]
    const existingMedia = await client.exerciseMedia.findUnique({
      where: {
        exerciseId_provider_mediaType: {
          exerciseId: targetExerciseId,
          provider: def.provider,
          mediaType: def.mediaType,
        },
      },
    });

    if (!existingMedia) {
      await client.exerciseMedia.create({
        data: {
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
      });
      created++;
    } else if (forceUpdate) {
      // Atualização explícita forçada, preservando apenas o isActive do registro
      await client.exerciseMedia.update({
        where: { id: existingMedia.id },
        data: {
          providerExerciseId: def.providerExerciseId,
          startImagePath: def.startImagePath,
          endImagePath: def.endImagePath,
          motionPath: def.motionPath ?? null,
          attributionName: def.attributionName,
          attributionUrl: def.attributionUrl,
          instructions: def.instructions as unknown as Prisma.InputJsonValue,
        },
      });
      preserved++;
    } else {
      // Preservado sem sobrescrever edições operacionais
      preserved++;
    }
  }

  return {
    totalDefined: CANONICAL_MEDIA_CATALOG.length,
    synced: created + preserved,
    created,
    preserved,
    skipped,
    unmatchedExercises,
  };
}

export interface CustomMediaSyncReport {
  totalCandidates: number;
  matched: number;
  unmatched: number;
}

/**
 * Propaga mídias do catálogo canônico para exercícios customizados/legados pré-existentes
 * que coincidem pelo nome (case-insensitive) e ainda não possuem mídia cadastrada.
 */
export async function syncCustomExercisesMedia(
  client: Prisma.TransactionClient = prisma,
): Promise<CustomMediaSyncReport> {
  const customExercises = await client.exercise.findMany({
    where: {
      ownerUserId: { not: null },
      media: { none: {} },
    },
    select: { id: true, name: true, ownerUserId: true },
  });

  if (customExercises.length === 0) {
    return {
      totalCandidates: 0,
      matched: 0,
      unmatched: 0,
    };
  }

  const canonicalExercises = await client.exercise.findMany({
    where: {
      ownerUserId: null,
      media: { some: { isActive: true } },
    },
    include: {
      media: { where: { isActive: true }, take: 1 },
    },
  });

  const canonicalByName = new Map<string, (typeof canonicalExercises)[0]>();
  for (const c of canonicalExercises) {
    canonicalByName.set(c.name.trim().toLowerCase(), c);
  }

  let matched = 0;
  let unmatched = 0;

  for (const custom of customExercises) {
    const key = custom.name.trim().toLowerCase();
    const canonical = canonicalByName.get(key);
    if (canonical && canonical.media[0]) {
      const srcMedia = canonical.media[0];
      await client.exerciseMedia.create({
        data: {
          exerciseId: custom.id,
          provider: srcMedia.provider,
          providerExerciseId: srcMedia.providerExerciseId,
          mediaType: srcMedia.mediaType,
          startImagePath: srcMedia.startImagePath,
          endImagePath: srcMedia.endImagePath,
          motionPath: srcMedia.motionPath,
          description: srcMedia.description,
          instructions: srcMedia.instructions ?? undefined,
          attributionName: srcMedia.attributionName,
          attributionUrl: srcMedia.attributionUrl,
          isActive: true,
        },
      });
      matched++;
    } else {
      unmatched++;
    }
  }

  return {
    totalCandidates: customExercises.length,
    matched,
    unmatched,
  };
}
