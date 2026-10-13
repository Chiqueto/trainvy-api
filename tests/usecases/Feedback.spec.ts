import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db.js";
import { CreateFeedback } from "../../src/usecases/CreateFeedback.js";

describe("Feedback System (Task 5.1)", () => {
  const createTestUser = async (email: string) => {
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Beta Tester",
        email,
      },
    });
  };

  it("persiste feedback com sucesso associado ao usuário autenticado", async () => {
    const user = await createTestUser(`feedback-user-${Date.now()}@test.com`);
    const useCase = new CreateFeedback();

    const result = await useCase.execute({
      userId: user.id,
      category: "BUG",
      message: "Encontrei uma lentidão ao abrir o cronômetro de descanso.",
    });

    expect(result.id).toBeDefined();

    const stored = await prisma.feedback.findUnique({
      where: { id: result.id },
    });
    expect(stored).toBeDefined();
    expect(stored?.userId).toBe(user.id);
    expect(stored?.category).toBe("BUG");
    expect(stored?.message).toBe(
      "Encontrei uma lentidão ao abrir o cronômetro de descanso.",
    );
  });

  it("bloqueia mensagens com menos de 5 caracteres", async () => {
    const user = await createTestUser(`feedback-short-${Date.now()}@test.com`);
    const useCase = new CreateFeedback();

    await expect(
      useCase.execute({
        userId: user.id,
        category: "SUGGESTION",
        message: "oi",
      }),
    ).rejects.toThrow();
  });

  it("aplica proteção anti-spam limitando envios por hora", async () => {
    const user = await createTestUser(`feedback-spam-${Date.now()}@test.com`);
    const useCase = new CreateFeedback();

    // 5 feedbacks enviados
    for (let i = 1; i <= 5; i++) {
      await useCase.execute({
        userId: user.id,
        category: "SUGGESTION",
        message: `Sugestão número ${i} para melhoria do app.`,
      });
    }

    // 6º envio no mesmo período deve ser bloqueado
    await expect(
      useCase.execute({
        userId: user.id,
        category: "SUGGESTION",
        message: "Mais uma sugestão excessiva.",
      }),
    ).rejects.toThrow(
      "Você enviou muitos feedbacks recentemente. Aguarde um momento antes de enviar outro.",
    );
  });
});
