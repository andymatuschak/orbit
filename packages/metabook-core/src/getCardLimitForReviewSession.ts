export default function getCardLimitForReviewSession(
  sessionNumber: number,
): number {
  return sessionNumber === 0 ? 25 : 50;
}
