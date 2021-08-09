import { Task, TaskContent, TaskProvenance } from "@withorbit/core2";
import { colors } from "./styles";

export interface ReviewAreaItem<TC extends TaskContent = TaskContent> {
  componentID: string;
  spec: Task<TC>["spec"];

  provenance: TaskProvenance | null;
  colorPalette: colors.ColorPalette;
}
