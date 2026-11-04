import { prisma } from "../lib/db.js";
import { webpush } from "../lib/web-push.js";

export interface SendPushParams {
  userId: string;
  title: string;
  body: string;
  type: string;
  url?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUser({
  userId,
  title,
  body,
  type,
  url = "/",
  data,
}: SendPushParams) {
  // 1. Checar preferências do usuário
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
  });

  const prefMap: Record<string, string> = {
    STREAK_REMINDER: "streakReminder",
    COACH_LINKED: "coachLinked",
    WORKOUT_ASSIGNED: "workoutAssigned",
  };

  const prefKey = prefMap[type];
  if (prefs && prefKey && (prefs as Record<string, unknown>)[prefKey] === false) {
    return null;
  }

  // 2. Persistir notificação no banco
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: { url, ...data },
    },
  });

  // 3. Buscar subscriptions ativas
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return notification;

  // 4. Enviar push via web-push
  const payload = JSON.stringify({
    title,
    body,
    url,
    type,
    notificationId: notification.id,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  // 5. Cleanup subscriptions expiradas (410 Gone / 404 Not Found)
  const deletions: Promise<unknown>[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        deletions.push(
          prisma.pushSubscription
            .delete({
              where: { id: subscriptions[i].id },
            })
            .catch(() => {})
        );
      }
    }
  }
  if (deletions.length > 0) {
    await Promise.allSettled(deletions);
  }

  return notification;
}

