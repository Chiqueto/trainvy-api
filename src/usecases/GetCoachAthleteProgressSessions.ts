import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import {
  ListWorkoutHistory,
  type ListWorkoutHistoryOutputDto,
} from "./ListWorkoutHistory.js";

export interface GetCoachAthleteProgressSessionsInput {
  coachId: string;
  athleteId: string;
  cursor?: string;
  limit?: number;
  origin?: "PLANNED" | "FREE";
}

export class GetCoachAthleteProgressSessions {
  async execute(input: GetCoachAthleteProgressSessionsInput): Promise<ListWorkoutHistoryOutputDto> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const listHistory = new ListWorkoutHistory();
    return listHistory.execute({
      userId: authContext.athleteId,
      cursor: input.cursor,
      limit: input.limit,
      origin: input.origin,
      minCompletedAt: authContext.minCompletedAt,
    });
  }
}
