const origin = process.env.HEALTH_API_URL;
if (!origin) throw new Error("Configure HEALTH_API_URL with the public API origin.");
const base = new URL(origin);
if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") throw new Error("Health checks require HTTPS outside localhost.");
for (const path of ["health/live", "health/ready"]) {
  const response = await fetch(new URL(path, `${base.href.replace(/\/+$/, "")}/`), { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok || (await response.json()).status !== "ok") throw new Error(`Health check failed: ${path} (${response.status})`);
  console.log(`${path}: ok`);
}
