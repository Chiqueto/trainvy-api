import { afterEach, describe, expect, it, vi } from "vitest";

import { createExerciseThumbnailStorage } from "./exercise-thumbnail-storage.js";

const config = {
  EXERCISE_THUMBNAILS_S3_BUCKET: "exercise-images",
  AWS_ENDPOINT_URL_S3: "https://storage.example.test",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_REGION: "us-east-2",
};

afterEach(() => vi.unstubAllGlobals());

describe("exercise thumbnail S3 storage", () => {
  it("uploads a WebP and returns an object URL without signing parameters", async () => {
    const fetch = vi.fn(async (_request: Request) => new Response(null));
    vi.stubGlobal("fetch", fetch);
    const storage = createExerciseThumbnailStorage(config)!;

    const objectUrl = await storage.put(
      "exercise-thumbnails/squat/frame.webp",
      new Uint8Array([1, 2, 3]),
    );
    expect(objectUrl).toBe(
      "https://storage.example.test/exercise-images/exercise-thumbnails/squat/frame.webp",
    );
    const request = fetch.mock.calls[0][0];
    expect(request.method).toBe("PUT");
    expect(request.headers.get("content-type")).toBe("image/webp");
    expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("signs the same key on a replacement endpoint and supports virtual host addressing", async () => {
    const storage = createExerciseThumbnailStorage({
      ...config,
      AWS_ENDPOINT_URL_S3: "https://replacement.example.test",
      EXERCISE_THUMBNAILS_S3_PATH_STYLE: "false",
    })!;
    const url = new URL(
      await storage.signRead("exercise-thumbnails/squat/frame.webp"),
    );
    expect(url.host).toBe("exercise-images.replacement.example.test");
    expect(url.pathname).toBe("/exercise-thumbnails/squat/frame.webp");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is disabled when storage credentials are absent", () => {
    expect(createExerciseThumbnailStorage({})).toBeNull();
  });
});
