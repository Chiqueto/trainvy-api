import "dotenv/config";

import { isProtectedCpf, protectCpf } from "../domain/protected-cpf.js";
import { prisma } from "../lib/db.js";

// Repeatable data migration. Compare-and-set prevents overwriting a concurrent
// declaration, and only aggregate counts are ever printed.
try {
  let cursor: string | undefined;
  let protectedCount = 0;
  while (true) {
    const rows = await prisma.professionalRegistration.findMany({
      where: { cpf: { not: null } },
      select: { userId: true, cpf: true },
      orderBy: { userId: "asc" },
      take: 100,
      ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const row of rows) {
      if (!row.cpf || isProtectedCpf(row.cpf)) continue;
      const protectedCpf = await protectCpf(row.cpf);
      const result = await prisma.professionalRegistration.updateMany({
        where: { userId: row.userId, cpf: row.cpf },
        data: { cpf: protectedCpf },
      });
      protectedCount += result.count;
    }
    cursor = rows.at(-1)!.userId;
  }
  const remaining = await prisma.professionalRegistration.findMany({
    where: { cpf: { not: null } },
    select: { cpf: true },
  });
  if (remaining.some((row) => !row.cpf || !isProtectedCpf(row.cpf)))
    throw new Error("Unprotected CPF remains");
  console.log(
    JSON.stringify({
      updated: protectedCount,
      protectedRecords: remaining.length,
      plaintextRemaining: 0,
    }),
  );
} catch {
  console.error(
    "Não foi possível concluir a proteção dos CPFs. Nenhum identificador foi registrado em log.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
