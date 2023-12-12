import { Collection, ModelType } from "./ankiPkg/index.js";

export interface BasicModelMapping {
  type: ModelMappingType.Basic;
  questionFieldIndex: number;
  answerFieldIndex: number;
}

export interface ClozeModelMapping {
  type: ModelMappingType.Cloze;
  contentsFieldIndex: number;
}

export type ModelMapping = BasicModelMapping | ClozeModelMapping;
export enum ModelMappingType {
  Basic = "basic",
  Cloze = "cloze",
}

export function getModelMapping(
  collection: Collection,
  modelID: number,
): ModelMapping | "unknown" | "missing" {
  const model = collection.models[modelID];
  if (model) {
    if (model.type === ModelType.Standard) {
      const fieldNames = model.flds.map((field) => field.name);
      const questionFieldIndex = fieldNames.indexOf("Front");
      const answerFieldIndex = fieldNames.indexOf("Back");
      if (
        questionFieldIndex !== -1 &&
        answerFieldIndex !== -1 &&
        model.tmpls.length === 1
      ) {
        return {
          type: ModelMappingType.Basic,
          questionFieldIndex,
          answerFieldIndex,
        };
      } else {
        return "unknown";
      }
    } else if (model.type === ModelType.Cloze) {
      const clozeFieldMatch = model.tmpls[0].qfmt.match(/{cloze:([^}]+)}/);
      if (clozeFieldMatch) {
        const fieldName = clozeFieldMatch[1];
        const contentsFieldIndex = model.flds
          .map((field) => field.name)
          .indexOf(fieldName);
        if (contentsFieldIndex !== -1) {
          return {
            type: ModelMappingType.Cloze,
            contentsFieldIndex,
          };
        } else {
          return "unknown";
        }
      } else {
        return "unknown";
      }
    } else {
      return "unknown";
    }
  } else {
    return "missing";
  }
}
