import { execSync } from "node:child_process";

/**
 * Build puramente de compilação. Migrations e seeds usam release:prepare.
 *
 * USO NO DASHBOARD DA VERCEL (Opcional):
 * Project Settings -> General -> Build & Development Settings -> Build Command:
 *   npm run vercel:build
 *
 * SEGURANÇA:
 * - Não altera o banco em nenhum ambiente, inclusive produção.
 */
function runCommand(command: string) {
  console.log(`[vercel:build] Executing: ${command}`);
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    const failure = error as { status?: number | null; signal?: string | null };
    console.error(
      `[vercel:build] Falha no comando "${command}" (exit code: ${failure.status ?? "indisponível"}${failure.signal ? `, signal: ${failure.signal}` : ""}). Veja os diagnósticos acima.`,
    );
    process.exit(failure.status && failure.status > 0 ? failure.status : 1);
  }
}

function main() {
  // CRÍTICO: prisma generate PRECISA rodar antes de qualquer script TypeScript (seeds)
  // pois scripts como commercial-bootstrap e seed-exercise-media importam ../lib/db.js
  // que por sua vez importa ../generated/prisma/client.js gerado por este comando.
  console.log("[vercel:build] Gerando cliente Prisma (prisma generate)...");
  runCommand("npx prisma generate");

  // Build is pure in every environment. Database changes use release:prepare.

  console.log("[vercel:build] Compilando TypeScript...");
  runCommand("npx tsc --pretty false");

  console.log("[vercel:build] Build finalizado com sucesso!");
}

main();
