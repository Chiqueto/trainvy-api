export function prescriptionApprovalMode(p: {
  approvedAt: Date | null;
  approvedVersion: number | null;
  version: number;
  approvedByUserId: string | null;
  coachId: string;
  approvedSnapshot: unknown;
}): "VERIFIED" | "TEST" | "UNVERIFIED" {
  if (
    !p.approvedAt ||
    p.approvedVersion !== p.version ||
    p.approvedByUserId !== p.coachId ||
    !p.approvedSnapshot
  )
    return "UNVERIFIED";
  const snapshot = p.approvedSnapshot;
  if (typeof snapshot !== "object" || Array.isArray(snapshot))
    return "UNVERIFIED";
  return "verificationMode" in snapshot && snapshot.verificationMode === "TEST"
    ? "TEST"
    : "VERIFIED";
}
