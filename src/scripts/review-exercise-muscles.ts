import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import {
  CATALOG_REVIEW_VERSION,
  catalogFingerprint,
} from "../domain/exercise-catalog-review.js";
import { getDatabaseUrl, prisma } from "../lib/db.js";
import { ReconcileExerciseMuscles } from "../usecases/ReconcileExerciseMuscles.js";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const target = new URL(getDatabaseUrl());
  const targetKey = createHash("sha256")
    .update(`${target.hostname}:${target.port}${target.pathname}`)
    .digest("hex")
    .slice(0, 16);
  const expectTarget = args.find((a) => a.startsWith("--target="))?.slice(9);
  if (apply && expectTarget !== targetKey)
    throw new Error("Pass the target fingerprint printed by the dry-run");
  const directory = ".tmp/catalog-review";
  await mkdir(directory, { recursive: true });
  const snapshot = await prisma.exercise.findMany({
    where: { ownerUserId: null },
    include: { muscles: true },
    orderBy: { id: "asc" },
  });
  const fingerprint = catalogFingerprint(snapshot);
  const stamp = new Date().toISOString().replace(/:/g, "-");
  const path = `${directory}/${stamp}-before.json`;
  await writeFile(path, JSON.stringify(snapshot, null, 2));
  // Ensure the recoverable snapshot exists before any DB mutation.
  JSON.parse(await readFile(path, "utf8"));
  const report = await new ReconcileExerciseMuscles().execute({
    apply,
    expectedFingerprint: fingerprint,
  });
  const resultPath = `${directory}/${stamp}-result.json`;
  await writeFile(
    resultPath,
    JSON.stringify(
      { reviewVersion: CATALOG_REVIEW_VERSION, targetKey, ...report },
      null,
      2,
    ),
  );
  const { changes, ...summary } = report;
  console.log(
    JSON.stringify(
      {
        reviewVersion: CATALOG_REVIEW_VERSION,
        targetKey,
        ...summary,
        snapshot: path,
        report: resultPath,
        newlyClassified: changes.filter((e) => !e.before.length).length,
        correctedExisting: changes.filter((e) => e.before.length).length,
      },
      null,
      2,
    ),
  );
}
main()
  .catch(() => {
    console.error(
      "Catalog reconciliation failed. Check review coverage, snapshot freshness and database configuration.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
