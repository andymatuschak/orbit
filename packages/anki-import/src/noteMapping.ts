import {
  AttachmentID,
  parseSingleCurlyBraceClozePromptMarkup,
  TaskContent,
  TaskContentField,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import { Note, splitAnkiDBNoteFields } from "./ankiPkg/index.js";
import { AnkiAttachmentReference } from "./ankiPkg/ankiAttachmentReference.js";
import parseAnkiField from "./ankiPkg/parseAnkiField.js";
import { convertAnkiID } from "./convertAnkiID.js";
import { ModelMapping, ModelMappingType } from "./modelMapping.js";

export function mapNoteToTaskSpec(
  note: Note,
  modelMapping: ModelMapping,
): {
  spec: TaskSpec;
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

  function transformAttachmentReferences(
    attachmentReferences: AnkiAttachmentReference[],
  ): AttachmentID[] {
    return attachmentReferences.map((ref) => convertAnkiID(ref.name));
  }

  function transformQAAnkiField(field: string): TaskContentField {
    const { contentsMarkdown, attachmentReferences } = parseAnkiField(field);
    return {
      text: contentsMarkdown,
      attachments: transformAttachmentReferences(attachmentReferences),
    };
  }

  let content: TaskContent;
  switch (modelMapping.type) {
    case ModelMappingType.Basic:
      checkForDroppedFields([
        modelMapping.questionFieldIndex,
        modelMapping.answerFieldIndex,
      ]);

      content = {
        type: TaskContentType.QA,
        body: transformQAAnkiField(fields[modelMapping.questionFieldIndex]),
        answer: transformQAAnkiField(fields[modelMapping.answerFieldIndex]),
      };
      break;

    case ModelMappingType.Cloze:
      checkForDroppedFields([modelMapping.contentsFieldIndex]);
      const { contentsMarkdown, attachmentReferences } = parseAnkiField(
        fields[modelMapping.contentsFieldIndex],
      );
      // TODO: parse Anki order and hint specifiers
      const { markupWithoutBraces, clozeComponents } =
        parseSingleCurlyBraceClozePromptMarkup(contentsMarkdown);
      content = {
        type: TaskContentType.Cloze,
        body: {
          text: markupWithoutBraces,
          attachments: transformAttachmentReferences(attachmentReferences),
        },
        components: clozeComponents,
      };
  }

  return {
    spec: {
      type: TaskSpecType.Memory,
      content,
    },
    issues,
  };
}
