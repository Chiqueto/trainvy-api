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
  execSync(command, { stdio: "inherit" });
}

function main() {
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

  console.log("[vercel:build] Gerando cliente Prisma e compilando TypeScript...");
  runCommand("npx prisma generate");
  runCommand("npx tsc");

  console.log("[vercel:build] Build finalizado com sucesso!");
}

main();
