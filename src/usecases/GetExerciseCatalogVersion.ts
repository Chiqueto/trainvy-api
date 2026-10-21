import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export interface ExerciseCatalogVersionOutput {
  version: string;
  count: number;
  lastUpdatedAt: string | null;
}

export class GetExerciseCatalogVersion {
  async execute(dto: InputDto): Promise<ExerciseCatalogVersionOutput> {
    const aggregate = await prisma.exercise.aggregate({
      where: {
        OR: [{ ownerUserId: null }, { ownerUserId: dto.userId }],
      },
      _count: {
        id: true,
      },
      _max: {
        updatedAt: true,
      },
    });

    const count = aggregate._count.id;
    const maxUpdatedAt = aggregate._max.updatedAt;
    const timestamp = maxUpdatedAt ? maxUpdatedAt.getTime() : 0;
    const version = `v${count}-${timestamp}`;

    return {
      version,
      count,
      lastUpdatedAt: maxUpdatedAt ? maxUpdatedAt.toISOString() : null,
    };
  }
}
