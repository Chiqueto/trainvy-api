import { z } from "zod";

import { prisma } from "../lib/db.js";

const schema = z.array(z.object({
  id: z.uuid(),
  name: z.string().trim().min(3).max(160),
  isUnilateral: z.boolean(),
  family: z.string().min(1),
})).min(1);

const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/** Operational import: only adds global exercises; no media or history changes. */
export class ExpandGlobalExerciseCatalog {
  async execute(input: unknown, apply: boolean) {
    const definitions = schema.parse(input);
    if (new Set(definitions.map(d => normalize(d.name))).size !== definitions.length ||
      new Set(definitions.map(d => d.id)).size !== definitions.length) {
      throw new Error("Duplicate catalog definitions");
    }
    return prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('LOCK TABLE "Exercise" IN SHARE ROW EXCLUSIVE MODE');
      const before = await tx.exercise.findMany({ orderBy: { id: "asc" } });
      const names = new Set(before.filter(e => e.ownerUserId === null).map(e => normalize(e.name)));
      const ids = new Set(before.map(e => e.id));
      const additions = definitions.filter(d => !names.has(normalize(d.name)));
      if (additions.some(d => ids.has(d.id))) throw new Error("Catalog ID collision");
      if (apply && additions.length) {
        await tx.exercise.createMany({ data: additions.map(({id, name, isUnilateral}) => ({id, name, isUnilateral, ownerUserId: null})) });
      }
      const preserved = await tx.exercise.findMany({ where: {id: {in: before.map(e => e.id)}}, orderBy: {id: "asc"} });
      if (JSON.stringify(before) !== JSON.stringify(preserved)) throw new Error("Existing exercises changed");
      const media = await tx.exerciseMedia.count({where: {exerciseId: {in: additions.map(d => d.id)}}});
      if (media) throw new Error("Unexpected media on new exercises");
      return { apply, beforeCount: before.length, added: apply ? additions.length : 0, planned: additions.length, existing: definitions.length - additions.length, afterCount: await tx.exercise.count(), newMedia: media, additions };
    }, {timeout: 60000});
  }
}
