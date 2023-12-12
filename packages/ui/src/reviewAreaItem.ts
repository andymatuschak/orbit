import {
  ComponentIDsOf,
  Task,
  TaskContent,
  TaskID,
  TaskProvenance,
} from "@withorbit/core";
import { colors } from "./styles/index.js";

export interface ReviewAreaItem<TC extends TaskContent = TaskContent> {
  taskID: TaskID;
  spec: Task<TC>["spec"];
  componentID: ComponentIDsOf<TC>;

  provenance: TaskProvenance | null;
  colorPalette: colors.ColorPalette;
}
