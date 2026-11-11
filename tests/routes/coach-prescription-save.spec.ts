import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import { coachPrescriptionRoutes } from "../../src/routes/coach-prescription.js";
import { AllocateWorkoutPlanTemplate } from "../../src/usecases/AllocateWorkoutPlanTemplate.js";
import { CreateWorkoutPrescriptionDraft } from "../../src/usecases/CreateWorkoutPrescriptionDraft.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
import { UpdateWorkoutPrescriptionDraft } from "../../src/usecases/UpdateWorkoutPrescriptionDraft.js";

const { create, update, tx, consentRead, templateFind, exerciseFind } =
  vi.hoisted(() => {
    const exerciseFind = vi.fn();
    const consentRead = vi.fn(() => {
      throw new Error(
        "Professional authoring must not require student consent",
      );
    });
    const tx = {
      exercise: { findMany: exerciseFind },
      notificationPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
      notification: { create: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn(),
      workoutPrescription: { findUnique: vi.fn(), update: vi.fn() },
      coachAthlete: { findFirst: vi.fn() },
      professionalRegistration: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          fullName: "Personal Exemplo",
          cref: "123456-G",
          region: "SP",
        }),
      },
      legalDocument: { findUnique: consentRead },
      userLegalAcceptance: { findFirst: consentRead },
    };
    return {
      create: vi.fn(),
      update: tx.workoutPrescription.update,
      tx,
      consentRead,
      templateFind: vi.fn(),
      exerciseFind,
    };
  });
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue({ user: { id: "coach" } }) },
  },
}));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    exercise: { findMany: exerciseFind },
    coachAthlete: {
      findFirst: vi.fn().mockResolvedValue({ status: "ACTIVE" }),
    },
    workoutPrescription: { create },
    workoutPlanTemplate: { findUnique: templateFind },
    legalDocument: { findUnique: consentRead },
    userLegalAcceptance: { findFirst: consentRead },
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
  },
}));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({
  GetCommercialContext: class {
    execute() {
      return {
        accountType: "COACH",
        professionalVerification: {
          status: "VERIFIED",
          crefVerificationStatus: "VERIFIED_ADMIN",
          validUntil: "2099-01-01T00:00:00Z",
        },
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
afterEach(() => {
  expect(consentRead).not.toHaveBeenCalled();
  vi.clearAllMocks();
});

describe("Contrato e persistência da prescrição do personal", () => {
  const mainId = "11111111-1111-4111-8111-111111111111";
  const altId = "22222222-2222-4222-8222-222222222222";
  const linkedBody = {
    ...body,
    workoutDays: [
      {
        ...body.workoutDays[0],
        exercises: [
          {
            ...body.workoutDays[0].exercises[0],
            exerciseId: mainId,
            alternative1ExerciseId: null,
            alternative1ExerciseName: null,
            alternative2ExerciseId: altId,
            alternative2ExerciseName: "Nome antigo",
          },
        ],
      },
    ],
  };

  it("preserva IDs do contrato HTTP e os nomes do catálogo ao criar", async () => {
    exerciseFind.mockResolvedValue([
      { id: mainId, name: "Supino do catálogo" },
      { id: altId, name: "Flexão do personal" },
    ]);
    create.mockResolvedValue(prescription);
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachPrescriptionRoutes);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/coach/prescriptions",
        payload: linkedBody,
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
                      exerciseId: mainId,
                      name: "Supino do catálogo",
                      alternative1ExerciseId: altId,
                      alternative1ExerciseName: "Flexão do personal",
                      alternative2ExerciseId: null,
                      alternative2ExerciseName: null,
                    }),
                  ],
                }),
              ],
            },
          }),
        }),
      );
      expect(exerciseFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [mainId, altId] },
            OR: [{ ownerUserId: null }, { ownerUserId: "coach" }],
          },
        }),
      );
    } finally {
      await app.close();
    }
  });

  it("preserva IDs ao atualizar, consultando o catálogo dentro da transação", async () => {
    exerciseFind.mockResolvedValue([
      { id: mainId, name: "Supino" },
      { id: altId, name: "Flexão" },
    ]);
    tx.workoutPrescription.findUnique.mockResolvedValue(prescription);
    tx.coachAthlete.findFirst.mockResolvedValue({ status: "ACTIVE" });
    update.mockResolvedValue(prescription);
    await new UpdateWorkoutPrescriptionDraft().execute({
      ...linkedBody,
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
                    exerciseId: mainId,
                    alternative1ExerciseId: altId,
                    alternative2ExerciseId: null,
                  }),
                ],
              }),
            ],
          },
        }),
      }),
    );
  });

  it.each(["principal", "alternativa"])(
    "recusa ID indisponível no %s sem persistir a criação ou edição",
    async (slot) => {
      exerciseFind.mockResolvedValue(
        slot === "principal"
          ? [{ id: altId, name: "Flexão" }]
          : [{ id: mainId, name: "Supino" }],
      );
      tx.workoutPrescription.findUnique.mockResolvedValue(prescription);
      tx.coachAthlete.findFirst.mockResolvedValue({ status: "ACTIVE" });
      await expect(
        new CreateWorkoutPrescriptionDraft().execute({
          ...linkedBody,
          coachId: "coach",
        }),
      ).rejects.toMatchObject({ code: "INVALID_PRESCRIPTION_PAYLOAD" });
      await expect(
        new UpdateWorkoutPrescriptionDraft().execute({
          ...linkedBody,
          coachId: "coach",
          prescriptionId: "draft",
        }),
      ).rejects.toMatchObject({ code: "INVALID_PRESCRIPTION_PAYLOAD" });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("remove alternativas que repetem o principal e mantém ID e nome juntos", async () => {
    exerciseFind.mockResolvedValue([
      { id: mainId, name: "Supino" },
      { id: altId, name: "Flexão" },
    ]);
    create.mockResolvedValue(prescription);
    await new CreateWorkoutPrescriptionDraft().execute({
      ...linkedBody,
      coachId: "coach",
      workoutDays: [
        {
          ...linkedBody.workoutDays[0],
          exercises: [
            {
              ...linkedBody.workoutDays[0].exercises[0],
              alternative1ExerciseId: mainId,
            },
          ],
        },
      ],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            workoutDays: [
              expect.objectContaining({
                exercises: [
                  expect.objectContaining({
                    exerciseId: mainId,
                    alternative1ExerciseId: altId,
                    alternative1ExerciseName: "Flexão",
                    alternative2ExerciseId: null,
                  }),
                ],
              }),
            ],
          },
        }),
      }),
    );
  });

  it("mantém exercícios distintos por ID mesmo com nomes iguais", async () => {
    exerciseFind.mockResolvedValue([
      { id: mainId, name: "Supino" },
      { id: altId, name: "Supino" },
    ]);
    create.mockResolvedValue(prescription);
    await new CreateWorkoutPrescriptionDraft().execute({
      ...linkedBody,
      coachId: "coach",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: {
            workoutDays: [
              expect.objectContaining({
                exercises: [
                  expect.objectContaining({
                    exerciseId: mainId,
                    alternative1ExerciseId: altId,
                    alternative1ExerciseName: "Supino",
                  }),
                ],
              }),
            ],
          },
        }),
      }),
    );
  });

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
  it("envia a ficha aprovada pelo profissional sem consultar aceites do aluno", async () => {
    tx.workoutPrescription.findUnique.mockResolvedValue(prescription);
    tx.coachAthlete.findFirst.mockResolvedValue({ status: "ACTIVE" });
    update.mockResolvedValue({
      ...prescription,
      status: "SENT",
      sentAt: new Date(),
    });
    const result = await new SendWorkoutPrescription().execute({
      coachId: "coach",
      prescriptionId: "draft",
      expectedVersion: 1,
      approval: true,
    });
    expect(result.status).toBe("SENT");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          approvedVersion: 1,
          approvedByUserId: "coach",
          prescribedCrefSnapshot: "Personal Exemplo — CREF 123456-G/SP",
        }),
      }),
    );
  });
  it("aloca um modelo do profissional como rascunho sem exigir aceite do aluno", async () => {
    templateFind.mockResolvedValue({
      coachId: "coach",
      name: "Modelo do personal",
      payload: prescription.payload,
    });
    create.mockResolvedValue(prescription);
    const result = await new AllocateWorkoutPlanTemplate().execute({
      coachId: "coach",
      athleteId: "athlete",
      templateId: "template",
    });
    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT", sentAt: null }),
      }),
    );
  });
  it("mantém a aprovação explícita, a revisão de versão e o vínculo no envio", async () => {
    tx.workoutPrescription.findUnique.mockResolvedValue(prescription);
    const send = new SendWorkoutPrescription();
    await expect(
      send.execute({
        coachId: "coach",
        prescriptionId: "draft",
        expectedVersion: 1,
        approval: false as unknown as true,
      }),
    ).rejects.toMatchObject({ code: "EXPLICIT_APPROVAL_REQUIRED" });
    await expect(
      send.execute({
        coachId: "coach",
        prescriptionId: "draft",
        expectedVersion: 2,
        approval: true,
      }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
    tx.coachAthlete.findFirst.mockResolvedValueOnce(null);
    await expect(
      send.execute({
        coachId: "coach",
        prescriptionId: "draft",
        expectedVersion: 1,
        approval: true,
      }),
    ).rejects.toMatchObject({ code: "COACH_ATHLETE_LINK_REVOKED" });
    expect(update).not.toHaveBeenCalled();
  });
  it("mantém ownership no envio e na alocação de modelo", async () => {
    tx.workoutPrescription.findUnique.mockResolvedValue({
      ...prescription,
      coachId: "other-coach",
    });
    await expect(
      new SendWorkoutPrescription().execute({
        coachId: "coach",
        prescriptionId: "draft",
        expectedVersion: 1,
        approval: true,
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_FOUND" });
    templateFind.mockResolvedValue({ coachId: "other-coach" });
    await expect(
      new AllocateWorkoutPlanTemplate().execute({
        coachId: "coach",
        athleteId: "athlete",
        templateId: "template",
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
