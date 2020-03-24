export interface CardState {
  dueTime: number; // TODO adapt from Firebase timestamp
  interval: number;
  bestInterval: number | null;
  needsRetry: boolean;
  orderSeed: number;
}
