import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertAdmin: vi.fn(), findMany: vi.fn() }));
vi.mock("../src/lib/db.js", () => ({prisma: {exercise: {findMany: mocks.findMany}}}));
vi.mock("../src/lib/require-admin.js", () => ({assertAdminUser: mocks.assertAdmin}));
import { ListAdminExercises } from "../src/usecases/ListAdminExercises.js";

beforeEach(() => vi.resetAllMocks());
describe("Administrative exercise catalog", () => {
  it("rejects non-admins before reading the catalog", async () => {
    mocks.assertAdmin.mockRejectedValue(new Error("ADMIN_REQUIRED"));
    await expect(new ListAdminExercises().execute("athlete")).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("only reads global exercises and active media, preserving each ID", async () => {
    mocks.assertAdmin.mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValue([{id: "exercise", name: "Movement", isUnilateral: false, updatedAt: new Date("2026-10-27"), muscles: [], media: [{mediaType: "IMAGE_SEQUENCE", startImagePath: null, endImagePath: null, motionPath: null, instructions: {description: " "}}]}]);
    const rows = await new ListAdminExercises().execute("admin");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({where: {ownerUserId: null}, include: {muscles: true, media: {where: {isActive: true}}}}));
    expect(rows[0]).toMatchObject({id: "exercise", family: null, muscles: [], media: [{hasImages: false,hasMotion: false,hasInstructions: false}]});
  });
});
