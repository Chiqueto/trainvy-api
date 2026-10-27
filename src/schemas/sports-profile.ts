import z from "zod";
export const sportsProfileShape = {
  trainingGoals: z.string().trim().max(1000).nullable(),
  experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
  availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
  trainingRestrictions: z.string().trim().max(2000).nullable(),
};
export const SportsProfileResponse = z.object(sportsProfileShape);
export const SportsProfileBody = SportsProfileResponse.partial().strict();
