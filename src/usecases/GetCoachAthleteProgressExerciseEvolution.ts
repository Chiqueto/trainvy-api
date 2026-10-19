import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import {
  GetExerciseEvolution,
  type GetExerciseEvolutionOutput,
} from "./GetExerciseEvolution.js";

export interface GetCoachAthleteProgressExerciseEvolutionInput {
  coachId: string;
  athleteId: string;
  exerciseId: string;
  cursor?: string;
  limit?: number;
}

export class GetCoachAthleteProgressExerciseEvolution {
  async execute(input: GetCoachAthleteProgressExerciseEvolutionInput): Promise<GetExerciseEvolutionOutput> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const getEvolution = new GetExerciseEvolution();
    return getEvolution.execute({
      userId: authContext.athleteId,
      exerciseId: input.exerciseId,
      cursor: input.cursor,
      limit: input.limit,
      minCompletedAt: authContext.minCompletedAt,
    });
  }
}
