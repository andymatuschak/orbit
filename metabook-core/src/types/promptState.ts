// Prompt states describe a user's state relative to a given *prompt* (not a prompt spec, not a task).

import { EncodedPromptID } from "../promptID";

export interface PromptState {
  dueTimestampMillis: number;
  interval: number;
  bestInterval: number | null;
  needsRetry: boolean;
}

export type PromptStates = Map<EncodedPromptID, PromptState>;
