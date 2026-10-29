import { createHmac, timingSafeEqual } from "node:crypto";

import z from "zod";

import { env } from "../lib/env.js";
import { ExtractedWorkoutSchema } from "../schemas/planning-ai.js";
import { CoachAthleteError } from "./coach-athlete.js";

type Extraction = z.infer<typeof ExtractedWorkoutSchema>;
export function sanitizeExtraction(
  input: Extraction,
  source?: string,
): Extraction {
  const data = ExtractedWorkoutSchema.parse(input);
  const quotes = new Map(
    data.provenance
      .filter((p) => source === undefined || source.includes(p.quote))
      .map((p) => [p.path, p.quote]),
  );
  function walk(value: unknown, path: string): unknown {
    if (Array.isArray(value))
      return value.map((v, i) => walk(v, path ? `${path}.${i}` : String(i)));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          walk(v, path ? `${path}.${k}` : k),
        ]),
      );
    if (value === null) return null;
    const quote = quotes.get(path);
    if (!quote) return null;
    if (
      typeof value === "number" &&
      !new RegExp(`(^|[^0-9])${value}([^0-9]|$)`).test(quote)
    )
      return null;
    const normalized = quote
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    if (path.endsWith("weekDay")) {
      const names: Record<string, string> = {
        MONDAY: "segunda|monday",
        TUESDAY: "terca|tuesday",
        WEDNESDAY: "quarta|wednesday",
        THURSDAY: "quinta|thursday",
        FRIDAY: "sexta|friday",
        SATURDAY: "sabado|saturday",
        SUNDAY: "domingo|sunday",
      };
      if (!new RegExp(`\\b(?:${names[String(value)]})\\b`).test(normalized))
        return null;
    }
    if (
      typeof value === "boolean" &&
      !(value
        ? /\b(?:descanso|rest)\b/.test(normalized)
        : /\b(?:treino|training|workout)\b/.test(normalized) &&
          !/\b(?:descanso|rest)\b/.test(normalized))
    )
      return null;
    if (typeof value === "number") {
      const key = path.split(".").at(-1)!;
      const units: Record<string, RegExp> = {
        sets: new RegExp(
          `(?:\\b${value}\\s*(?:series?|sets?)\\b)|(?:\\b${value}\\s*[x×]\\s*\\d+)|(?:series?\\s*[:=]?\\s*${value}\\b)`,
        ),
        reps: new RegExp(
          `(?:\\b${value}\\s*(?:repeticoes|reps?)\\b)|(?:[x×]\\s*${value}\\b)|(?:reps?\\s*[:=]?\\s*${value}\\b)`,
        ),
        warmupSets: new RegExp(
          `(?:\\b${value}\\s*(?:series? (?:de )?)?aquecimento\\b)|(?:aquecimento\\s*[:=]?\\s*${value}\\b)`,
        ),
        restTimeInSeconds: new RegExp(
          `(?:\\b${value}\\s*(?:s|seg|segundos?)\\b)|(?:descanso\\s*[:=]?\\s*${value}\\b)`,
        ),
        estimatedDurationInSeconds: new RegExp(
          `\\b${value}\\s*(?:s|seg|segundos?)\\b`,
        ),
        targetLoadInGrams: new RegExp(`\\b${value}\\s*(?:g|gramas?)\\b`),
        targetRir: new RegExp(`\\brir\\s*[:=]?\\s*${value}\\b`),
      };
      if (units[key] && !units[key].test(normalized)) return null;
    }
    if (
      typeof value === "string" &&
      !path.endsWith("weekDay") &&
      !quote.toLocaleLowerCase().includes(value.toLocaleLowerCase())
    )
      return null;
    return value;
  }
  const days = walk(
    data.workoutDays,
    "workoutDays",
  ) as Extraction["workoutDays"];
  const paths = new Map<string, string>();
  for (const [i, day] of days.entries()) {
    const kept: typeof day.exercises = [];
    for (const [j, exercise] of day.exercises.entries())
      if (exercise.name) {
        paths.set(
          `workoutDays.${i}.exercises.${j}.`,
          `workoutDays.${i}.exercises.${kept.length}.`,
        );
        kept.push(exercise);
      }
    day.exercises = kept;
  }
  return {
    ...data,
    name: walk(data.name, "name") as string | null,
    workoutDays: days,
    provenance: data.provenance
      .filter((p) => quotes.has(p.path))
      .flatMap((p) => {
        if (!/\.exercises\.\d+\./.test(p.path)) return [p];
        const entry = [...paths].find(([prefix]) => p.path.startsWith(prefix));
        return entry
          ? [{ ...p, path: p.path.replace(entry[0], entry[1]) }]
          : [];
      }),
    questions: [
      ...data.questions.slice(0, 29),
      "Revise todos os dados extraídos e complete manualmente os campos ausentes antes de salvar.",
    ],
  };
}
type Preview = {
  userId: string;
  sourceHash: string;
  sourceType: string;
  extracted: Extraction;
  expiresAt: number;
};
function mac(payload: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update("trainvy.workout-import.v1.")
    .update(payload)
    .digest();
}
export function signImportPreview(data: Omit<Preview, "expiresAt">) {
  const payload = Buffer.from(
    JSON.stringify({ ...data, expiresAt: Date.now() + 30 * 60000 }),
  ).toString("base64url");
  return `${payload}.${mac(payload).toString("base64url")}`;
}
export function verifyImportPreview(token: string, userId: string): Preview {
  try {
    const [payload, signature, ...extra] = token.split(".");
    if (
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "")
    )
      throw new Error();
    const received = Buffer.from(signature ?? "", "base64url");
    if (
      extra.length ||
      received.length !== 32 ||
      received.toString("base64url") !== signature ||
      !timingSafeEqual(received, mac(payload))
    )
      throw new Error();
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as Preview;
    if (data.userId !== userId || data.expiresAt <= Date.now())
      throw new Error();
    ExtractedWorkoutSchema.parse(data.extracted);
    return data;
  } catch {
    throw new CoachAthleteError(
      "INVALID_IMPORT_PREVIEW",
      400,
      "Prévia inválida ou expirada. Importe novamente.",
    );
  }
}
