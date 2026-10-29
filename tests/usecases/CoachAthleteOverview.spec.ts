/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db.js";
import { GetCoachAthleteDetails } from "../../src/usecases/GetCoachAthleteDetails.js";
import { RevokeCoachAthleteLink } from "../../src/usecases/RevokeCoachAthleteLink.js";

describe("TASK 6.2A — Coach Athlete Overview & IDOR Protection", () => {
  const createCoach = async (
    prefix: string,
    options: {
      accountSetupCompleted?: boolean;
      hasActiveSubscription?: boolean;
      hasManageAthletesEntitlement?: boolean;
    } = {},
  ) => {
    const {
      accountSetupCompleted = true,
      hasActiveSubscription = true,
      hasManageAthletesEntitlement = true,
    } = options;

    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@coach.test`;
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Coach ${prefix}`,
        email,
        accountType: "COACH",
        professionalRegistration: {
          create: {
            fullName: "Verified Fixture",
            cref: "123456-G",
            region: "SP",
            category: "Bacharel",
            status: "VERIFIED",
            verifiedAt: new Date(),
            validUntil: new Date("2099-01-01"),
          },
        },
        accountSetupCompletedAt: accountSetupCompleted ? new Date() : null,
      },
    });

    if (hasActiveSubscription) {
      const entitlements = [
        { entitlement: "COACH_DASHBOARD", limitValue: null },
      ];
      if (hasManageAthletesEntitlement) {
        entitlements.push({ entitlement: "MANAGE_ATHLETES", limitValue: 10 });
      }

      const plan = await prisma.plan.create({
        data: {
          code: `TEST_PLAN_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: "Test Coach Plan",
          audience: "COACH",
          monthlyPriceInCents: 4990,
          currency: "BRL",
          isActive: true,
          isPublic: true,
          entitlements: {
            create: entitlements,
          },
        },
      });

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "ACTIVE",
          priceInCentsSnapshot: 4990,
          currencySnapshot: "BRL",
        },
      });
    }

    return user;
  };

  const createAthlete = async (prefix: string) => {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@ath.test`;
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

  it("1. Retorna dados autorizados de um aluno ativamente vinculado", async () => {
    const coach = await createCoach("c1");
    const athlete = await createAthlete("a1");

    const link = await prisma.coachAthlete.create({
      data: {
        coachId: coach.id,
        athleteId: athlete.id,
        status: "ACTIVE",
      },
    });

    const useCase = new GetCoachAthleteDetails();
    const result = await useCase.execute({
      coachId: coach.id,
      athleteId: athlete.id,
    });

    expect(result).toBeDefined();
    expect(result.linkId).toBe(link.id);
    expect(result.athleteId).toBe(athlete.id);
    expect(result.name).toBe(athlete.name);
    expect(result.email).toBe(athlete.email);
    expect(result.status).toBe("ACTIVE");
    expect(result.acceptedAt).toBeDefined();

    // Invariante de privacidade: não expõe campos restritos
    expect((result as any).bodyMetrics).toBeUndefined();
    expect((result as any).workoutPlans).toBeUndefined();
    expect((result as any).sessions).toBeUndefined();
    expect((result as any).chats).toBeUndefined();
  });

  it("2. Defesa IDOR: Treinador A não pode acessar aluno exclusivo do Treinador B", async () => {
    const coachA = await createCoach("coachA");
    const coachB = await createCoach("coachB");
    const athleteB = await createAthlete("athleteB");

    // Vincula apenas com Coach B
    await prisma.coachAthlete.create({
      data: {
        coachId: coachB.id,
        athleteId: athleteB.id,
        status: "ACTIVE",
      },
    });

    const useCase = new GetCoachAthleteDetails();

    // Coach A tenta ler aluno do Coach B
    await expect(
      useCase.execute({
        coachId: coachA.id,
        athleteId: athleteB.id,
      }),
    ).rejects.toThrow(
      "Aluno não encontrado ou vínculo inativo com este treinador.",
    );
  });

  it("3. Revogação imediata: acesso é bloqueado assim que o vínculo é encerrado", async () => {
    const coach = await createCoach("coachRev");
    const athlete = await createAthlete("athleteRev");

    const link = await prisma.coachAthlete.create({
      data: {
        coachId: coach.id,
        athleteId: athlete.id,
        status: "ACTIVE",
      },
    });

    const useCase = new GetCoachAthleteDetails();

    // Antes da revogação: acesso OK
    const before = await useCase.execute({
      coachId: coach.id,
      athleteId: athlete.id,
    });
    expect(before.athleteId).toBe(athlete.id);

    // Encerra o vínculo
    const revokeUseCase = new RevokeCoachAthleteLink();
    await revokeUseCase.execute({
      userId: coach.id,
      linkId: link.id,
    });

    // Imediatamente após a revogação: 404
    await expect(
      useCase.execute({
        coachId: coach.id,
        athleteId: athlete.id,
      }),
    ).rejects.toThrow(
      "Aluno não encontrado ou vínculo inativo com este treinador.",
    );
  });

  it("4. Rejeita acesso se o treinador não possui entitlement MANAGE_ATHLETES", async () => {
    const coachWithoutEntitlement = await createCoach("noEnt", {
      hasManageAthletesEntitlement: false,
    });
    const athlete = await createAthlete("athNoEnt");

    const useCase = new GetCoachAthleteDetails();

    await expect(
      useCase.execute({
        coachId: coachWithoutEntitlement.id,
        athleteId: athlete.id,
      }),
    ).rejects.toThrow("MANAGE_ATHLETES");
  });

  it("5. Rejeita se usuário é do tipo ATHLETE tentando agir como coach", async () => {
    const athleteCaller = await createAthlete("fakeCoach");
    const targetAthlete = await createAthlete("target");

    const useCase = new GetCoachAthleteDetails();

    await expect(
      useCase.execute({
        coachId: athleteCaller.id,
        athleteId: targetAthlete.id,
      }),
    ).rejects.toThrow(
      "Apenas contas do tipo treinador (COACH) podem gerenciar alunos.",
    );
  });
});
