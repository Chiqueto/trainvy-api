import Fastify, { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { coachRoutes } from "../../src/routes/coach.js";

describe("Coach & Athlete HTTP Routes", () => {
  let app: FastifyInstance;
  let coachUser: { id: string; email: string; name: string };
  let athleteUser: { id: string; email: string; name: string };

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachRoutes);
    await app.ready();

    // Cria plano com entitlement
    const plan = await prisma.plan.create({
      data: {
        code: `ROUTE_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Route Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 4990,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 5 },
          ],
        },
      },
    });

    coachUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Route Coach",
        email: `route-coach-${Date.now()}@coach.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachUser.id,
        planId: plan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 4990,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    athleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Route Athlete",
        email: `route-ath-${Date.now()}@athlete.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /coach/invitations — retorna 401 para requisição sem autenticação", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null as any);

    const response = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("POST /coach/invitations — cria convite com status 201 quando autenticado", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: { expiresInDays: 7 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.token).toBeDefined();
    expect(body.expiresAt).toBeDefined();
  });

  it("GET /coach/invitations/preview/:token — retorna 200 e preview público sem exigir auth", async () => {
    // Cria convite primeiro
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });
    const { token } = createRes.json();

    const previewRes = await app.inject({
      method: "GET",
      url: `/coach/invitations/preview/${token}`,
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.isValid).toBe(true);
    expect(preview.coach.id).toBe(coachUser.id);
  });

  it("POST /coach/invitations/accept — atleta aceita convite com 200", async () => {
    // Cria convite
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });
    const { token } = createRes.json();

    // Atleta aceita
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const acceptRes = await app.inject({
      method: "POST",
      url: "/coach/invitations/accept",
      payload: { token },
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = acceptRes.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.link.status).toBe("ACTIVE");
  });

  it("GET /me/coach-relationship — retorna o treinador ativo do atleta", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: "/me/coach-relationship",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.hasCoach).toBe(true);
    expect(body.relationship.coachId).toBe(coachUser.id);
  });

  it("GET /coach/athletes — treinador lista seus alunos ativos", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: "/coach/athletes",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.activeCount).toBe(1);
    expect(body.athletes.length).toBe(1);
    expect(body.athletes[0].athleteId).toBe(athleteUser.id);
  });

  it("DELETE /me/coach-relationship/:linkId — atleta encerra vínculo com sucesso", async () => {
    // Pega o link atual
    const link = await prisma.coachAthlete.findFirst({
      where: { athleteId: athleteUser.id, status: "ACTIVE" },
    });
    expect(link).not.toBeNull();

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "DELETE",
      url: `/me/coach-relationship/${link!.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    const linkAfter = await prisma.coachAthlete.findUnique({
      where: { id: link!.id },
    });
    expect(linkAfter?.status).toBe("REVOKED");
  });
});
