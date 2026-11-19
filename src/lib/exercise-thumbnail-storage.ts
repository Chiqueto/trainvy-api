import { AwsClient } from "aws4fetch";

export function createExerciseThumbnailStorage(config = process.env) {
  const bucket = config.EXERCISE_THUMBNAILS_S3_BUCKET?.trim();
  const endpoint = config.AWS_ENDPOINT_URL_S3?.trim();
  const region = config.AWS_REGION?.trim();
  const accessKeyId = config.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = config.AWS_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey)
    return null;

  const base = new URL(endpoint);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)
  ) {
    throw new Error("Invalid exercise thumbnail S3 endpoint or bucket");
  }

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: "s3",
    sessionToken: config.AWS_SESSION_TOKEN?.trim() || undefined,
  });

  function objectUrl(key: string) {
    const url = new URL(base);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const prefix = base.pathname.replace(/\/+$/, "");
    if (config.EXERCISE_THUMBNAILS_S3_PATH_STYLE === "false") {
      url.hostname = bucket + "." + url.hostname;
      url.pathname = prefix + "/" + encodedKey;
    } else {
      url.pathname = prefix + "/" + bucket + "/" + encodedKey;
    }
    return url;
  }

  return {
    async put(key: string, body: Uint8Array<ArrayBuffer>) {
      const url = objectUrl(key);
      const response = await client.fetch(url, {
        method: "PUT",
        body,
        headers: {
          "content-type": "image/webp",
          "cache-control": "public, max-age=31536000, immutable",
        },
        signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel();
      if (!response.ok)
        throw new Error(
          `S3 upload failed for ${key} (HTTP ${response.status})`,
        );
      return url.href;
    },
    async signRead(key: string) {
      const url = objectUrl(key);
      url.searchParams.set("X-Amz-Expires", "300");
      const request = await client.sign(url, { aws: { signQuery: true } });
      return request.url;
    },
  };
}
