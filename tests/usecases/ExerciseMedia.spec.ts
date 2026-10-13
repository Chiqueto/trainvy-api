import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_MEDIA_CATALOG,
  getCanonicalMediaByExerciseId,
} from "../../src/domain/canonical-media-catalog.js";
import { syncCanonicalMedia } from "../../src/domain/canonical-media-sync.js";
import { syncCanonicalGlobalCatalog } from "../../src/domain/catalog-backfill.js";
import { NotFoundError } from "../../src/errors/index.js";
import { prisma } from "../../src/lib/db.js";
import { importRepDbAssets, REPDB_AUTHORIZED_IDS } from "../../src/scripts/import-repdb-assets.js";
import { GetExerciseMedia } from "../../src/usecases/GetExerciseMedia.js";
import { ListExercises } from "../../src/usecases/ListExercises.js";
import {
  cleanupTestUsers,
  createTestUser,
} from "../helpers/test-db.js";

describe("Task 4.X — Exercise Media Foundation (Backend)", () => {
  const testUserIds: string[] = [];
  const getExerciseMedia = new GetExerciseMedia();
  const listExercises = new ListExercises();

  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    // 1. Garantir que os exercícios globais existam
    await syncCanonicalGlobalCatalog();

    // 2. Sincronizar catálogo de mídias canônicas
    await syncCanonicalMedia();

    // 3. Criar usuários de teste
    userA = await createTestUser({ email: `media-user-a-${crypto.randomUUID()}@test.com` });
    userB = await createTestUser({ email: `media-user-b-${crypto.randomUUID()}@test.com` });
    testUserIds.push(userA.id, userB.id);
  });

  afterAll(async () => {
    await cleanupTestUsers(testUserIds);
  });

  describe("1. Mapeamento Canônico & Integridade (Item 4 e Item 18)", () => {
    it("todos os 33 exercícios canônicos estão definidos no CANONICAL_MEDIA_CATALOG", () => {
      expect(CANONICAL_MEDIA_CATALOG.length).toBe(33);

      for (const def of CANONICAL_MEDIA_CATALOG) {
        expect(def.exerciseId).toMatch(
          /^00000000-0000-4000-8000-0000000001(0[1-9]|[1-2][0-9]|3[0-3])$/,
        );
        expect(def.provider).toBe("REPDB");
        expect(def.mediaType).toBe("IMAGE_SEQUENCE");
        expect(def.startImagePath).toContain("/exercise-media/repdb/");
        expect(def.endImagePath).toContain("/exercise-media/repdb/");
        expect(def.attributionName).toBe("Exercise data by RepDB (repdb.co)");
        expect(def.attributionUrl).toBe("https://repdb.co");
        expect(def.instructions.description.length).toBeGreaterThan(10);
        expect(def.instructions.setup.length).toBeGreaterThan(10);
        expect(def.instructions.execution.length).toBeGreaterThan(10);
        expect(def.instructions.tips.length).toBeGreaterThan(10);
      }
    });

    it("exercícios com nomes semelhantes não recebem associação indevida (ex: Supino Reto vs Inclinado vs Búlgaro)", () => {
      const supinoReto = getCanonicalMediaByExerciseId("00000000-0000-4000-8000-000000000101");
      const supinoInclinadoDb = getCanonicalMediaByExerciseId("00000000-0000-4000-8000-000000000103");
      const bulgaro = getCanonicalMediaByExerciseId("00000000-0000-4000-8000-000000000107");

      expect(supinoReto?.providerExerciseId).toBe("bench-press");
      expect(supinoInclinadoDb?.providerExerciseId).toBe("incline-db-press");
      expect(bulgaro?.providerExerciseId).toBe("bulgarian-split-squat");

      expect(supinoReto?.startImagePath).not.toBe(supinoInclinadoDb?.startImagePath);
      expect(supinoReto?.startImagePath).not.toBe(bulgaro?.startImagePath);
    });

    it("sincronização de mídia é idempotente (múltiplas execuções preservam dados)", async () => {
      const firstRun = await syncCanonicalMedia();
      expect(firstRun.synced).toBe(33);
      expect(firstRun.skipped).toBe(0);

      const secondRun = await syncCanonicalMedia();
      expect(secondRun.synced).toBe(33);
      expect(secondRun.skipped).toBe(0);

      const count = await prisma.exerciseMedia.count();
      expect(count).toBeGreaterThanOrEqual(33);
    });
  });

  describe("2. Validação de Segurança & Rejeição de Assets Não Autorizados", () => {
    it("bloqueia path traversal e referências a premium-samples", async () => {
      for (const id of REPDB_AUTHORIZED_IDS) {
        expect(id).not.toContain("..");
        expect(id).not.toContain("/");
        expect(id).not.toContain("\\");
        expect(id).not.toContain("premium");
      }
    });
  });

  describe("3. Autorização e Consulta (GetExerciseMedia)", () => {
    it("permite consultar exercício global com mídia associada (retorna hasMedia: true)", async () => {
      const globalId = "00000000-0000-4000-8000-000000000101"; // Supino Reto com Barra
      const result = await getExerciseMedia.execute({
        userId: userA.id,
        exerciseId: globalId,
      });

      expect(result.hasMedia).toBe(true);
      expect(result.exerciseId).toBe(globalId);
      expect(result.mediaType).toBe("IMAGE_SEQUENCE");
      expect(result.startImagePath).toBe("/exercise-media/repdb/bench-press-start.webp");
      expect(result.endImagePath).toBe("/exercise-media/repdb/bench-press-peak.webp");
      expect(result.instructions?.description).toContain("peitoral maior");
      expect(result.attributionName).toBe("Exercise data by RepDB (repdb.co)");
      expect(result.attributionUrl).toBe("https://repdb.co");
    });

    it("retorna hasMedia: false amigável (sem erro 500) para exercício sem mídia", async () => {
      // Criar exercício customizado sem mídia
      const customExercise = await prisma.exercise.create({
        data: {
          id: crypto.randomUUID(),
          name: "Exercício Sem Mídia Teste",
          ownerUserId: userA.id,
        },
      });

      const result = await getExerciseMedia.execute({
        userId: userA.id,
        exerciseId: customExercise.id,
      });

      expect(result.hasMedia).toBe(false);
      expect(result.exerciseId).toBe(customExercise.id);
      expect(result.mediaType).toBeNull();
      expect(result.startImagePath).toBeNull();
      expect(result.endImagePath).toBeNull();
      expect(result.instructions).toBeNull();
    });

    it("permite que o usuário consulte seu próprio exercício customizado", async () => {
      const customExercise = await prisma.exercise.create({
        data: {
          id: crypto.randomUUID(),
          name: "Meu Exercício Customizado",
          ownerUserId: userA.id,
        },
      });

      const result = await getExerciseMedia.execute({
        userId: userA.id,
        exerciseId: customExercise.id,
      });

      expect(result.exerciseId).toBe(customExercise.id);
      expect(result.hasMedia).toBe(false);
    });

    it("bloqueia consulta a exercício customizado de outro usuário (NotFoundError)", async () => {
      // Exercício pertence ao userB
      const privateExercise = await prisma.exercise.create({
        data: {
          id: crypto.randomUUID(),
          name: "Exercício Privado do User B",
          ownerUserId: userB.id,
        },
      });

      // UserA tenta acessar
      await expect(
        getExerciseMedia.execute({
          userId: userA.id,
          exerciseId: privateExercise.id,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("lança NotFoundError para exercício inexistente", async () => {
      const nonExistentId = crypto.randomUUID();
      await expect(
        getExerciseMedia.execute({
          userId: userA.id,
          exerciseId: nonExistentId,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("4. Consulta Agregada no Seletor (ListExercises)", () => {
    it("ListExercises retorna hasMedia: true para exercícios canônicos com mídia", async () => {
      const exercises = await listExercises.execute({
        userId: userA.id,
        query: "Supino Reto com Barra",
      });

      expect(exercises.length).toBeGreaterThan(0);
      const supino = exercises.find(
        (e) => e.id === "00000000-0000-4000-8000-000000000101",
      );
      expect(supino).toBeDefined();
      expect(supino?.hasMedia).toBe(true);
    });

    it("ListExercises retorna hasMedia: false para exercícios personalizados sem mídia", async () => {
      const customName = `Custom Unico ${crypto.randomUUID().slice(0, 8)}`;
      await prisma.exercise.create({
        data: {
          id: crypto.randomUUID(),
          name: customName,
          ownerUserId: userA.id,
        },
      });

      const exercises = await listExercises.execute({
        userId: userA.id,
        query: customName,
      });

      expect(exercises.length).toBe(1);
      expect(exercises[0].hasMedia).toBe(false);
    });
  });
});
