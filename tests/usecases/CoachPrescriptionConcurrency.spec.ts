import { describe, expect, it } from "vitest";

import { CoachPrescriptionError } from "../../src/domain/coach-prescription.js";
import { prisma } from "../../src/lib/db.js";
import { AcceptWorkoutPrescription } from "../../src/usecases/AcceptWorkoutPrescription.js";
import { CancelWorkoutPrescription } from "../../src/usecases/CancelWorkoutPrescription.js";
import { CreateWorkoutPrescriptionDraft } from "../../src/usecases/CreateWorkoutPrescriptionDraft.js";
import { DeclineWorkoutPrescription } from "../../src/usecases/DeclineWorkoutPrescription.js";
import { RevokeCoachAthleteLink } from "../../src/usecases/RevokeCoachAthleteLink.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
import { UpdateWorkoutPrescriptionDraft } from "../../src/usecases/UpdateWorkoutPrescriptionDraft.js";

describe("TASK 6.2B.1 — Prescrições de Treino: Concorrência, Integridade e Máquina de Estados", () => {
  const createCoach = async (
    prefix: string,
    options: { status?: "ACTIVE" | "EXPIRED"; withoutAssign?: boolean } = {},
  ) => {
    const { status = "ACTIVE", withoutAssign = false } = options;
    const email = `conc-presc-c-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@coach.test`;

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Coach ${prefix}`,
        email,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    const plan = await prisma.plan.create({
      data: {
        code: `PLAN_PRESC_${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Prescription Concurrency Plan",
        audience: "COACH",
        monthlyPriceInCents: 9900,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 10 },
            ...(withoutAssign
              ? []
              : [{ entitlement: "ASSIGN_WORKOUTS", limitValue: null }]),
          ],
        },
      },
    });

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status,
        priceInCentsSnapshot: 9900,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd:
          status === "ACTIVE"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() - 1000),
      },
    });

    return { user, plan };
  };

  const createAthlete = async (prefix: string) => {
    const email = `conc-presc-a-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@ath.test`;
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Athlete ${prefix}`,
        email,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });
  };

  const setupPairWithLink = async (prefix: string) => {
    const { user: coach } = await createCoach(prefix);
    const athlete = await createAthlete(prefix);

    const link = await prisma.coachAthlete.create({
      data: {
        id: crypto.randomUUID(),
        coachId: coach.id,
        athleteId: athlete.id,
        status: "ACTIVE",
      },
    });

    return { coach, athlete, link };
  };

  const sampleDays = [
    {
      name: "Treino A - Peitoral e Tríceps",
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
        },
        {
          order: 1,
          name: "Tríceps Pulley",
          sets: 3,
          warmupSets: 0,
          reps: 12,
          restTimeInSeconds: 60,
        },
      ],
    },
    {
      name: "Descanso Ativo",
      order: 1,
      weekDay: "TUESDAY" as const,
      isRest: true,
      estimatedDurationInSeconds: 0,
      exercises: [],
    },
  ];

  it("1. Editar × Enviar: se Enviar executar primeiro, impede edição do rascunho e preserva imutabilidade do enviado", async () => {
    const { coach, athlete } = await setupPairWithLink("edit-send");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Base",
      workoutDays: sampleDays,
    });

    // Dispara edição e envio simultaneamente
    const [editResult, sendResult] = await Promise.allSettled([
      new UpdateWorkoutPrescriptionDraft().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
        name: "Planejamento Modificado",
        workoutDays: sampleDays,
      }),
      new SendWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
    ]);

    // O envio precisa ter sucesso
    expect(sendResult.status).toBe("fulfilled");

    // Verifica no banco de dados o estado final
    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });

    expect(inDb.status).toBe("SENT");
    expect(inDb.sentAt).not.toBeNull();

    // Se a edição falhou, deve ter sido rejeitada com código 409
    if (editResult.status === "rejected") {
      expect(editResult.reason).toBeInstanceOf(CoachPrescriptionError);
      expect(editResult.reason.status).toBe(409);
    }
  });

  it("2. Enviar × Cancelar: não permite que uma prescrição CANCELLED volte para SENT", async () => {
    const { coach, athlete } = await setupPairWithLink("send-cancel");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Para Enviar ou Cancelar",
      workoutDays: sampleDays,
    });

    // Dispara envio e cancelamento simultaneamente
    await Promise.allSettled([
      new SendWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
      new CancelWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
    ]);

    // O estado final no banco NUNCA pode ser inconsistente
    const finalInDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });

    // Se o cancelamento aconteceu, ele pode ser SENT ou CANCELLED (se o cancelamento ocorreu depois do send, termina em CANCELLED)
    expect(["SENT", "CANCELLED"]).toContain(finalInDb.status);

    // Se estiver cancelado, tentar enviar novamente deve ser rejeitado com 409
    if (finalInDb.status === "CANCELLED") {
      await expect(
        new SendWorkoutPrescription().execute({
          coachId: coach.id,
          prescriptionId: draft.id,
        }),
      ).rejects.toThrow(CoachPrescriptionError);
    }
  });

  it("3. Aceitar × Cancelar: se aceite concluir primeiro, o cancelamento posterior é rejeitado e o WorkoutPlan é 100% preservado", async () => {
    const { coach, athlete } = await setupPairWithLink("acc-cancel");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Aceitar vs Cancelar",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    // Atleta aceita enquanto coach tenta cancelar
    const results = await Promise.allSettled([
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
      new CancelWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
    ]);

    const finalInDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });

    if (finalInDb.status === "ACCEPTED") {
      // Aceite venceu: cancelamento DEVE ter sido rejeitado
      const cancelResult = results[1];
      expect(cancelResult.status).toBe("rejected");
      if (cancelResult.status === "rejected") {
        expect(cancelResult.reason.status).toBe(409);
        expect(cancelResult.reason.code).toBe("PRESCRIPTION_ALREADY_ACCEPTED");
      }

      // WorkoutPlan DEVE existir, pertencer ao atleta e ser inativo
      expect(finalInDb.acceptedWorkoutPlanId).not.toBeNull();
      const plan = await prisma.workoutPlan.findUnique({
        where: { id: finalInDb.acceptedWorkoutPlanId! },
      });
      expect(plan).not.toBeNull();
      expect(plan?.userId).toBe(athlete.id);
      expect(plan?.isActive).toBe(false);
    } else {
      // Cancelamento venceu: aceite DEVE ter sido rejeitado
      expect(finalInDb.status).toBe("CANCELLED");
      expect(finalInDb.acceptedWorkoutPlanId).toBeNull();
      const acceptResult = results[0];
      expect(acceptResult.status).toBe("rejected");
    }
  });

  it("4. Aceitar × Recusar: atleta dispara aceitar e recusar concorrentemente: exatamente uma ação vence e estados não se sobrepõem", async () => {
    const { coach, athlete } = await setupPairWithLink("acc-dec");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Aceitar vs Recusar",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    const [acceptRes, declineRes] = await Promise.allSettled([
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
      new DeclineWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
    ]);

    const finalInDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });

    if (finalInDb.status === "ACCEPTED") {
      expect(acceptRes.status).toBe("fulfilled");
      expect(declineRes.status).toBe("rejected");
      expect(finalInDb.acceptedWorkoutPlanId).not.toBeNull();
    } else {
      expect(finalInDb.status).toBe("DECLINED");
      expect(declineRes.status).toBe("fulfilled");
      expect(acceptRes.status).toBe("rejected");
      expect(finalInDb.acceptedWorkoutPlanId).toBeNull();
    }
  });

  it("5. Aceitar × Aceitar: dois aceites simultâneos geram exatamente 1 WorkoutPlan e retornam com idempotência", async () => {
    const { coach, athlete } = await setupPairWithLink("acc-acc");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Idempotência Concorrente",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    // Dois aceites simultâneos
    const [res1, res2] = await Promise.allSettled([
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
    ]);

    expect(res1.status).toBe("fulfilled");
    expect(res2.status).toBe("fulfilled");

    if (res1.status === "fulfilled" && res2.status === "fulfilled") {
      // Devem apontar para o mesmíssimo workoutPlanId
      expect(res1.value.workoutPlanId).toBe(res2.value.workoutPlanId);
    }

    // Verifica no banco: exatamente 1 plano gerado
    const plansForAthlete = await prisma.workoutPlan.findMany({
      where: {
        userId: athlete.id,
        name: "Planejamento Idempotência Concorrente",
      },
    });
    expect(plansForAthlete.length).toBe(1);
    expect(plansForAthlete[0].isActive).toBe(false);

    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(inDb.status).toBe("ACCEPTED");
    expect(inDb.acceptedWorkoutPlanId).toBe(plansForAthlete[0].id);
  });

  it("6. Recusar × Recusar: duas recusas simultâneas completam idempotentemente", async () => {
    const { coach, athlete } = await setupPairWithLink("dec-dec");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Recusa Dupla",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    const [res1, res2] = await Promise.allSettled([
      new DeclineWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
      new DeclineWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
    ]);

    expect(res1.status).toBe("fulfilled");
    expect(res2.status).toBe("fulfilled");

    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(inDb.status).toBe("DECLINED");
    expect(inDb.acceptedWorkoutPlanId).toBeNull();
  });

  it("7. Enviar × Enviar: dois envios simultâneos resultam em 1 transição bem-sucedida e 1 rejeição 409", async () => {
    const { coach, athlete } = await setupPairWithLink("send-send");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Envio Duplo",
      workoutDays: sampleDays,
    });

    const [res1, res2] = await Promise.allSettled([
      new SendWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
      new SendWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejections = [res1, res2].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const rej = rejections[0] as PromiseRejectedResult;
    expect(rej.reason).toBeInstanceOf(CoachPrescriptionError);
    expect(rej.reason.status).toBe(409);

    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(inDb.status).toBe("SENT");
  });

  it("8. Revogar vínculo × Aceitar: se o vínculo for revogado antes do aceite, aceite falha com 403 e nenhum plano é criado", async () => {
    const { coach, athlete, link } = await setupPairWithLink("rev-acc");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Vínculo Revogado Aceite",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    // Revoga o vínculo simultaneamente ao aceite
    const [, acceptRes] = await Promise.allSettled([
      new RevokeCoachAthleteLink().execute({
        userId: coach.id,
        linkId: link.id,
      }),
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
    ]);

    // Verifica vínculo no banco
    const linkInDb = await prisma.coachAthlete.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(linkInDb.status).toBe("REVOKED");

    if (acceptRes.status === "rejected") {
      expect(acceptRes.reason).toBeInstanceOf(CoachPrescriptionError);
      expect(acceptRes.reason.status).toBe(403);
      expect(acceptRes.reason.code).toBe("COACH_ATHLETE_LINK_REVOKED");

      const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(inDb.acceptedWorkoutPlanId).toBeNull();
    }
  });

  it("9. Revogar vínculo × Enviar: se o vínculo for revogado antes do envio, envio falha com 403", async () => {
    const { coach, athlete, link } = await setupPairWithLink("rev-send");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Vínculo Revogado Envio",
      workoutDays: sampleDays,
    });

    // Revoga simultaneamente ao envio
    const [, sendRes] = await Promise.allSettled([
      new RevokeCoachAthleteLink().execute({
        userId: coach.id,
        linkId: link.id,
      }),
      new SendWorkoutPrescription().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
      }),
    ]);

    const linkInDb = await prisma.coachAthlete.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(linkInDb.status).toBe("REVOKED");

    if (sendRes.status === "rejected") {
      expect(sendRes.reason).toBeInstanceOf(CoachPrescriptionError);
      expect(sendRes.reason.status).toBe(403);
      expect(sendRes.reason.code).toBe("COACH_ATHLETE_LINK_REVOKED");

      const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(inDb.status).toBe("DRAFT");
    }
  });

  it("10. Duas edições simultâneas de rascunho com expectedVersion: exatamente 1 é aceita e conflito 409 é retornado", async () => {
    const { coach, athlete } = await setupPairWithLink("edit-edit");

    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Versão Base",
      workoutDays: sampleDays,
    });

    expect(draft.version).toBe(1);

    // Ambas as chamadas acreditam estar editando a versão 1
    const [res1, res2] = await Promise.allSettled([
      new UpdateWorkoutPrescriptionDraft().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
        name: "Edição Concorrente 1",
        expectedVersion: 1,
        workoutDays: sampleDays,
      }),
      new UpdateWorkoutPrescriptionDraft().execute({
        coachId: coach.id,
        prescriptionId: draft.id,
        name: "Edição Concorrente 2",
        expectedVersion: 1,
        workoutDays: sampleDays,
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejections = [res1, res2].filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(1);

    const rej = rejections[0] as PromiseRejectedResult;
    expect(rej.reason).toBeInstanceOf(CoachPrescriptionError);
    expect(rej.reason.status).toBe(409);
    expect(rej.reason.code).toBe("CONCURRENCY_CONFLICT");

    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(inDb.version).toBe(2);
  });

  it("11. Preservação de dados do atleta: aceitar prescrição NÃO desativa o planejamento ativo existente e mantém sessões intactas", async () => {
    const { coach, athlete } = await setupPairWithLink("athlete-integrity");

    // Cria planejamento próprio já ativo para o atleta
    const activeExistingPlan = await prisma.workoutPlan.create({
      data: {
        id: crypto.randomUUID(),
        name: "Plano Existente Ativo do Aluno",
        userId: athlete.id,
        isActive: true,
      },
    });

    // Cria uma sessão de treino histórica para o atleta
    const session = await prisma.workoutSession.create({
      data: {
        id: crypto.randomUUID(),
        athleteId: athlete.id,
        workoutPlanId: activeExistingPlan.id,
        startedAt: new Date(Date.now() - 3600000),
        completedAt: new Date(),
        origin: "PLANNED",
      },
    });

    // Coach cria e envia uma prescrição
    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Nova Prescrição do Coach",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    // Aluno aceita a prescrição
    const acceptResult = await new AcceptWorkoutPrescription().execute({
      athleteId: athlete.id,
      prescriptionId: draft.id,
    });

    expect(acceptResult.success).toBe(true);

    // O novo plano criado deve ter isActive = false
    const newPlanInDb = await prisma.workoutPlan.findUniqueOrThrow({
      where: { id: acceptResult.workoutPlanId },
    });
    expect(newPlanInDb.isActive).toBe(false);
    expect(newPlanInDb.userId).toBe(athlete.id);

    // O planejamento anterior DEVE continuar com isActive = true
    const activePlanStillActive = await prisma.workoutPlan.findUniqueOrThrow({
      where: { id: activeExistingPlan.id },
    });
    expect(activePlanStillActive.isActive).toBe(true);

    // A sessão histórica deve estar 100% preservada
    const sessionStillExists = await prisma.workoutSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionStillExists.id).toBe(session.id);
  });

  it("12. Falha transacional: se ocorrer erro após bloqueio/mudança temporária, o rollback no PostgreSQL é total e a prescrição permanece SENT", async () => {
    const { coach, athlete } = await setupPairWithLink("rollback-test");

    // Prescrição com payload mal formatado ou que simula falha
    const draft = await new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach.id,
      athleteId: athlete.id,
      name: "Planejamento Para Teste de Rollback",
      workoutDays: sampleDays,
    });

    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: draft.id,
    });

    // Forçamos uma falha injetando payload inválido diretamente no banco para a prescrição
    await prisma.workoutPrescription.update({
      where: { id: draft.id },
      data: {
        payload: {
          workoutDays: [
            {
              name: "Dia Corrompido",
              weekDay: "INVALID_WEEKDAY_ENUM_VALUE" as any,
              isRest: false,
              estimatedDurationInSeconds: 3600,
              exercises: [],
            },
          ],
        },
      },
    });

    // O aceite deve falhar durante a transação
    await expect(
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete.id,
        prescriptionId: draft.id,
      }),
    ).rejects.toThrow();

    // Estado no banco DEVE ter sofrido rollback completo: permanece SENT, sem plano criado
    const inDb = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(inDb.status).toBe("SENT");
    expect(inDb.acceptedWorkoutPlanId).toBeNull();
  });
});
