import { randomUUID, createHmac, createHash } from "node:crypto";
import { prisma } from "../../src/lib/db.js";
import { cleanupTestUsers } from "../helpers/test-db.js";
import { declareTestProfessional } from "../helpers/declared-professional.js";

if (process.env.NODE_ENV !== "test")
  throw new Error(
    "E2E fixtures require NODE_ENV=test and an isolated TEST_DATABASE_URL.",
  );
const roles = [
  "coach",
  "basic",
  "pending",
  "athlete",
  "other",
  "admin",
] as const;
try {
  if (process.argv[2] === "cleanup") {
    const ids = process.argv.slice(3, 9);
    const planIds = process.argv.slice(9);
    await prisma.workoutPrescription.deleteMany({
      where: { coachId: { in: ids } },
    });
    await cleanupTestUsers(ids);
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  } else {
    const plans = await Promise.all(
      [true, false].map((ai) =>
        prisma.plan.create({
          data: {
            code: `E2E_${randomUUID()}`,
            name: ai ? "Piloto IA E2E" : "Piloto E2E",
            audience: "COACH",
            monthlyPriceInCents: 0,
            entitlements: {
              create: [
                { entitlement: "MANAGE_ATHLETES", limitValue: 5 },
                { entitlement: "ASSIGN_WORKOUTS" },
                { entitlement: "VIEW_ATHLETE_HISTORY" },
                ...(ai
                  ? [
                      { entitlement: "AI_CHAT" as const, limitValue: 8 },
                      {
                        entitlement: "AI_PLAN_GENERATION" as const,
                        limitValue: 8,
                      },
                    ]
                  : []),
              ],
            },
          },
        }),
      ),
    );
    const users: Record<string, { id: string; cookie: string }> = {};
    for (const role of roles) {
      const coach = ["coach", "basic", "pending"].includes(role);
      const user = await prisma.user.create({
        data: {
          id: randomUUID(),
          name: `Piloto E2E ${role}`,
          email: `${randomUUID()}@pilot-e2e.test`,
          accountType: coach ? "COACH" : "ATHLETE",
          systemRole: role === "admin" ? "ADMIN" : "USER",
          accountSetupCompletedAt: new Date(),
          birthDate: new Date("1990-01-01"),
          weightInGrams: 70000,
          heightInCentimeters: 170,
          age: 36,
          trainingGoals: "Organizar treinos",
          ...(coach
            ? {
                professionalRegistration: {
                  create: {
                    fullName: `Piloto E2E ${role}`,
                    cref: "000000-G",
                    region: "SP",
                    category: "Bacharel",
                  },
                },
              }
            : {}),
          ...(role === "coach" || role === "basic"
            ? {
                subscription: {
                  create: {
                    planId: plans[role === "coach" ? 0 : 1].id,
                    status: "TRIALING",
                    trialStartedAt: new Date(),
                    trialEndsAt: new Date(Date.now() + 86400000),
                    priceInCentsSnapshot: 0,
                    currencySnapshot: "BRL",
                    billingProvider: "MANUAL",
                  },
                },
              }
            : {}),
        },
      });
      if (coach) await declareTestProfessional(user.id);
      for (const slug of [
        "termos-de-uso",
        "politica-de-privacidade",
        "termo-saude-parq-lgpd",
      ]) {
        const doc = await prisma.legalDocument.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            title: "Fixture E2E",
            category: "TEST",
            classification: "TEST",
            targetAudience: "ALL_USERS",
            version: "1.0.0",
            contentMd: "Documento fictício para testes isolados",
            requiresClickwrap: true,
          },
        });
        await prisma.userLegalAcceptance.create({
          data: {
            userId: user.id,
            documentId: doc.id,
            documentSlug: doc.slug,
            documentVersion: doc.version,
            contentHash: createHash("sha256")
              .update(doc.contentMd)
              .digest("hex"),
            ipAddress: "127.0.0.1",
            userAgent: "Playwright E2E fixture",
          },
        });
      }
      const token = randomUUID();
      await prisma.session.create({
        data: {
          id: randomUUID(),
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      users[role] = {
        id: user.id,
        cookie: encodeURIComponent(
          `${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`,
        ),
      };
    }
    await prisma.coachAthlete.create({
      data: {
        coachId: users.coach.id,
        athleteId: users.athlete.id,
        status: "ACTIVE",
        evolutionShared: true,
        evolutionSharedAt: new Date(),
        includePreviousHistory: true,
      },
    });
    await prisma.notification.create({
      data: {
        userId: users.athlete.id,
        type: "WORKOUT_ASSIGNED",
        title: "Aviso piloto E2E",
        body: "Notificação fictícia de validação",
        data: { url: "/planning" },
      },
    });
    await prisma.feedback.create({
      data: {
        userId: users.athlete.id,
        category: "QUESTION",
        message: "Feedback fictício do piloto E2E",
      },
    });
    console.log(
      JSON.stringify({ users, planIds: plans.map((plan) => plan.id) }),
    );
  }
} finally {
  await prisma.$disconnect();
}
