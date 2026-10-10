import type { CriterionRating } from "../_lib/types";

/** Share of positive ratings whose evidence quote was verified verbatim in the (redacted) CV. */
export function traceabilityOf(ratings: CriterionRating[]) {
  const claims = ratings.filter((r) => r.rating > 0);
  if (!claims.length) return 1;
  return claims.filter((r) => r.evidenceFound).length / claims.length;
}
