import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import { coachPrescriptionRoutes } from "../../src/routes/coach-prescription.js";
import { UpdateWorkoutPrescriptionDraft } from "../../src/usecases/UpdateWorkoutPrescriptionDraft.js";

const { create, update, tx } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    workoutPrescription: { findUnique: vi.fn(), update: vi.fn() },
    coachAthlete: { findFirst: vi.fn() },
  };
  return { create: vi.fn(), update: tx.workoutPrescription.update, tx };
});
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue({ user: { id: "coach" } }) },
  },
}));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    coachAthlete: {
      findFirst: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
    },
    workoutPrescription: { create },
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
  },
}));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({
  GetCommercialContext: class {
    execute() {
      return {
        accountType: "COACH",
        accountSetupCompletedAt: "2026-01-01",
        entitlements: [{ key: "ASSIGN_WORKOUTS", limitValue: null }],
      };
    }
  },
}));

const body = {
  athleteId: "athlete",
  name: "Plano",
  notes: null,
  workoutDays: [
    {
      name: "Treino A",
      order: 0,
      weekDay: "MONDAY" as const,
      isRest: false,
      estimatedDurationInSeconds: 3600,
      exercises: [
        {
          order: 0,
          name: "Supino",
          sets: 3,
          warmupSets: 0,
          reps: 10,
          restTimeInSeconds: 60,
          alternative1ExerciseName: "Flexão",
        },
      ],
    },
  ],
};
const prescription = {
  id: "draft",
  coachId: "coach",
  athleteId: "athlete",
  name: "Plano",
  notes: null,
  status: "DRAFT",
  version: 1,
  acceptedWorkoutPlanId: null,
  sentAt: null,
  respondedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  athlete: {
    id: "athlete",
    name: "Aluno",
    email: "aluno@example.com",
    image: null,
  },
  payload: { workoutDays: body.workoutDays },
};
afterEach(() => vi.clearAllMocks());

describe("Contrato e persistência da prescrição do personal", () => {
  it("aceita o payload do editor e preserva alternativas na criação", async () => {
    create.mockResolvedValue(prescription);
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachPrescriptionRoutes);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/coach/prescriptions",
        payload: body,
      });
      expect(response.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: {
              workoutDays: [
                expect.objectContaining({
                  exercises: [
                    expect.objectContaining({
                      alternative1ExerciseName: "Flexão",
                    }),
                  ],
                }),
              ],
            },
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it("retorna um erro de validação útil em vez de apenas Bad Request", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachPrescriptionRoutes);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/coach/prescriptions",
        payload: { ...body, name: "x".repeat(101) },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(
        expect.objectContaining({
          code: "INVALID_PRESCRIPTION_PAYLOAD",
          error: expect.stringContaining("/name"),
        }),
      );
      expect(create).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("mantém alternativas ao editar um rascunho", async () => {
    tx.workoutPrescription.findUnique.mockResolvedValue(prescription);
    tx.coachAthlete.findFirst.mockResolvedValue({ status: "ACTIVE" });
    update.mockResolvedValue(prescription);
    await new UpdateWorkoutPrescriptionDraft().execute({
      ...body,
      coachId: "coach",
      prescriptionId: "draft",
      expectedVersion: 1,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            workoutDays: [
              expect.objectContaining({
                exercises: [
                  expect.objectContaining({
                    alternative1ExerciseName: "Flexão",
                  }),
                ],
              }),
            ],
          },
        }),
      }),
    );
  });
});
