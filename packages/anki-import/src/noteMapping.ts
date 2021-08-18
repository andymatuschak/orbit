import {
  AttachmentIDReference,
  ClozePrompt,
  clozePromptType,
  NotePromptProvenance,
  Prompt,
  PromptField,
  QAPrompt,
  qaPromptType,
} from "@withorbit/core";
import { Note, splitAnkiDBNoteFields } from "./ankiPkg";
import { AnkiAttachmentReference } from "./ankiPkg/ankiAttachmentReference";
import parseAnkiField from "./ankiPkg/parseAnkiField";
import { ModelMapping, ModelMappingType } from "./modelMapping";

export function mapNoteToPrompt(
  note: Note,
  modelMapping: ModelMapping,
  attachmentResolver: (
    ankiAttachmentReference: AnkiAttachmentReference,
  ) => AttachmentIDReference | null,
): {
  prompt: Prompt;
  provenance: NotePromptProvenance | null;
  issues: string[];
} {
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

      const qaPrompt: QAPrompt = {
        question: transformAnkiField(fields[modelMapping.questionFieldIndex]),
        answer: transformAnkiField(fields[modelMapping.answerFieldIndex]),
        promptType: qaPromptType,
      };
      return {
        issues,
        prompt: qaPrompt,
        provenance: null,
      };

    case ModelMappingType.Cloze:
      checkForDroppedFields([modelMapping.contentsFieldIndex]);

      const clozePrompt: ClozePrompt = {
        body: transformAnkiField(fields[modelMapping.contentsFieldIndex]),
        promptType: clozePromptType,
      };
      return {
        issues,
        prompt: clozePrompt,
        provenance: null,
      };
  }
}
