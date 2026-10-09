import {
  AttachmentID,
  encodeUUIDBytesToWebSafeBase64ID,
  mainTaskComponentID,
  parseSingleCurlyBraceClozePromptMarkup,
  TaskContent,
  TaskContentField,
  TaskContentType,
  TaskID,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import type {
  EmbeddedReviewItemSeed,
  EmbeddedScreenRecord,
  EmbeddedTaskSeed,
} from "@withorbit/embedded-support";
import { OrbitPromptElement } from "./OrbitPromptElement.js";
import { v5 as uuidV5 } from "uuid";
import fastJSONStableStringify from "fast-json-stable-stringify";

export interface ExtractedEmbeddedItems extends EmbeddedScreenRecord {
  /** Publisher-private sources. Never include these URLs in iframe messages. */
  attachmentIDsToURLs: Record<string, string>;
}

export function extractItems(
  parentElement: HTMLElement,
): ExtractedEmbeddedItems {
  const tasks: EmbeddedTaskSeed[] = [];
  const reviewItems: EmbeddedReviewItemSeed[] = [];
  const attachmentIDsToURLs: { [AttachmentID: string]: string } = {};
  console.log("children", parentElement.outerHTML);
  const children = parentElement.children;
  for (let i = 0; i < children.length; i++) {
    const element = children.item(i)!;
    if (element.tagName !== "ORBIT-PROMPT") {
      continue;
    }

    const { content, attachmentIDsToURLs: elementAttachmentMap } =
      extractContent(element as OrbitPromptElement);
    const spec: TaskSpec = {
      type: TaskSpecType.Memory,
      content,
    };
    const taskID = generateTaskIDForSpec(spec);
    tasks.push({ taskID, spec });
    reviewItems.push({
      taskID,
      componentID: getComponentIDForEmbeddedReview(content),
    });

    if (elementAttachmentMap) {
      for (const [attachmentID, url] of elementAttachmentMap) {
        attachmentIDsToURLs[attachmentID] = url;
      }
    }
  }
  return {
    tasks,
    reviewItems,
    attachmentIDs: Object.keys(attachmentIDsToURLs) as AttachmentID[],
    attachmentIDsToURLs,
  };
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

function extractContent(element: OrbitPromptElement): {
  content: TaskContent;
  attachmentIDsToURLs: Map<AttachmentID, string> | null;
} {
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
        const id = generateAttachmentIDForURL(url);
        attachmentIDsToURLs.set(id, url);
        attachments.push(id);
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
    };
  }
}

// We generate consistent IDs for embedded attachments and tasks based on their content (URL and TaskSpec JSON data). With this strategy, a user can read an article on multiple machines without acquiring duplicate prompts.
function generateAttachmentIDForURL(url: string): AttachmentID {
  const bytes = new Uint8Array(16);
  uuidV5(url, uuidV5.URL, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes) as AttachmentID;
}

const orbitEmbeddedTaskNamespaceUUID = "354182c0-33a8-4763-bbad-960bf679b4a1";

export function generateTaskIDForSpec(spec: TaskSpec): TaskID {
  const bytes = new Uint8Array(16);
  uuidV5(fastJSONStableStringify(spec), orbitEmbeddedTaskNamespaceUUID, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes) as TaskID;
}
