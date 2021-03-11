import {
  AttachmentIDReference,
  QAPrompt,
  qaPromptType,
  ClozePrompt,
  clozePromptType,
  NotePromptProvenance,
  Prompt,
  PromptField,
  PromptProvenanceType,
} from "@withorbit/core";
import { getOrbitPromptForITPrompt } from "@withorbit/note-sync";
import { Note, splitAnkiDBNoteFields } from "./ankiPkg";
import { AnkiAttachmentReference } from "./ankiPkg/ankiAttachmentReference";
import parseAnkiField from "./ankiPkg/parseAnkiField";
import { ModelMapping, ModelMappingType } from "./modelMapping";
import * as SpacedEverything from "./spacedEverything";

function getNotePromptProvenanceFromNoteDataField(
  noteDataField: SpacedEverything.NoteDataField,
): NotePromptProvenance {
  if (!noteDataField.externalNoteID) {
    throw new Error(
      "Can't import spaced everything note with no external note ID",
    );
  }

  if (!noteDataField.noteTitle) {
    throw new Error("Can't import spaced everything note with no title");
  }

  return {
    provenanceType: PromptProvenanceType.Note,
    externalID: noteDataField.externalNoteID.id,
    url: noteDataField.externalNoteID.openURL,
    title: noteDataField.noteTitle,
    modificationTimestampMillis: noteDataField.modificationTimestamp,
  };
}

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

    case ModelMappingType.SpacedEverythingQA:
      return {
        prompt: getOrbitPromptForITPrompt(JSON.parse(fields[6])),
        issues: [],
        provenance: getNotePromptProvenanceFromNoteDataField(
          JSON.parse(fields[5]) as SpacedEverything.NoteDataField,
        ),
      };

    case ModelMappingType.SpacedEverythingCloze:
      return {
        prompt: {
          body: { contents: fields[2], attachments: [] },
          promptType: clozePromptType,
        },
        issues: [],
        provenance: getNotePromptProvenanceFromNoteDataField(
          JSON.parse(fields[5]) as SpacedEverything.NoteDataField,
        ),
      };
  }
}
