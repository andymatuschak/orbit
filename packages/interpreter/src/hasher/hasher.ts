import { TaskSpec } from "@withorbit/core";

export interface Hasher {
  hash(spec: TaskSpec): string;
}
