import {
  AttachmentIDReference,
  BasicPromptSpec,
  ClozePromptGroupSpec,
  PromptField,
  PromptSpec,
} from "metabook-core";
import { Note, splitAnkiDBNoteFields } from "./ankiPkg";
import { AnkiAttachmentReference } from "./ankiPkg/ankiAttachmentReference";
import parseAnkiField from "./ankiPkg/parseAnkiField";
import { ModelMapping, ModelMappingType } from "./modelMapping";

export function mapNoteToPromptSpec(
  note: Note,
  modelMapping: ModelMapping,
  attachmentResolver: (
    ankiAttachmentReference: AnkiAttachmentReference,
  ) => AttachmentIDReference | null,
): { promptSpec: PromptSpec; issues: string[] } {
  const fields = splitAnkiDBNoteFields(note.flds);
  const issues: string[] = [];

  function checkForDroppedFields(usedFieldIndexes: number[]) {
    fields.forEach((field, index) => {
      if (field !== "" && !usedFieldIndexes.includes(index)) {
        issues.push(
          `Note contains data in extra field which will be dropped: "${field}"`,
        );
      }
    });
  }

  function transformAnkiField(field: string): PromptField {
    const { contentsMarkdown, attachmentReferences } = parseAnkiField(field);

    const attachmentIDReferences: AttachmentIDReference[] = [];
    for (const ankiAttachmentReference of attachmentReferences) {
      const attachmentIDReference = attachmentResolver(ankiAttachmentReference);
      if (attachmentIDReference) {
        attachmentIDReferences.push(attachmentIDReference);
      } else {
        issues.push(
          `Couldn't find ${ankiAttachmentReference.type} attachment named ${ankiAttachmentReference.name}`,
        );
      }
    }
    return { contents: contentsMarkdown, attachments: attachmentIDReferences };
  }

  switch (modelMapping.type) {
    case ModelMappingType.Basic:
      checkForDroppedFields([
        modelMapping.questionFieldIndex,
        modelMapping.answerFieldIndex,
      ]);

      const basicPromptSpec: BasicPromptSpec = {
        question: transformAnkiField(fields[modelMapping.questionFieldIndex]),
        answer: transformAnkiField(fields[modelMapping.answerFieldIndex]),
        explanation: null,
        promptSpecType: "basic",
      };
      return {
        issues,
        promptSpec: basicPromptSpec,
      };

    case ModelMappingType.Cloze:
      checkForDroppedFields([modelMapping.contentsFieldIndex]);

      const clozePromptSpec: ClozePromptGroupSpec = {
        body: transformAnkiField(fields[modelMapping.contentsFieldIndex]),
        promptSpecType: "cloze",
      };
      return {
        issues,
        promptSpec: clozePromptSpec,
      };
  }
}
