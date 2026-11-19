import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { prisma } from "../lib/db.js";
import { createExerciseThumbnailStorage } from "../lib/exercise-thumbnail-storage.js";

async function main() {
  const args = process.argv.slice(2);
  const frontend = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? "../trainvy-frontend",
  );
  const apply = args.includes("--apply");
  const animationPrefix = "--animation=";
  const unknownFlag = args.find(
    (arg) =>
      arg.startsWith("--") &&
      arg !== "--apply" &&
      !arg.startsWith(animationPrefix),
  );
  if (unknownFlag) throw new Error("Unknown argument: " + unknownFlag);

  const registryUrl = pathToFileURL(
    resolve(frontend, "app/_components/exercise-3d/exercises.ts"),
  );
  const { EXERCISE_ANIMATIONS } = (await import(registryUrl.href)) as {
    EXERCISE_ANIMATIONS: Record<string, { id: string }>;
  };
  const requested = new Set(
    args
      .filter((arg) => arg.startsWith(animationPrefix))
      .map((arg) => arg.slice(animationPrefix.length)),
  );
  const registry = Object.entries(EXERCISE_ANIMATIONS);
  const unknown = [...requested].filter(
    (key) => !Object.hasOwn(EXERCISE_ANIMATIONS, key),
  );
  if (unknown.length)
    throw new Error(`Unknown animation keys: ${unknown.join(", ")}`);
  const entries = requested.size
    ? registry.filter(([key]) => requested.has(key))
    : registry;

  const images = await Promise.all(
    entries.map(async ([animation, { id }]) => {
      const image = await readFile(
        resolve(
          frontend,
          "scripts/assets/exercise-thumbnails",
          animation + ".webp",
        ),
      );
      if (
        image.toString("ascii", 0, 4) !== "RIFF" ||
        image.toString("ascii", 8, 12) !== "WEBP"
      )
        throw new Error(`Invalid WebP frame: ${animation}`);
      const digest = createHash("sha256").update(image).digest("hex");
      return {
        id,
        image,
        key: `exercise-thumbnails/${animation}/${digest}.webp`,
      };
    }),
  );

  if (new Set(images.map(({ id }) => id)).size !== images.length)
    throw new Error("Exercise thumbnail registry has duplicate exercise IDs.");

  if (!apply) {
    console.log(
      `${images.length} miniaturas WebP prontas para importar (sem gravações).`,
    );
    return;
  }

  const storage = createExerciseThumbnailStorage();
  if (!storage)
    throw new Error(
      "Configure o bucket e as credenciais S3 no ambiente do backend.",
    );
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: images.map(({ id }) => id) }, ownerUserId: null },
    select: { id: true, thumbnailStorageKey: true, thumbnailUrl: true },
  });
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const missing = images.filter(({ id }) => !byId.has(id)).map(({ id }) => id);
  if (missing.length)
    throw new Error(
      `Exercícios globais ausentes no catálogo: ${missing.join(", ")}`,
    );

  const updates = [];
  for (const { id, key, image } of images) {
    const url = await storage.put(key, image);
    const existing = byId.get(id);
    if (existing?.thumbnailStorageKey === key && existing.thumbnailUrl === url)
      continue;
    updates.push(
      prisma.exercise.update({
        where: { id, ownerUserId: null },
        data: { thumbnailStorageKey: key, thumbnailUrl: url },
      }),
    );
  }
  await prisma.$transaction(updates);
  console.log(
    `${images.length} miniaturas enviadas ao S3 e ${updates.length} registros atualizados no catálogo.`,
  );
}

main()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
