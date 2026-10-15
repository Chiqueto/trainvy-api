import type {
  MuscleAnalyticsResponse,
  WeeklyAnalyticsResponse,
} from "../schemas/index.js";
import { AuthorizeCoachAthleteProgressAccess } from "./AuthorizeCoachAthleteProgressAccess.js";
import { GetMuscleTrainingAnalytics } from "./GetMuscleTrainingAnalytics.js";
import { GetWeeklyTrainingAnalytics } from "./GetWeeklyTrainingAnalytics.js";

export interface GetCoachAthleteProgressOverviewInput {
  coachId: string;
  athleteId: string;
  tz: string;
  weeksCount?: number;
}

export interface CoachAthleteProgressSummary {
  totalWorkouts: number;
  weeklyFrequency: number;
  totalWorkingSets: number;
  totalLoadVolumeKg: number;
  averageDurationInSeconds: number;
}

export interface GetCoachAthleteProgressOverviewOutput {
  athlete: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  range: {
    weeksCount: number;
    startDate: string;
    endDate: string;
  };
  weekly: WeeklyAnalyticsResponse;
  muscles: MuscleAnalyticsResponse;
  summary: CoachAthleteProgressSummary;
}

export class GetCoachAthleteProgressOverview {
  async execute(input: GetCoachAthleteProgressOverviewInput): Promise<GetCoachAthleteProgressOverviewOutput> {
    const authContext = await new AuthorizeCoachAthleteProgressAccess().execute({
      coachId: input.coachId,
      athleteId: input.athleteId,
    });

    const getWeekly = new GetWeeklyTrainingAnalytics();
    const weeklyResult = await getWeekly.execute({
      userId: authContext.athleteId,
      tz: input.tz,
      weeksCount: input.weeksCount,
      minCompletedAt: authContext.minCompletedAt,
    });

    const getMuscles = new GetMuscleTrainingAnalytics();
    const muscleResult = await getMuscles.execute({
      userId: authContext.athleteId,
      tz: input.tz,
      startDate: weeklyResult.startDate,
      endDate: weeklyResult.endDate,
      minCompletedAt: authContext.minCompletedAt,
    });

    const weeksCount = input.weeksCount ?? (weeklyResult.weeks.length || 4);
    const totals = weeklyResult.weeks.reduce(
      (acc, week) => ({
        totalWorkouts: acc.totalWorkouts + week.workoutsCompleted,
        totalWorkingSets: acc.totalWorkingSets + week.workingSets,
        totalLoadVolumeKg: acc.totalLoadVolumeKg + week.loadVolumeKg,
        totalDurationInSeconds: acc.totalDurationInSeconds + week.totalDurationInSeconds,
      }),
      {
        totalWorkouts: 0,
        totalWorkingSets: 0,
        totalLoadVolumeKg: 0,
        totalDurationInSeconds: 0,
      },
    );

    const weeklyFrequency = Number((totals.totalWorkouts / weeksCount).toFixed(1));
    const averageDurationInSeconds =
      totals.totalWorkouts > 0 ? Math.round(totals.totalDurationInSeconds / totals.totalWorkouts) : 0;

    return {
      athlete: authContext.athlete,
      range: {
        weeksCount,
        startDate: weeklyResult.startDate,
        endDate: weeklyResult.endDate,
      },
      weekly: weeklyResult,
      muscles: muscleResult,
      summary: {
        totalWorkouts: totals.totalWorkouts,
        weeklyFrequency,
        totalWorkingSets: totals.totalWorkingSets,
        totalLoadVolumeKg: totals.totalLoadVolumeKg,
        averageDurationInSeconds,
      },
    };
  }
}
