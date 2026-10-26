import { syncCanonicalMedia, syncCustomExercisesMedia } from "../domain/canonical-media-sync.js";
import { syncCanonicalGlobalCatalog } from "../domain/catalog-backfill.js";
import { prisma } from "../lib/db.js";

async function main() {
  console.log("[Seed Exercise Media] Iniciando sincronização...");

  // 1. Garantir que os exercícios canônicos globais estejam criados no banco
  console.log("[Seed Exercise Media] Sincronizando catálogo global de exercícios...");
  const catalogResult = await syncCanonicalGlobalCatalog(prisma);
  console.log(
    `[Seed Exercise Media] Catálogo global: ${catalogResult.created} criados, ${catalogResult.existing} existentes.`,
  );

  // 2. Sincronizar as mídias canônicas
  console.log("[Seed Exercise Media] Sincronizando tabela ExerciseMedia...");
  const mediaResult = await syncCanonicalMedia(prisma);
  console.log(
    `[Seed Exercise Media] Mídias: ${mediaResult.synced} sincronizadas de ${mediaResult.totalDefined} definidas (puladas: ${mediaResult.skipped}).`,
  );

  if (mediaResult.unmatchedExercises.length > 0) {
    console.warn(
      `[Seed Exercise Media] Exercícios não encontrados no banco:`,
      mediaResult.unmatchedExercises,
    );
  }

  // 3. Propagar mídias para exercícios customizados/legados pré-existentes
  console.log("[Seed Exercise Media] Sincronizando mídias para exercícios customizados...");
  const customResult = await syncCustomExercisesMedia(prisma);
  console.log(
    `[Seed Exercise Media] Exercícios customizados: ${customResult.matched} vinculados com mídia de ${customResult.totalCandidates} candidatos (sem correspondência: ${customResult.unmatched}).`,
  );

  console.log("[Seed Exercise Media] Concluído com sucesso!");
}

main()
  .catch((err) => {
    console.error("[Seed Exercise Media] Erro ao executar seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
