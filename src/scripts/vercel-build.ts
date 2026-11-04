import { execSync } from "node:child_process";

/**
 * Script auxiliar para build na Vercel com execução condicional de migrations e seeds.
 *
 * USO NO DASHBOARD DA VERCEL (Opcional):
 * Project Settings -> General -> Build & Development Settings -> Build Command:
 *   npm run vercel:build
 *
 * SEGURANÇA:
 * - Só executa migrations e seeds se VERCEL_ENV === 'production'.
 * - Em ambientes de 'preview' ou locais, apenas compila (prisma generate && tsc)
 *   sem alterar o banco de dados.
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

  const isProduction = process.env.VERCEL_ENV === "production";

  if (isProduction) {
    console.log("[vercel:build] Detectado ambiente de PRODUÇÃO na Vercel ($VERCEL_ENV = production).");
    console.log("[vercel:build] 1/3 Aplicando migrations pendentes com prisma migrate deploy...");
    runCommand("npx prisma migrate deploy");

    console.log("[vercel:build] 2/3 Executando seed comercial idempotente...");
    runCommand("npx tsx src/scripts/commercial-bootstrap.ts");

    console.log("[vercel:build] 3/3 Executando sincronização de mídias idempotente...");
    runCommand("npx tsx src/scripts/seed-exercise-media.ts");
  } else {
    console.log(
      `[vercel:build] Ambiente não é produção ($VERCEL_ENV = ${process.env.VERCEL_ENV ?? "local/preview"}). Pulando migrations e seeds.`
    );
  }

  console.log("[vercel:build] Compilando TypeScript...");
  runCommand("npx tsc --pretty false");

  console.log("[vercel:build] Build finalizado com sucesso!");
}

main();
