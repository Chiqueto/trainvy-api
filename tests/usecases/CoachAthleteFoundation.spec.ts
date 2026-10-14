import { describe, expect, it } from "vitest";

import { CoachAthleteError, hashInvitationToken } from "../../src/domain/coach-athlete.js";
import { prisma } from "../../src/lib/db.js";
import { AcceptCoachInvitation } from "../../src/usecases/AcceptCoachInvitation.js";
import { CancelCoachInvitation } from "../../src/usecases/CancelCoachInvitation.js";
import { CreateCoachInvitation } from "../../src/usecases/CreateCoachInvitation.js";
import { GetAthleteCoachRelationship } from "../../src/usecases/GetAthleteCoachRelationship.js";
import { GetInvitationPreview } from "../../src/usecases/GetInvitationPreview.js";
import { ListCoachAthletes } from "../../src/usecases/ListCoachAthletes.js";
import { ListCoachInvitations } from "../../src/usecases/ListCoachInvitations.js";
import { RevokeCoachAthleteLink } from "../../src/usecases/RevokeCoachAthleteLink.js";

describe("TASK 6.1 — Coach ↔ Athlete Foundation", () => {
  // Helpers para criação de usuários isolados de teste
  const createCoach = async (
    prefix: string,
    options: {
      accountSetupCompleted?: boolean;
      hasActiveSubscription?: boolean;
      customAthleteLimit?: number;
    } = {},
  ) => {
    const {
      accountSetupCompleted = true,
      hasActiveSubscription = true,
      customAthleteLimit,
    } = options;

    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@coach.test`;
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Coach ${prefix}`,
        email,
        accountType: "COACH",
        accountSetupCompletedAt: accountSetupCompleted ? new Date() : null,
      },
    });

    if (hasActiveSubscription) {
      // Cria plano customizado para testar limite específico ou reutiliza plano COACH
      const planCode = customAthleteLimit !== undefined
        ? `TEST_COACH_${customAthleteLimit}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        : `TEST_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const plan = await prisma.plan.create({
        data: {
          code: planCode,
          name: "Test Coach Plan",
          audience: "COACH",
          monthlyPriceInCents: 4990,
          currency: "BRL",
          isActive: true,
          isPublic: true,
          entitlements: {
            create: [
              {
                entitlement: "COACH_DASHBOARD",
                limitValue: null,
              },
              {
                entitlement: "MANAGE_ATHLETES",
                limitValue: customAthleteLimit ?? 5,
              },
            ],
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
          currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return user;
  };

  const createAthlete = async (
    prefix: string,
    options: { accountSetupCompleted?: boolean } = {},
  ) => {
    const { accountSetupCompleted = true } = options;
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@athlete.test`;
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Athlete ${prefix}`,
        email,
        accountType: "ATHLETE",
        accountSetupCompletedAt: accountSetupCompleted ? new Date() : null,
      },
    });
  };

  describe("1. Criação e Segurança de Convites", () => {
    it("impede que conta ATHLETE crie convite de treinador", async () => {
      const athlete = await createAthlete("fake-coach");
      const useCase = new CreateCoachInvitation();

      await expect(
        useCase.execute({ coachId: athlete.id }),
      ).rejects.toMatchObject({
        code: "ONLY_COACHES_ALLOWED",
        status: 403,
      });
    });

    it("impede que coach sem setup inicial crie convite", async () => {
      const coach = await createCoach("no-setup", { accountSetupCompleted: false });
      const useCase = new CreateCoachInvitation();

      await expect(
        useCase.execute({ coachId: coach.id }),
      ).rejects.toMatchObject({
        code: "ACCOUNT_SETUP_REQUIRED",
        status: 403,
      });
    });

    it("impede que coach sem assinatura/entitlement crie convite", async () => {
      const coach = await createCoach("no-sub", { hasActiveSubscription: false });
      const useCase = new CreateCoachInvitation();

      await expect(
        useCase.execute({ coachId: coach.id }),
      ).rejects.toMatchObject({
        code: "MANAGE_ATHLETES_ENTITLEMENT_REQUIRED",
        status: 403,
      });
    });

    it("cria convite seguro gerando token imprevisível e hash SHA-256 no banco", async () => {
      const coach = await createCoach("eligible-1");
      const useCase = new CreateCoachInvitation();

      const result = await useCase.execute({ coachId: coach.id });

      expect(result.id).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThanOrEqual(32);
      expect(result.expiresAt).toBeDefined();

      // Confirma que no banco NÃO foi salvo o token em texto puro
      const inviteInDb = await prisma.coachInvitation.findUnique({
        where: { id: result.id },
      });

      expect(inviteInDb).not.toBeNull();
      expect(inviteInDb?.tokenHash).toBe(hashInvitationToken(result.token));
      expect(inviteInDb?.tokenHash).not.toBe(result.token);
      expect(inviteInDb?.status).toBe("PENDING");
    });
  });

  describe("2. Listagem e Cancelamento de Convites", () => {
    it("lista convites emitidos e detecta expiração", async () => {
      const coach = await createCoach("list-invites");
      const createUseCase = new CreateCoachInvitation();
      const listUseCase = new ListCoachInvitations();

      const inv1 = await createUseCase.execute({ coachId: coach.id });

      const list = await listUseCase.execute({ coachId: coach.id });
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(inv1.id);
      expect(list[0].status).toBe("PENDING");
    });

    it("permite ao treinador cancelar convite pendente", async () => {
      const coach = await createCoach("cancel-inv");
      const createUseCase = new CreateCoachInvitation();
      const cancelUseCase = new CancelCoachInvitation();

      const inv = await createUseCase.execute({ coachId: coach.id });
      const cancelResult = await cancelUseCase.execute({
        coachId: coach.id,
        invitationId: inv.id,
      });

      expect(cancelResult.success).toBe(true);

      const inDb = await prisma.coachInvitation.findUnique({
        where: { id: inv.id },
      });
      expect(inDb?.status).toBe("CANCELLED");
      expect(inDb?.cancelledAt).not.toBeNull();
    });

    it("impede que outro treinador cancele convite alheio (isolamento)", async () => {
      const coachA = await createCoach("coach-a");
      const coachB = await createCoach("coach-b");

      const inv = await new CreateCoachInvitation().execute({ coachId: coachA.id });
      const cancelUseCase = new CancelCoachInvitation();

      await expect(
        cancelUseCase.execute({ coachId: coachB.id, invitationId: inv.id }),
      ).rejects.toMatchObject({
        code: "INVITATION_NOT_FOUND",
        status: 404,
      });
    });
  });

  describe("3. Preview de Convites", () => {
    it("retorna preview válido com informações públicas do treinador", async () => {
      const coach = await createCoach("preview-coach");
      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

      const preview = await new GetInvitationPreview().execute({ token: inv.token });

      expect(preview.isValid).toBe(true);
      expect(preview.coach?.id).toBe(coach.id);
      expect(preview.coach?.name).toBe(coach.name);
      expect(preview.reason).toBeNull();
    });

    it("informa invalidade para token inexistente", async () => {
      const preview = await new GetInvitationPreview().execute({
        token: "non-existent-token-xyz-1234567890",
      });

      expect(preview.isValid).toBe(false);
      expect(preview.reason).toBe("NOT_FOUND");
    });

    it("informa invalidade para convite cancelado", async () => {
      const coach = await createCoach("preview-cancelled");
      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

      await new CancelCoachInvitation().execute({
        coachId: coach.id,
        invitationId: inv.id,
      });

      const preview = await new GetInvitationPreview().execute({ token: inv.token });
      expect(preview.isValid).toBe(false);
      expect(preview.reason).toBe("CANCELLED");
    });
  });

  describe("4. Aceite de Convite e Formação de Vínculo", () => {
    it("atleta aceita convite válido criando vínculo ativo", async () => {
      const coach = await createCoach("accept-coach");
      const athlete = await createAthlete("accept-athlete");

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const acceptResult = await new AcceptCoachInvitation().execute({
        athleteId: athlete.id,
        token: inv.token,
      });

      expect(acceptResult.success).toBe(true);
      expect(acceptResult.link.status).toBe("ACTIVE");
      expect(acceptResult.link.coachId).toBe(coach.id);
      expect(acceptResult.link.athleteId).toBe(athlete.id);

      // Convite no banco atualizado para ACCEPTED
      const invInDb = await prisma.coachInvitation.findUnique({
        where: { id: inv.id },
      });
      expect(invInDb?.status).toBe("ACCEPTED");
      expect(invInDb?.acceptedByAthleteId).toBe(athlete.id);
    });

    it("impede que o mesmo convite seja reutilizado (uso único)", async () => {
      const coach = await createCoach("reuse-coach");
      const athlete1 = await createAthlete("reuse-athlete-1");
      const athlete2 = await createAthlete("reuse-athlete-2");

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

      // Primeiro aceite sucede
      await new AcceptCoachInvitation().execute({
        athleteId: athlete1.id,
        token: inv.token,
      });

      // Segunda tentativa deve falhar com INVITATION_ALREADY_USED
      await expect(
        new AcceptCoachInvitation().execute({
          athleteId: athlete2.id,
          token: inv.token,
        }),
      ).rejects.toMatchObject({
        code: "INVITATION_ALREADY_USED",
        status: 409,
      });
    });

    it("impede que o treinador aceite seu próprio convite (autoassociação)", async () => {
      const coach = await createCoach("self-link-coach");
      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

      await expect(
        new AcceptCoachInvitation().execute({
          athleteId: coach.id,
          token: inv.token,
        }),
      ).rejects.toMatchObject({
        code: "CANNOT_LINK_TO_SELF",
        status: 400,
      });
    });

    it("impede que atleta sem setup concluído aceite convite", async () => {
      const coach = await createCoach("athlete-setup-coach");
      const athlete = await createAthlete("no-setup-ath", { accountSetupCompleted: false });
      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

      await expect(
        new AcceptCoachInvitation().execute({
          athleteId: athlete.id,
          token: inv.token,
        }),
      ).rejects.toMatchObject({
        code: "ACCOUNT_SETUP_REQUIRED",
        status: 400,
      });
    });

    it("impede que um atleta tenha múltiplos treinadores ativos simultâneos", async () => {
      const coach1 = await createCoach("c1-multi");
      const coach2 = await createCoach("c2-multi");
      const athlete = await createAthlete("athlete-multi");

      const inv1 = await new CreateCoachInvitation().execute({ coachId: coach1.id });
      const inv2 = await new CreateCoachInvitation().execute({ coachId: coach2.id });

      // Vincula ao coach 1
      await new AcceptCoachInvitation().execute({
        athleteId: athlete.id,
        token: inv1.token,
      });

      // Tentativa de vincular ao coach 2 deve ser rejeitada
      await expect(
        new AcceptCoachInvitation().execute({
          athleteId: athlete.id,
          token: inv2.token,
        }),
      ).rejects.toMatchObject({
        code: "ATHLETE_ALREADY_HAS_COACH",
        status: 409,
      });
    });
  });

  describe("5. Limites Comerciais e Quotas de Alunos", () => {
    it("bloqueia aceite quando capacidade máxima do treinador é atingida", async () => {
      // Coach com plano restrito a 2 alunos
      const coach = await createCoach("limit-coach", { customAthleteLimit: 2 });
      const athlete1 = await createAthlete("ath-lim-1");
      const athlete2 = await createAthlete("ath-lim-2");
      const athlete3 = await createAthlete("ath-lim-3");

      const inv1 = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const inv2 = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const inv3 = await new CreateCoachInvitation().execute({ coachId: coach.id });

      // 1º aluno aceita
      await new AcceptCoachInvitation().execute({
        athleteId: athlete1.id,
        token: inv1.token,
      });

      // 2º aluno aceita
      await new AcceptCoachInvitation().execute({
        athleteId: athlete2.id,
        token: inv2.token,
      });

      // 3º aluno tenta aceitar (limite era 2)
      await expect(
        new AcceptCoachInvitation().execute({
          athleteId: athlete3.id,
          token: inv3.token,
        }),
      ).rejects.toMatchObject({
        code: "ATHLETE_LIMIT_REACHED",
        status: 409,
      });

      // Criar novo convite também é bloqueado preventivamente
      await expect(
        new CreateCoachInvitation().execute({ coachId: coach.id }),
      ).rejects.toMatchObject({
        code: "ATHLETE_LIMIT_REACHED",
        status: 409,
      });
    });
  });

  describe("6. Listagem de Alunos Ativos e Dados do Treinador", () => {
    it("retorna lista de alunos ativos e limites sem vazar dados de outros treinadores", async () => {
      const coachA = await createCoach("list-coach-a", { customAthleteLimit: 5 });
      const coachB = await createCoach("list-coach-b", { customAthleteLimit: 5 });
      const athleteA = await createAthlete("ath-a");
      const athleteB = await createAthlete("ath-b");

      const invA = await new CreateCoachInvitation().execute({ coachId: coachA.id });
      const invB = await new CreateCoachInvitation().execute({ coachId: coachB.id });

      await new AcceptCoachInvitation().execute({ athleteId: athleteA.id, token: invA.token });
      await new AcceptCoachInvitation().execute({ athleteId: athleteB.id, token: invB.token });

      const listA = await new ListCoachAthletes().execute({ coachId: coachA.id });

      expect(listA.activeCount).toBe(1);
      expect(listA.limit).toBe(5);
      expect(listA.athletes.length).toBe(1);
      expect(listA.athletes[0].athleteId).toBe(athleteA.id);
      expect(listA.athletes[0].name).toBe(athleteA.name);
    });
  });

  describe("7. Revogação de Vínculos e Preservação de Dados", () => {
    it("permite ao treinador revogar vínculo e libera a vaga para novo aluno", async () => {
      const coach = await createCoach("revoke-coach", { customAthleteLimit: 1 });
      const athlete1 = await createAthlete("ath-rev-1");
      const athlete2 = await createAthlete("ath-rev-2");

      const inv1 = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const link1 = await new AcceptCoachInvitation().execute({
        athleteId: athlete1.id,
        token: inv1.token,
      });

      // Coach revoga o vínculo com o atleta 1
      const revokeResult = await new RevokeCoachAthleteLink().execute({
        userId: coach.id,
        linkId: link1.link.id,
      });
      expect(revokeResult.success).toBe(true);

      const linkInDb = await prisma.coachAthlete.findUnique({
        where: { id: link1.link.id },
      });
      expect(linkInDb?.status).toBe("REVOKED");
      expect(linkInDb?.revokedByUserId).toBe(coach.id);
      expect(linkInDb?.revokedAt).not.toBeNull();

      // Agora a vaga foi liberada: coach pode convidar e aceitar atleta 2
      const inv2 = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const link2 = await new AcceptCoachInvitation().execute({
        athleteId: athlete2.id,
        token: inv2.token,
      });
      expect(link2.success).toBe(true);
    });

    it("permite ao atleta revogar vínculo com seu treinador", async () => {
      const coach = await createCoach("ath-revoke-c");
      const athlete = await createAthlete("ath-revoke-a");

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const link = await new AcceptCoachInvitation().execute({
        athleteId: athlete.id,
        token: inv.token,
      });

      // Atleta revoga o vínculo
      const revokeResult = await new RevokeCoachAthleteLink().execute({
        userId: athlete.id,
        linkId: link.link.id,
      });
      expect(revokeResult.success).toBe(true);

      const linkInDb = await prisma.coachAthlete.findUnique({
        where: { id: link.link.id },
      });
      expect(linkInDb?.status).toBe("REVOKED");
      expect(linkInDb?.revokedByUserId).toBe(athlete.id);
    });

    it("impede que terceiro não autorizado revogue vínculo (403)", async () => {
      const coach = await createCoach("auth-c");
      const athlete = await createAthlete("auth-a");
      const intruder = await createAthlete("intruder");

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const link = await new AcceptCoachInvitation().execute({
        athleteId: athlete.id,
        token: inv.token,
      });

      await expect(
        new RevokeCoachAthleteLink().execute({
          userId: intruder.id,
          linkId: link.link.id,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });

    it("preserva intactos os treinos individuais do atleta após revogação", async () => {
      const coach = await createCoach("preserve-c");
      const athlete = await createAthlete("preserve-a");

      // Atleta possui plano e treino próprio
      const plan = await prisma.workoutPlan.create({
        data: {
          name: "Treino Próprio do Atleta",
          userId: athlete.id,
        },
      });

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });
      const link = await new AcceptCoachInvitation().execute({
        athleteId: athlete.id,
        token: inv.token,
      });

      // Revoga o vínculo
      await new RevokeCoachAthleteLink().execute({
        userId: coach.id,
        linkId: link.link.id,
      });

      // Plano do atleta permanece intocado
      const planInDb = await prisma.workoutPlan.findUnique({
        where: { id: plan.id },
      });
      expect(planInDb).not.toBeNull();
      expect(planInDb?.userId).toBe(athlete.id);
    });
  });

  describe("8. Consulta de Relacionamento pelo Atleta (/me/coach-relationship)", () => {
    it("retorna hasCoach=true e dados do treinador quando há vínculo ativo", async () => {
      const coach = await createCoach("me-coach");
      const athlete = await createAthlete("me-athlete");

      const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });
      await new AcceptCoachInvitation().execute({ athleteId: athlete.id, token: inv.token });

      const rel = await new GetAthleteCoachRelationship().execute({ athleteId: athlete.id });
      expect(rel.hasCoach).toBe(true);
      expect(rel.relationship?.coachId).toBe(coach.id);
      expect(rel.relationship?.coachName).toBe(coach.name);
    });

    it("retorna hasCoach=false quando não há treinador vinculado ou após revogação", async () => {
      const athlete = await createAthlete("no-coach-athlete");

      const relBefore = await new GetAthleteCoachRelationship().execute({ athleteId: athlete.id });
      expect(relBefore.hasCoach).toBe(false);
      expect(relBefore.relationship).toBeNull();
    });
  });
});
