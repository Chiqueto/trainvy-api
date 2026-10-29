import { describe, expect, it, vi } from "vitest";
import { assertCoachCanPrescribe } from "../../src/domain/coach-prescription.js";
import {
  assertProfessionalVerified,
  effectiveProfessionalStatus,
} from "../../src/domain/professional-verification.js";
import { validateAiUpload } from "../../src/domain/ai-upload.js";
import {
  ORGANIZER_REDIRECT,
  safeOrganizerResponse,
} from "../../src/domain/ai-organizer-policy.js";
import {
  sanitizeExtraction,
  signImportPreview,
  verifyImportPreview,
} from "../../src/domain/workout-import.js";
import { getAiTools, getSessionAiTools } from "../../src/ai/tools.js";
import { RegistrationBody } from "../../src/schemas/professional-verification.js";
import {
  ConfirmWorkoutImportBody,
  ExtractedWorkoutSchema,
} from "../../src/schemas/planning-ai.js";

describe("Professional authorization and untrusted AI data", () => {
  it.each([
    undefined,
    null,
    { status: "PENDING_VERIFICATION", validUntil: null },
    { status: "REJECTED", validUntil: null },
    { status: "SUSPENDED", validUntil: null },
    { status: "EXPIRED", validUntil: null },
    { status: "VERIFIED", validUntil: null },
    { status: "VERIFIED", validUntil: "2020-01-01T00:00:00Z" },
  ])("fails closed for %j", (r) =>
    expect(() => assertProfessionalVerified(r)).toThrow(),
  );
  it("does not accept an athlete with forged professional fields", () =>
    expect(() =>
      assertCoachCanPrescribe({
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date().toISOString(),
        entitlements: [{ key: "ASSIGN_WORKOUTS", limitValue: null }],
        professionalVerification: {
          status: "VERIFIED",
          validUntil: "2099-01-01T00:00:00Z",
        },
      }),
    ).toThrow());
  it("allows only current verification", () => {
    expect(() =>
      assertProfessionalVerified({
        status: "VERIFIED",
        validUntil: "2099-01-01T00:00:00Z",
      }),
    ).not.toThrow();
    expect(
      effectiveProfessionalStatus({
        status: "VERIFIED",
        validUntil: "2020-01-01T00:00:00Z",
      }),
    ).toBe("EXPIRED");
  });
  it("requires CREF and rejects malformed registration", () => {
    expect(
      RegistrationBody.safeParse({
        fullName: "Nome Completo",
        region: "SP",
        category: "Bacharel",
      }).success,
    ).toBe(false);
    expect(
      RegistrationBody.safeParse({
        fullName: "Nome Completo",
        cref: "abc",
        region: "SP",
        category: "Bacharel",
      }).success,
    ).toBe(false);
  });
  it("exposes no student prescription or persistence tools", () => {
    const tools = getAiTools("student");
    for (const name of [
      "proposeWorkoutPlan",
      "createWorkoutPlanDraft",
      "proposePeriodization",
      "createPeriodizationDraft",
      "updateUserTrainData",
      "proposeForgottenWorkoutDraft",
    ])
      expect(tools).not.toHaveProperty(name);
    expect(
      getSessionAiTools("student", { workoutSessionId: "session" }),
    ).not.toHaveProperty("proposeSessionSets");
  });
  it.each([
    "Faça 3 séries de supino para seu objetivo.",
    "Treino A: peito; Treino B: costas",
    "Use 4x12 amanhã.",
  ])("suppresses a prescription: %s", (text) =>
    expect(safeOrganizerResponse(text)).toBe(ORGANIZER_REDIRECT),
  );
  it("keeps general explanations available", () =>
    expect(
      safeOrganizerResponse(
        "A fase excêntrica envolve alongamento do músculo sob tensão.",
      ),
    ).toContain("excêntrica"));
  it.each([
    {
      fileUrl: "https://localhost/private.pdf",
      mediaType: "application/pdf",
      filename: "a.pdf",
    },
    {
      fileUrl:
        "data:application/pdf;base64," +
        Buffer.from("not pdf").toString("base64"),
      mediaType: "application/pdf",
      filename: "a.pdf",
    },
    {
      fileUrl:
        "data:application/pdf;base64," +
        Buffer.from("%PDF-1.7 /JavaScript").toString("base64"),
      mediaType: "application/pdf",
      filename: "a.pdf",
    },
    {
      fileUrl:
        "data:application/pdf;base64," +
        Buffer.from("%PDF-1.7").toString("base64"),
      mediaType: "application/pdf",
      filename: "a.exe",
    },
  ])("rejects unsafe upload %j", (input) =>
    expect(() => validateAiUpload(input)).toThrow(),
  );
  it("accepts a bounded PDF for extraction", () =>
    expect(
      validateAiUpload({
        fileUrl:
          "data:application/pdf;base64," +
          Buffer.from("%PDF-1.7\n%%EOF").toString("base64"),
        mediaType: "application/pdf",
        filename: "a.pdf",
      })?.type,
    ).toBe("application/pdf"));
  it("removes invented fields and exercises; missing parameters stay absent", () => {
    const extraction = ExtractedWorkoutSchema.parse({
      name: null,
      workoutDays: [
        {
          name: null,
          weekDay: null,
          isRest: null,
          estimatedDurationInSeconds: null,
          exercises: [
            {
              name: "Supino",
              sets: 3,
              reps: 12,
              warmupSets: null,
              restTimeInSeconds: 90,
              targetLoadInGrams: null,
              targetRir: null,
              tempo: null,
            },
            {
              name: "Agachamento",
              sets: 3,
              reps: 12,
              warmupSets: null,
              restTimeInSeconds: 90,
              targetLoadInGrams: null,
              targetRir: null,
              tempo: null,
            },
          ],
        },
      ],
      provenance: [
        { path: "workoutDays.0.exercises.0.name", quote: "Supino" },
        { path: "workoutDays.0.exercises.0.sets", quote: "3 séries" },
        { path: "workoutDays.0.exercises.1.name", quote: "Agachamento" },
      ],
      questions: [],
    });
    const clean = sanitizeExtraction(extraction, "Supino");
    expect(clean.workoutDays[0].exercises).toHaveLength(1);
    expect(clean.workoutDays[0].exercises[0]).toMatchObject({
      name: "Supino",
      sets: null,
      reps: null,
      restTimeInSeconds: null,
    });
    expect(
      ConfirmWorkoutImportBody.safeParse({
        previewToken: "x",
        confirmed: true,
        name: "A",
        workoutDays: clean.workoutDays,
      }).success,
    ).toBe(false);
  });
  it("binds preview to owner and prevents forged provenance", () => {
    const extracted = {
      name: null,
      workoutDays: [],
      provenance: [],
      questions: [],
    };
    const token = signImportPreview({
      userId: "a",
      sourceHash: "hash",
      sourceType: "text",
      extracted,
    });
    expect(verifyImportPreview(token, "a").sourceHash).toBe("hash");
    expect(() => verifyImportPreview(token, "b")).toThrow();
    expect(() => verifyImportPreview(token + "changed", "a")).toThrow();
    expect(() => verifyImportPreview(token + "!", "a")).toThrow();
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alias = alphabet[alphabet.indexOf(token.at(-1)!) ^ 1];
    expect(() =>
      verifyImportPreview(token.slice(0, -1) + alias, "a"),
    ).toThrow();
  });
  it("expires a preview instead of accepting delayed confirmation", () => {
    vi.useFakeTimers();
    try {
      const token = signImportPreview({
        userId: "a",
        sourceHash: "hash",
        sourceType: "text",
        extracted: {
          name: null,
          workoutDays: [],
          provenance: [],
          questions: [],
        },
      });
      vi.advanceTimersByTime(31 * 60000);
      expect(() => verifyImportPreview(token, "a")).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps supplied sets/reps and rejects a weekday or parameter with unrelated evidence", () => {
    const quote = "Supino 3x10, descanso 90s";
    const data = {
      name: null,
      workoutDays: [
        {
          name: null,
          weekDay: "MONDAY" as const,
          isRest: null,
          estimatedDurationInSeconds: null,
          exercises: [
            {
              name: "Supino",
              sets: 3,
              reps: 10,
              warmupSets: null,
              restTimeInSeconds: 90,
              targetLoadInGrams: null,
              targetRir: null,
              tempo: null,
            },
          ],
        },
      ],
      provenance: [
        ...["name", "sets", "reps", "restTimeInSeconds"].map((key) => ({
          path: `workoutDays.0.exercises.0.${key}`,
          quote,
        })),
        { path: "workoutDays.0.weekDay", quote },
      ],
      questions: [],
    };
    const clean = sanitizeExtraction(data, quote);
    expect(clean.workoutDays[0].weekDay).toBeNull();
    expect(clean.workoutDays[0].exercises[0]).toMatchObject({
      sets: 3,
      reps: 10,
      restTimeInSeconds: 90,
      warmupSets: null,
    });
    const wrong = sanitizeExtraction(
      {
        ...data,
        workoutDays: [
          {
            ...data.workoutDays[0],
            exercises: [{ ...data.workoutDays[0].exercises[0], reps: 3 }],
          },
        ],
        provenance: [
          { path: "workoutDays.0.exercises.0.name", quote: "Supino" },
          { path: "workoutDays.0.exercises.0.reps", quote: "3 séries" },
        ],
      },
      "Supino 3 séries",
    );
    expect(wrong.workoutDays[0].exercises[0].reps).toBeNull();
  });
});
