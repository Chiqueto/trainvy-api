import { prisma } from "../lib/db.js";
import { BuilderModeSchema } from "../schemas/tactical-builder.js";

export class BuilderPreferences {
  async get(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferredBuilderMode: true },
    });
    return {
      preferredBuilderMode: BuilderModeSchema.parse(user.preferredBuilderMode),
    };
  }
  async update(userId: string, mode: "tactical" | "classic") {
    await prisma.user.update({
      where: { id: userId },
      data: { preferredBuilderMode: BuilderModeSchema.parse(mode) },
    });
    return this.get(userId);
  }
}
