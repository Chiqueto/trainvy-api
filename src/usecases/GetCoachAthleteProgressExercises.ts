import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import {
  type ExerciseOutputDto,
  ListExercises,
} from "./ListExercises.js";

export interface GetCoachAthleteProgressExercisesInput {
  coachId: string;
  athleteId: string;
  query?: string;
  onlyWithHistory?: boolean;
}

export class GetCoachAthleteProgressExercises {
  async execute(input: GetCoachAthleteProgressExercisesInput): Promise<ExerciseOutputDto[]> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const listExercises = new ListExercises();
    return listExercises.execute({
      userId: authContext.athleteId,
      query: input.query,
      onlyWithHistory: input.onlyWithHistory ?? true,
      minCompletedAt: authContext.minCompletedAt,
    });
  }
}
