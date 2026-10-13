import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_PUBLIC_DIR = path.resolve(
  __dirname,
  "../../../bootcamp-treinos-frontend/public/exercise-media/repdb",
);

// Lista verificada e restrita dos IDs do RepDB necessários para o Trainvy
export const REPDB_AUTHORIZED_IDS = [
  "bench-press",
  "incline-db-press",
  "incline-bench-press",
  "squat",
  "bulgarian-split-squat",
  "leg-press",
  "horizontal-leg-press",
  "leg-extension",
  "seated-leg-curl",
  "leg-curl",
  "stiff-leg-deadlift",
  "hip-thrust",
  "hip-abduction",
  "hip-adduction",
  "standing-calf-raise",
  "seated-calf-raise",
  "lat-pulldown",
  "barbell-row",
  "ohp",
  "dumbbell-shoulder-press",
  "lateral-raise",
  "machine-reverse-fly",
  "barbell-curl",
  "hammer-curl",
  "preacher-curl",
  "tricep-pushdown",
  "skull-crusher",
  "single-arm-dumbbell-overhead-tricep-extension",
] as const;

const BASE_RAW_URL =
  "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/images/flat";

export async function importRepDbAssets(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  destinationDir: string;
}> {
  if (!fs.existsSync(FRONTEND_PUBLIC_DIR)) {
    fs.mkdirSync(FRONTEND_PUBLIC_DIR, { recursive: true });
  }

  let totalFiles = 0;
  let totalSizeBytes = 0;

  console.log(`[RepDB Importer] Verificando assets em: ${FRONTEND_PUBLIC_DIR}`);

  for (const id of REPDB_AUTHORIZED_IDS) {
    // Validação estrita: proíbe path traversal e caminhos arbitrários
    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      throw new Error(`Tentativa de path traversal detectada para o ID: ${id}`);
    }
    if (id.includes("premium")) {
      throw new Error(`Assets premium proibidos: ${id}`);
    }

    const poses = ["start", "peak"] as const;
    for (const pose of poses) {
      const fileName = `${id}-${pose}.webp`;
      const localFilePath = path.join(FRONTEND_PUBLIC_DIR, fileName);

      if (fs.existsSync(localFilePath)) {
        const stats = fs.statSync(localFilePath);
        totalFiles++;
        totalSizeBytes += stats.size;
        continue;
      }

      const remoteUrl = `${BASE_RAW_URL}/${fileName}`;
      console.log(`Baixando: ${fileName} de ${remoteUrl}...`);

      const response = await fetch(remoteUrl);
      if (!response.ok) {
        throw new Error(
          `Falha ao baixar asset RepDB ${fileName} (HTTP ${response.status})`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.writeFileSync(localFilePath, buffer);
      totalFiles++;
      totalSizeBytes += buffer.length;
    }
  }

  const totalSizeKb = (totalSizeBytes / 1024).toFixed(1);
  console.log(
    `[RepDB Importer] Sucesso! ${totalFiles} arquivos WebP presentes (${totalSizeKb} KB total).`,
  );

  return {
    totalFiles,
    totalSizeBytes,
    destinationDir: FRONTEND_PUBLIC_DIR,
  };
}

// Execução direta via CLI
if (process.argv[1] && process.argv[1].endsWith("import-repdb-assets.ts")) {
  importRepDbAssets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[RepDB Importer] Erro:", err);
      process.exit(1);
    });
}
