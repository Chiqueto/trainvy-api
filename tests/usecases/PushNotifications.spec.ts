import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db.js";
import { GetNotificationPreferences } from "../../src/usecases/GetNotificationPreferences.js";
import { ListNotifications } from "../../src/usecases/ListNotifications.js";
import { MarkAllNotificationsRead } from "../../src/usecases/MarkAllNotificationsRead.js";
import { MarkNotificationRead } from "../../src/usecases/MarkNotificationRead.js";
import { RegisterPushSubscription } from "../../src/usecases/RegisterPushSubscription.js";
import { RevokePushSubscription } from "../../src/usecases/RevokePushSubscription.js";
import { UpdateNotificationPreferences } from "../../src/usecases/UpdateNotificationPreferences.js";
import { sendPushToUser } from "../../src/services/SendPushToUser.js";

describe("Push Notifications System", () => {
  const createTestUser = async (email: string) => {
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Test Athlete",
        email,
      },
    });
  };

  it("registra uma push subscription e inicializa preferências padrão", async () => {
    const user = await createTestUser(`push-user-${Date.now()}@test.com`);
    const registerUseCase = new RegisterPushSubscription();

    const endpoint = `https://fcm.googleapis.com/fcm/send/test-token-${Date.now()}`;
    const result = await registerUseCase.execute({
      userId: user.id,
      endpoint,
      p256dh: "test-p256dh-key",
      auth: "test-auth-secret",
      userAgent: "Mozilla/5.0 Test",
    });

    expect(result.id).toBeDefined();

    const storedSub = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });
    expect(storedSub).not.toBeNull();
    expect(storedSub?.userId).toBe(user.id);
    expect(storedSub?.p256dh).toBe("test-p256dh-key");

    // Verifica se preferências foram criadas
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId: user.id },
    });
    expect(prefs).not.toBeNull();
    expect(prefs?.streakReminder).toBe(true);
    expect(prefs?.coachLinked).toBe(true);
    expect(prefs?.workoutAssigned).toBe(true);
  });

  it("permite re-inscrição idempotente no mesmo endpoint atualizando chaves", async () => {
    const user = await createTestUser(`push-idemp-${Date.now()}@test.com`);
    const registerUseCase = new RegisterPushSubscription();
    const endpoint = `https://fcm.googleapis.com/fcm/send/idemp-${Date.now()}`;

    await registerUseCase.execute({
      userId: user.id,
      endpoint,
      p256dh: "key-v1",
      auth: "auth-v1",
    });

    // Re-inscrição com chaves renovadas
    await registerUseCase.execute({
      userId: user.id,
      endpoint,
      p256dh: "key-v2",
      auth: "auth-v2",
    });

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { endpoint },
    });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.p256dh).toBe("key-v2");
    expect(subscriptions[0]?.auth).toBe("auth-v2");
  });

  it("revoga uma push subscription com garantia de ownership", async () => {
    const user1 = await createTestUser(`push-own1-${Date.now()}@test.com`);
    const user2 = await createTestUser(`push-own2-${Date.now()}@test.com`);

    const registerUseCase = new RegisterPushSubscription();
    const revokeUseCase = new RevokePushSubscription();

    const endpoint1 = `https://fcm.googleapis.com/fcm/send/user1-${Date.now()}`;
    const endpoint2 = `https://fcm.googleapis.com/fcm/send/user2-${Date.now()}`;

    await registerUseCase.execute({
      userId: user1.id,
      endpoint: endpoint1,
      p256dh: "k1",
      auth: "a1",
    });
    await registerUseCase.execute({
      userId: user2.id,
      endpoint: endpoint2,
      p256dh: "k2",
      auth: "a2",
    });

    // User1 tenta revogar endpoint2 (do User2) -> não deve apagar
    await revokeUseCase.execute({
      userId: user1.id,
      endpoint: endpoint2,
    });

    const sub2 = await prisma.pushSubscription.findUnique({
      where: { endpoint: endpoint2 },
    });
    expect(sub2).not.toBeNull();

    // User1 revoga o próprio endpoint -> deve apagar
    await revokeUseCase.execute({
      userId: user1.id,
      endpoint: endpoint1,
    });

    const sub1 = await prisma.pushSubscription.findUnique({
      where: { endpoint: endpoint1 },
    });
    expect(sub1).toBeNull();
  });

  it("gerencia preferências de notificação (obter e atualizar)", async () => {
    const user = await createTestUser(`push-prefs-${Date.now()}@test.com`);
    const getPrefs = new GetNotificationPreferences();
    const updatePrefs = new UpdateNotificationPreferences();

    const initial = await getPrefs.execute({ userId: user.id });
    expect(initial.streakReminder).toBe(true);
    expect(initial.coachLinked).toBe(true);
    expect(initial.workoutAssigned).toBe(true);

    const updated = await updatePrefs.execute({
      userId: user.id,
      streakReminder: false,
      streakReminderHour: 9,
    });
    expect(updated.streakReminder).toBe(false);
    expect(updated.streakReminderHour).toBe(9);
    expect(updated.coachLinked).toBe(true);

    const stored = await getPrefs.execute({ userId: user.id });
    expect(stored.streakReminder).toBe(false);
  });

  it("lista e marca notificações como lidas individualmente e em lote", async () => {
    const user = await createTestUser(`push-notifs-${Date.now()}@test.com`);
    const listUseCase = new ListNotifications();
    const markReadUseCase = new MarkNotificationRead();
    const markAllUseCase = new MarkAllNotificationsRead();

    // Cria duas notificações
    const n1 = await prisma.notification.create({
      data: {
        userId: user.id,
        type: "STREAK_REMINDER",
        title: "Sequência em risco!",
        body: "Bora treinar hoje?",
      },
    });

    const n2 = await prisma.notification.create({
      data: {
        userId: user.id,
        type: "COACH_LINKED",
        title: "Novo treinador!",
        body: "Carlos é seu novo coach.",
      },
    });

    const list1 = await listUseCase.execute({ userId: user.id, limit: 10 });
    expect(list1.notifications).toHaveLength(2);
    expect(list1.unreadCount).toBe(2);

    // Marca a primeira como lida
    await markReadUseCase.execute({ userId: user.id, id: n1.id });

    const list2 = await listUseCase.execute({ userId: user.id, limit: 10 });
    expect(list2.unreadCount).toBe(1);

    // Marca todas como lidas
    const allResult = await markAllUseCase.execute({ userId: user.id });
    expect(allResult.count).toBe(1);

    const list3 = await listUseCase.execute({ userId: user.id, limit: 10 });
    expect(list3.unreadCount).toBe(0);
  });

  it("respeita preferências do usuário e não envia push quando o tipo está desativado", async () => {
    const user = await createTestUser(`push-optout-${Date.now()}@test.com`);
    const updatePrefs = new UpdateNotificationPreferences();

    // Desativa lembrete de streak
    await updatePrefs.execute({
      userId: user.id,
      streakReminder: false,
    });

    const result = await sendPushToUser({
      userId: user.id,
      type: "STREAK_REMINDER",
      title: "Teste",
      body: "Não deve enviar",
    });

    expect(result).toBeNull();

    // Notificação não deve ter sido persistida
    const stored = await prisma.notification.findMany({
      where: { userId: user.id },
    });
    expect(stored).toHaveLength(0);
  });
});

