import { CoachAthleteError } from "./coach-athlete.js";

const formats: Record<
  string,
  { extensions: string[]; magic: (b: Buffer) => boolean }
> = {
  "application/pdf": {
    extensions: ["pdf"],
    magic: (b) => b.subarray(0, 5).toString() === "%PDF-",
  },
  "image/png": {
    extensions: ["png"],
    magic: (b) =>
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  "image/jpeg": {
    extensions: ["jpg", "jpeg"],
    magic: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  "image/webp": {
    extensions: ["webp"],
    magic: (b) =>
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  "audio/webm": {
    extensions: ["webm"],
    magic: (b) => b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
  },
  "audio/ogg": {
    extensions: ["ogg"],
    magic: (b) => b.toString("ascii", 0, 4) === "OggS",
  },
  "audio/wav": {
    extensions: ["wav"],
    magic: (b) =>
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WAVE",
  },
  "audio/mpeg": {
    extensions: ["mp3"],
    magic: (b) =>
      b.toString("ascii", 0, 3) === "ID3" ||
      (b[0] === 255 && (b[1] & 224) === 224),
  },
  "audio/mp4": {
    extensions: ["m4a", "mp4"],
    magic: (b) => b.toString("ascii", 4, 8) === "ftyp",
  },
};

export function validateAiUpload(input: {
  fileUrl?: string;
  mediaType?: string;
  filename?: string;
}) {
  if (!input.fileUrl && !input.mediaType && !input.filename) return undefined;
  const fail = () => {
    throw new CoachAthleteError(
      "INVALID_UPLOAD",
      400,
      "Arquivo inválido. Use PDF, imagem ou áudio de até 10 MB com extensão e tipo correspondentes.",
    );
  };
  const type = input.mediaType?.split(";")[0].toLowerCase();
  const format = type ? formats[type] : undefined;
  if (
    !input.fileUrl ||
    input.fileUrl.length > 14_000_000 ||
    !format ||
    !input.filename ||
    !format.extensions.includes(
      input.filename.split(".").pop()?.toLowerCase() ?? "",
    )
  )
    return fail();
  const match =
    /^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      input.fileUrl,
    );
  if (!match || match[1].toLowerCase() !== type || match[2].length % 4 !== 0)
    return fail();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024 || !format.magic(bytes))
    return fail();
  // Embedded active PDF content is not needed for workout transcription.
  if (
    type === "application/pdf" &&
    /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/.test(
      bytes.toString("latin1"),
    )
  )
    return fail();
  return { type: type!, bytes };
}
