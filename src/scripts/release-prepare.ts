import "dotenv/config";

import { execSync } from "node:child_process";

// Explicit operator command; never called by Vercel build or preview deployments.
if (process.env.VERCEL_ENV === "preview")
  throw new Error("Release preparation cannot run in preview.");
if (!process.argv.includes("--confirm-production"))
  throw new Error(
    "Review the target database, passing tests and backup, then run release:prepare -- --confirm-production.",
  );
for (const command of [
  "npx prisma generate",
  "npx tsc --noEmit",
  "npx prisma migrate deploy",
  "npm run commercial:bootstrap",
  "npm run seed:media",
  "npm run seed:compliance",
]) {
  execSync(command, { stdio: "inherit" });
}
