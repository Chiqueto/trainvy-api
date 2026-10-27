import { mkdir, readFile, writeFile } from "node:fs/promises";

import { prisma, getDatabaseUrl } from "../lib/db.js";
import { ExpandGlobalExerciseCatalog } from "../usecases/ExpandGlobalExerciseCatalog.js";

async function main() {
  const apply = process.argv.includes("--apply");
  const target = new URL(getDatabaseUrl());
  if (target.hostname !== "ep-royal-bread-actuzgii-pooler.sa-east-1.aws.neon.tech" || target.pathname !== "/neondb") {
    throw new Error("Unexpected database target");
  }
  const definitions = JSON.parse(await readFile(new URL("../domain/exercise-catalog-expansion.json", import.meta.url), "utf8"));
  await mkdir(".tmp/catalog-expansion", {recursive: true});
  const stamp = new Date().toISOString().replace(/:/g, "-");
  const snapshot = await prisma.exercise.findMany({orderBy: {id: "asc"}});
  await writeFile(`.tmp/catalog-expansion/${stamp}-before.json`, JSON.stringify(snapshot, null, 2));
  const report = await new ExpandGlobalExerciseCatalog().execute(definitions, apply);
  await writeFile(`.tmp/catalog-expansion/${stamp}-result.json`, JSON.stringify(report, null, 2));
  const {additions, ...summary} = report;
  console.log(JSON.stringify({...summary, groups: Object.fromEntries([...new Set(additions.map(d => d.family))].map(f => [f, additions.filter(d => d.family === f).length]))}, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
