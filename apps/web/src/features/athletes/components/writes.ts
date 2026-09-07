/**
 * What a tracking table gets back from a write.
 *
 * The three tables — nutrition, biofeedback, cycle — take their writes as props
 * rather than importing them, which is what lets one component serve both the
 * coach's page and the athlete portal without either side's authorization being
 * loosened to fit the other (§21). This is the shape they agree on, and it is
 * deliberately the smallest one that works: either something went wrong and
 * there is a sentence to show, or nothing did.
 */
export interface WriteOutcome {
  readonly message?: string | undefined;
}
