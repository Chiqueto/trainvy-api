import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import {
  GetWorkoutHistorySession,
  type GetWorkoutHistorySessionOutputDto,
} from "./GetWorkoutHistorySession.js";

export interface GetCoachAthleteProgressSessionDetailInput {
  coachId: string;
  athleteId: string;
  sessionId: string;
}

export class GetCoachAthleteProgressSessionDetail {
  async execute(input: GetCoachAthleteProgressSessionDetailInput): Promise<GetWorkoutHistorySessionOutputDto> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const getSession = new GetWorkoutHistorySession();
    return getSession.execute({
      userId: authContext.athleteId,
      sessionId: input.sessionId,
      minCompletedAt: authContext.minCompletedAt,
    });
  }
}
