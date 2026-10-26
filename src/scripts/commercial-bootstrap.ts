import { readFile } from "node:fs/promises";

import { prisma } from "../lib/db.js";

async function main() {
  try {
    // Repository-owned SQL, never constructed from external input. One atomic insert-only statement.
    const sql = await readFile(
      new URL("../../prisma/commercial-bootstrap.sql", import.meta.url),
      "utf8",
    );
    await prisma.$executeRawUnsafe(sql);
    console.log(
      "Commercial defaults inserted where absent. Existing plans/entitlements preserved.",
    );
  } catch (error) {
    console.error("[commercial-bootstrap] Erro fatal ao executar bootstrap comercial:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
