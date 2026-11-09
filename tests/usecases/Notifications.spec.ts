import { beforeEach, describe, expect, it, vi } from "vitest";

const { notification, pushSubscription, notificationPreferences, webpush } =
  vi.hoisted(() => ({
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    notificationPreferences: { findUnique: vi.fn() },
    pushSubscription: { findMany: vi.fn(), delete: vi.fn() },
    webpush: { sendNotification: vi.fn() },
  }));
vi.mock("../../src/lib/db.js", () => ({
  prisma: { notification, pushSubscription, notificationPreferences },
}));
vi.mock("../../src/lib/web-push.js", () => ({ webpush }));

import { ListNotifications } from "../../src/usecases/ListNotifications.js";
import { MarkNotificationRead } from "../../src/usecases/MarkNotificationRead.js";
import { MarkAllNotificationsRead } from "../../src/usecases/MarkAllNotificationsRead.js";
import {
  createUserNotification,
  deliverUserNotification,
  sendPushToUser,
} from "../../src/services/SendPushToUser.js";

const item = (id: string) => ({
  id,
  userId: "owner",
  type: "WORKOUT_ASSIGNED",
  title: "Novo treino",
  body: "Confira",
  data: { url: "/planning" },
  readAt: null,
  sentAt: new Date("2026-11-09T12:00:00Z"),
});
beforeEach(() => vi.resetAllMocks());

describe("notification inbox", () => {
  it("uses the last returned item as cursor without skipping the lookahead item", async () => {
    notification.findMany
      .mockResolvedValueOnce([item("c"), item("b"), item("a")])
      .mockResolvedValueOnce([item("a")]);
    notification.count.mockResolvedValue(3);
    const first = await new ListNotifications().execute({
      userId: "owner",
      limit: 2,
    });
    expect(first.notifications.map((n) => n.id)).toEqual(["c", "b"]);
    expect(first.nextCursor).toBe("b");
    const second = await new ListNotifications().execute({
      userId: "owner",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.notifications.map((n) => n.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
    expect(notification.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: "owner" },
        cursor: { id: "b" },
        skip: 1,
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(notification.count).toHaveBeenCalledWith({
      where: { userId: "owner", readAt: null },
    });
  });

  it("does not allow marking another user's notification", async () => {
    notification.findFirst.mockResolvedValue(null);
    await expect(
      new MarkNotificationRead().execute({ userId: "other", id: "private" }),
    ).rejects.toThrow("Notificação não encontrada");
    expect(notification.findFirst).toHaveBeenCalledWith({
      where: { id: "private", userId: "other" },
    });
    expect(notification.updateMany).not.toHaveBeenCalled();
  });

  it("preserves the first read timestamp and scopes every write to the owner", async () => {
    notification.findFirst.mockResolvedValue(item("mine"));
    notification.updateMany.mockResolvedValue({ count: 1 });
    await new MarkNotificationRead().execute({ userId: "owner", id: "mine" });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { id: "mine", userId: "owner", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    await new MarkAllNotificationsRead().execute({ userId: "owner" });
    expect(notification.updateMany).toHaveBeenLastCalledWith({
      where: { userId: "owner", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("persists inbox notifications even without push subscriptions", async () => {
    notificationPreferences.findUnique.mockResolvedValue(null);
    notification.create.mockResolvedValue(item("saved"));
    pushSubscription.findMany.mockResolvedValue([]);
    expect(
      await sendPushToUser({
        userId: "owner",
        type: "WORKOUT_ASSIGNED",
        title: "Novo treino",
        body: "Confira",
        url: "/planning",
      }),
    ).toEqual(item("saved"));
    expect(notification.create).toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("creates through the supplied transaction and honors preferences", async () => {
    const tx = {
      notification: { create: vi.fn() },
      notificationPreferences: {
        findUnique: vi.fn().mockResolvedValue({ workoutAssigned: false }),
      },
    };
    const result = await createUserNotification(
      {
        userId: "owner",
        type: "WORKOUT_ASSIGNED",
        title: "Novo treino",
        body: "Confira",
      },
      tx as never,
    );
    expect(result).toBeNull();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(notification.create).not.toHaveBeenCalled();
  });

  it("removes expired push subscriptions while preserving the inbox", async () => {
    pushSubscription.findMany.mockResolvedValue([
      {
        id: "expired",
        endpoint: "https://push.example.test",
        p256dh: "fake",
        auth: "fake",
      },
    ]);
    webpush.sendNotification.mockRejectedValue({ statusCode: 410 });
    pushSubscription.delete.mockResolvedValue({});
    expect(await deliverUserNotification(item("saved"))).toEqual(item("saved"));
    expect(pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: "expired" },
    });
  });
});
