/* eslint-disable @typescript-eslint/no-explicit-any */
import Fastify, { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { coachTemplateRoutes } from "../../src/routes/coach-template.js";
import { exerciseRoutes } from "../../src/routes/exercise.js";

describe("Coach Templates and Custom Exercises Integration Tests", () => {
  let app: FastifyInstance;
  let coachUser: { id: string; email: string; name: string };
  let athleteUser: { id: string; email: string; name: string };
  let activeLinkId: string;

  const validWorkoutDays = [
    {
      name: "Treino A - Peito e Tríceps",
      order: 0,
      weekDay: "MONDAY" as const,
      isRest: false,
      estimatedDurationInSeconds: 3600,
      exercises: [
        {
          order: 0,
          name: "Supino Reto com Barra",
          sets: 4,
          warmupSets: 1,
          reps: 10,
          restTimeInSeconds: 90,
          alternative1ExerciseName: "Supino Inclinado com Halteres",
        },
      ],
    },
    {
      name: "Descanso",
      order: 1,
      weekDay: "TUESDAY" as const,
      isRest: true,
      estimatedDurationInSeconds: 0,
      exercises: [],
    },
  ];

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachTemplateRoutes);
    await app.register(exerciseRoutes, { prefix: "/exercises" });
    await app.ready();

    // Cria Coach com Entitlement
    const coachPlan = await prisma.plan.create({
      data: {
        code: `TEMPLATE_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Template Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 9900,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 10 },
            { entitlement: "ASSIGN_WORKOUTS", limitValue: null },
          ],
        },
      },
    });

    coachUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Coach Template Test",
        email: `coach-template-${Date.now()}@test.com`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachUser.id,
        planId: coachPlan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 9900,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    athleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Athlete Template Test",
        email: `athlete-template-${Date.now()}@test.com`,
        accountType: "ATHLETE",
      },
    });

    const link = await prisma.coachAthlete.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        status: "ACTIVE",
      },
    });
    activeLinkId = link.id;
  });

  afterAll(async () => {
    const userIds = [coachUser?.id, athleteUser?.id].filter(Boolean) as string[];
    if (coachUser?.id) {
      await prisma.workoutPrescription.deleteMany({
        where: { coachId: coachUser.id },
      });
      await prisma.workoutPlanTemplate.deleteMany({
        where: { coachId: coachUser.id },
      });
      await prisma.workoutExercise.deleteMany({
        where: { workoutDay: { workoutPlan: { userId: coachUser.id } } },
      });
      await prisma.workoutDay.deleteMany({
        where: { workoutPlan: { userId: coachUser.id } },
      });
      await prisma.workoutPlan.deleteMany({
        where: { userId: coachUser.id },
      });
      await prisma.subscription.deleteMany({
        where: { userId: coachUser.id },
      });
      await prisma.exercise.deleteMany({
        where: { ownerUserId: coachUser.id },
      });
    }
    if (activeLinkId) {
      await prisma.coachAthlete.deleteMany({
        where: { id: activeLinkId },
      });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
    await app.close();
  });

  it("POST /coach/templates — cria modelo pré-definido com sucesso", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/coach/templates",
      payload: {
        name: "Modelo Hipertrofia A/B",
        description: "Template padrão para iniciantes",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Modelo Hipertrofia A/B");
    expect(body.payload.workoutDays.length).toBe(2);
  });

  it("GET /coach/templates — lista modelos do treinador", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "GET",
      url: "/coach/templates",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].name).toBe("Modelo Hipertrofia A/B");
  });

  it("POST /coach/templates/:id/allocate — aloca modelo para um aluno com 1 clique (gera prescrição enviada)", async () => {
    const template = await prisma.workoutPlanTemplate.findFirstOrThrow({
      where: { coachId: coachUser.id },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/coach/templates/${template.id}/allocate`,
      payload: {
        athleteId: athleteUser.id,
        notes: "Prescrição adaptada do modelo padrão",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.prescription.status).toBe("SENT");
    expect(body.prescription.name).toBe(template.name);
    expect(body.prescription.athleteId).toBe(athleteUser.id);
  });

  it("POST /coach/templates/from-plan/:planId — salva um plano existente como modelo pré-definido", async () => {
    // Cria um plano pessoal do coach
    const plan = await prisma.workoutPlan.create({
      data: {
        id: crypto.randomUUID(),
        name: "Meu Plano de Costas Pessoal",
        userId: coachUser.id,
        workoutDays: {
          create: [
            {
              name: "Costas e Bíceps",
              order: 0,
              weekDay: "MONDAY",
              isRest: false,
              estimatedDurationInSeconds: 3000,
              exercises: {
                create: [
                  {
                    name: "Puxada Frontal",
                    order: 0,
                    sets: 4,
                    warmupSets: 1,
                    reps: 10,
                    restTimeInSeconds: 90,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/coach/templates/from-plan/${plan.id}`,
      payload: {
        name: "Modelo Convertido de Meu Treino",
        description: "Salvo diretamente dos meus treinos pessoais",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Modelo Convertido de Meu Treino");
    expect(body.payload.workoutDays[0].name).toBe("Costas e Bíceps");

    // Limpa plano de teste
    await prisma.workoutExercise.deleteMany({
      where: { workoutDay: { workoutPlanId: plan.id } },
    });
    await prisma.workoutDay.deleteMany({
      where: { workoutPlanId: plan.id },
    });
    await prisma.workoutPlan.delete({ where: { id: plan.id } });
  });

  it("Exercícios Personalizados — cria, edita (PATCH) e exclui (DELETE)", async () => {
    // 1. Criar
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/exercises",
      payload: {
        name: "Supino Inclinado na Smith Personalizado",
        isUnilateral: false,
        primaryMuscleGroups: ["CHEST"],
        secondaryMuscleGroups: ["TRICEPS", "SHOULDERS"],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdEx = createRes.json();
    expect(createdEx.name).toBe("Supino Inclinado na Smith Personalizado");
    expect(createdEx.ownerUserId).toBe(coachUser.id);

    // 2. Editar com PATCH
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/exercises/${createdEx.id}`,
      payload: {
        name: "Supino Inclinado Smith Pro",
        isUnilateral: true,
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchedEx = patchRes.json();
    expect(patchedEx.name).toBe("Supino Inclinado Smith Pro");
    expect(patchedEx.isUnilateral).toBe(true);

    // 3. Excluir com DELETE
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/exercises/${createdEx.id}`,
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().success).toBe(true);

    const inDb = await prisma.exercise.findUnique({
      where: { id: createdEx.id },
    });
    expect(inDb).toBeNull();
  });
});
