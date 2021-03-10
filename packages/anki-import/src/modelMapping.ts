import { Collection, ModelType } from "./ankiPkg";
import * as SpacedEverything from "./spacedEverything";

export interface BasicModelMapping {
  type: ModelMappingType.Basic;
  questionFieldIndex: number;
  answerFieldIndex: number;
}

export interface ClozeModelMapping {
  type: ModelMappingType.Cloze;
  contentsFieldIndex: number;
}

export interface SpacedEverythingModelMapping {
  type:
    | ModelMappingType.SpacedEverythingQA
    | ModelMappingType.SpacedEverythingCloze;
}

export type ModelMapping =
  | BasicModelMapping
  | ClozeModelMapping
  | SpacedEverythingModelMapping;
export enum ModelMappingType {
  Basic = "basic",
  Cloze = "cloze",
  SpacedEverythingQA = "spacedEverythingQA",
  SpacedEverythingCloze = "clozeQA",
}

export function getModelMapping(
  collection: Collection,
  modelID: number,
): ModelMapping | "unknown" | "missing" {
  const model = collection.models[modelID];
  if (model) {
    if (model.type === ModelType.Standard) {
      if (model.name === SpacedEverything.qaPromptModelName) {
        return {
          type: ModelMappingType.SpacedEverythingQA,
        };
      } else {
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
      }
    } else if (model.type === ModelType.Cloze) {
      if (model.name === SpacedEverything.clozeModelName) {
        return {
          type: ModelMappingType.SpacedEverythingCloze,
        };
      } else if (model.tmpls.length === 1) {
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
      return "unknown";
    }
  } else {
    return "missing";
  }
}
