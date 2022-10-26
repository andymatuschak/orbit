import {
  AttachmentID,
  encodeUUIDBytesToWebSafeBase64ID,
  EntityType,
  mainTaskComponentID,
  parseSingleCurlyBraceClozePromptMarkup,
  ReviewItem,
  Task,
  TaskComponentState,
  TaskContent,
  TaskContentField,
  TaskContentType,
  TaskID,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import { EmbeddedScreenRecord } from "@withorbit/embedded-support";
import { OrbitPromptElement } from "./OrbitPromptElement";
import { v5 as uuidV5, parse as uuidParse } from "uuid";
import fastJSONStableStringify from "fast-json-stable-stringify";

export function extractItems(parentElement: HTMLElement): EmbeddedScreenRecord {
  const reviewItems: ReviewItem[] = [];
  const attachmentIDsToURLs: { [AttachmentID: string]: string } = {};
  parentElement
    .querySelectorAll<OrbitPromptElement>(":scope > orbit-prompt")
    .forEach((element) => {
      const content = extractContent(element);
      // TODO: validate content.externalID... shouldn't be repeats, etc
      reviewItems.push(
        generateTaskReviewItem(content.content, content.externalID),
      );

      if (content.attachmentIDsToURLs) {
        for (const [attachmentID, url] of content.attachmentIDsToURLs) {
          attachmentIDsToURLs[attachmentID] = url;
        }
      }
    });
  return { reviewItems, attachmentIDsToURLs };
}

function generateInitialComponentStates(content: TaskContent) {
  const now = Date.now();
  const initialComponentState: TaskComponentState = {
    dueTimestampMillis: now,
    intervalMillis: 0,
    createdAtTimestampMillis: now,
    lastRepetitionTimestampMillis: null,
  };
  switch (content.type) {
    case TaskContentType.QA:
    case TaskContentType.Plain:
      return { [mainTaskComponentID]: initialComponentState };
    case TaskContentType.Cloze:
      return Object.fromEntries(
        Object.keys(content.components).map((id) => [
          id,
          initialComponentState,
        ]),
      );
  }
}

function getComponentIDForEmbeddedReview(content: TaskContent): string {
  switch (content.type) {
    case TaskContentType.QA:
    case TaskContentType.Plain:
      return mainTaskComponentID;
    case TaskContentType.Cloze:
      // They'll review the first cloze deletion.
      const entries = Object.entries(content.components);
      entries.sort((a, b) => a[1].order - b[1].order);
      return entries[0][0];
  }
}

export function generateTaskReviewItem(
  content: TaskContent,
  externalID: string | null,
): ReviewItem {
  const spec: TaskSpec = {
    type: TaskSpecType.Memory,
    content,
  };

  if (externalID && !/^[0-9a-zA-Z_\-]{22}$/.test(externalID)) {
    throw new Error(`Invalid external ID: ${externalID}`);
  }

  const task: Task = {
    type: EntityType.Task,
    id: externalID
      ? // HACK probably not actually how we want to do this
        (externalID as TaskID)
      : generateTaskIDForSpec(spec),
    spec,
    // TODO consider moving provenance generation from `app` to here.
    provenance: null, // Will be generated in the app
    createdAtTimestampMillis: Date.now(),
    componentStates: generateInitialComponentStates(content),
    isDeleted: false,
    // HACK: This isn't the way I'd like to store this. Think about this more carefully.
    metadata: externalID
      ? {
          externalID,
        }
      : {},
  };
  return {
    task,
    componentID: getComponentIDForEmbeddedReview(content),
  };
}

function extractContent(element: OrbitPromptElement): {
  content: TaskContent;
  externalID: string | null;
  attachmentIDsToURLs: Map<AttachmentID, string> | null;
} {
  const externalID = element.id ? element.id : null;
  const clozeMarkup = element.getAttribute("cloze");
  if (clozeMarkup) {
    const { markupWithoutBraces, clozeComponents } =
      parseSingleCurlyBraceClozePromptMarkup(clozeMarkup);
    return {
      content: {
        type: TaskContentType.Cloze,
        body: {
          text: markupWithoutBraces,
          attachments: [], // TODO define this API,
        },
        components: clozeComponents,
      },
      attachmentIDsToURLs: null,
      externalID,
    };
  } else {
    const attachmentIDsToURLs = new Map<AttachmentID, string>();
    function extractContentField(
      textAttributeName: string,
      attachmentAttributeName: string,
    ): TaskContentField {
      const text = element.getAttribute(textAttributeName);
      if (text === null) {
        throw new Error(
          `Prompt is missing ${textAttributeName}: ${element.outerHTML}`,
        );
      }

      const attachments: AttachmentID[] = [];
      const attachmentURLs =
        element.getAttribute(attachmentAttributeName)?.split(";") ?? [];
      for (const url of attachmentURLs) {
        const attachmentID = generateAttachmentIDForURL(url);
        attachmentIDsToURLs.set(attachmentID, url);
        attachments.push(attachmentID);
      }
      return {
        text,
        attachments,
      };
    }

    return {
      content: {
        type: TaskContentType.QA,
        body: extractContentField("question", "question-attachments"),
        answer: extractContentField("answer", "answer-attachments"),
      },
      attachmentIDsToURLs,
      externalID,
    };
  }
}

// We generate consistent IDs for embedded attachments and tasks based on their content (URL and TaskSpec JSON data). With this strategy, a user can read an article on multiple machines without acquiring duplicate prompts.
function generateAttachmentIDForURL(url: string): AttachmentID {
  const bytes = new Uint8Array(16);
  uuidV5(url, uuidV5.URL, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes) as AttachmentID;
}

let _orbitEmbeddedTaskNamespaceUUID: ArrayLike<number> | null = null;

function generateTaskIDForString(input: string): TaskID {
  if (!_orbitEmbeddedTaskNamespaceUUID) {
    _orbitEmbeddedTaskNamespaceUUID = uuidParse(
      "354182c0-33a8-4763-bbad-960bf679b4a1",
    );
  }
  const bytes = new Uint8Array(16);
  uuidV5(input, _orbitEmbeddedTaskNamespaceUUID, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes) as TaskID;
}

function generateTaskIDForSpec(spec: TaskSpec): TaskID {
  return generateTaskIDForString(fastJSONStableStringify(spec));
}
