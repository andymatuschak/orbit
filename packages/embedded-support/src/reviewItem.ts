import { ComponentIDsOf, Task, TaskContent } from "@withorbit/core2";

export interface ReviewItem<TC extends TaskContent = TaskContent> {
  task: Task<TC>;
  componentID: ComponentIDsOf<TC>;
}
