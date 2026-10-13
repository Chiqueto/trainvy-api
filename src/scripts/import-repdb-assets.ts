import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Permite parametrizar o diretório de destino via variável de ambiente, com fallback seguro relativo aos repositórios irmãos
export const FRONTEND_PUBLIC_DIR =
  process.env.FRONTEND_MEDIA_DIR ||
  path.resolve(
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
  "dips",
  "incline-dumbbell-fly",
  "t-bar-row",
  "pull-up",
  "concentration-curl",
  "sumo-deadlift",
  "deadlift",
  "front-squat",
  "upright-row",
  "single-arm-db-row",
  "face-pull",
  "cable-lateral-raise",
  "db-shrug",
  "cable-crunch",
  "hanging-leg-raise",
  "walking-lunge",
  "spider-curl",
  "single-leg-press",
  "arnold-press",
  "back-extension",
] as const;

const BASE_RAW_URL =
  "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/images/flat";

const MIN_WEBP_SIZE_BYTES = 500;
const MAX_WEBP_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Valida se um buffer possui formato WebP íntegro e cabeçalho RIFF/WEBP válido.
 */
export function isValidWebPBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const isRiff = buf.toString("ascii", 0, 4) === "RIFF";
  const isWebp = buf.toString("ascii", 8, 12) === "WEBP";
  return isRiff && isWebp;
}

export async function importRepDbAssets(
  targetDir: string = FRONTEND_PUBLIC_DIR,
): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
  destinationDir: string;
}> {
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (err) {
      throw new Error(
        `Não foi possível criar o diretório de destino de mídia "${targetDir}". Certifique-se de que o repositório frontend está acessível ou defina a variável FRONTEND_MEDIA_DIR. Detalhes: ${err}`,
      );
    }
  }

  let totalFiles = 0;
  let totalSizeBytes = 0;

  console.log(`[RepDB Importer] Verificando assets em: ${targetDir}`);

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
      const localFilePath = path.join(targetDir, fileName);

      // Se o arquivo local já existe, valida sua integridade
      if (fs.existsSync(localFilePath)) {
        try {
          const stats = fs.statSync(localFilePath);
          if (stats.size >= MIN_WEBP_SIZE_BYTES) {
            const fd = fs.openSync(localFilePath, "r");
            const headerBuf = Buffer.alloc(12);
            fs.readSync(fd, headerBuf, 0, 12, 0);
            fs.closeSync(fd);

            if (isValidWebPBuffer(headerBuf)) {
              totalFiles++;
              totalSizeBytes += stats.size;
              continue;
            }
          }
          console.warn(
            `[RepDB Importer] Arquivo local corrompido detectado (${fileName}), baixando novamente...`,
          );
        } catch (readErr) {
          console.warn(`[RepDB Importer] Erro ao validar ${fileName}, baixando novamente...`, readErr);
        }
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

      // Validação estrita de integridade e tamanho
      if (!isValidWebPBuffer(buffer)) {
        throw new Error(`O arquivo baixado ${fileName} não é um formato WebP válido (RIFF/WEBP ausente).`);
      }
      if (buffer.length < MIN_WEBP_SIZE_BYTES || buffer.length > MAX_WEBP_SIZE_BYTES) {
        throw new Error(
          `Tamanho de arquivo fora dos limites aceitáveis para ${fileName}: ${buffer.length} bytes (esperado entre ${MIN_WEBP_SIZE_BYTES} e ${MAX_WEBP_SIZE_BYTES}).`,
        );
      }

      // Escrita atômica: salva em arquivo temporário antes de mover para o destino final
      const tmpFilePath = `${localFilePath}.tmp.${process.pid}.${Date.now()}`;
      try {
        fs.writeFileSync(tmpFilePath, buffer);
        fs.renameSync(tmpFilePath, localFilePath);
      } catch (writeErr) {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
        throw writeErr;
      }

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
    destinationDir: targetDir,
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
