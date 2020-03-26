export interface CardState {
  dueTimestampMillis: number;
  interval: number;
  bestInterval: number | null;
  needsRetry: boolean;
  orderSeed: number;
}
