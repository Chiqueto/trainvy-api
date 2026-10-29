import {
  assertProfessionalAccess,
  type ProfessionalAccess,
} from "./professional-verification.js";
import { hasEntitlement } from "./commercial.js";

export class CoachPrescriptionError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 404 | 409 | 422 = 400,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CoachPrescriptionError";
  }
}

export interface CoachCommercialContext {
  crefVerificationRequired?: boolean;
  professionalVerification?: ProfessionalAccess | null;
  accountType: string;
  accountSetupCompletedAt: string | null;
  entitlements: { key: string; limitValue: number | null }[];
}

export interface PrescriptionExercisePayload {
  name: string;
  order: number;
  sets: number;
  warmupSets: number;
  reps: number;
  repsMin?: number | null;
  repsMax?: number | null;
  targetRir?: number | null;
  targetLoadInGrams?: number | null;
  tempo?: string | null;
  restTimeInSeconds: number;
  exerciseId?: string | null;
  alternative1ExerciseId?: string | null;
  alternative1ExerciseName?: string | null;
  alternative2ExerciseId?: string | null;
  alternative2ExerciseName?: string | null;
}

export interface PrescriptionDayPayload {
  name: string;
  order: number;
  weekDay:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  isRest: boolean;
  estimatedDurationInSeconds: number;
  coverImageUrl?: string | null;
  exercises: PrescriptionExercisePayload[];
}

export interface PrescriptionPayload {
  workoutDays: PrescriptionDayPayload[];
}

export function assertCoachCanPrescribe(context: CoachCommercialContext): void {
  if (context.accountType !== "COACH") {
    throw new CoachPrescriptionError(
      "ONLY_COACHES_ALLOWED",
      403,
      "Apenas contas do tipo treinador (COACH) podem prescrever treinos.",
    );
  }

  if (!context.accountSetupCompletedAt) {
    throw new CoachPrescriptionError(
      "ACCOUNT_SETUP_REQUIRED",
      403,
      "Conclua a configuração inicial da sua conta antes de prescrever treinos.",
    );
  }

  assertProfessionalAccess(
    context.professionalVerification,
    context.crefVerificationRequired,
  );

  // @ts-expect-error key type conversion
  if (!hasEntitlement(context, "ASSIGN_WORKOUTS")) {
    throw new CoachPrescriptionError(
      "ASSIGN_WORKOUTS_ENTITLEMENT_REQUIRED",
      403,
      "Seu plano atual não possui permissão ativa para prescrever treinos (ASSIGN_WORKOUTS).",
    );
  }
}
