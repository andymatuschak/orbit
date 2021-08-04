import {
  ActionLog,
  ActionLogID,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  Prompt,
  PromptID,
  PromptState,
  PromptTaskID,
} from "@withorbit/core";
import * as core2 from "@withorbit/core2";
import { BlobLike } from "./genericHTTPAPI";
import { RequiredSpec } from "./util/requiredSpec";

// Meant to conform to genericHTTPAPI/Spec, but I can't declare conformance without running into obscure Typescript limitations.
export type ValidatableSpec = {
  "/taskStates"?: {
    GET?: {
      query:
        | ({
            /**
             * @minimum 1
             * @TJS-type integer
             */
            limit?: number;
          } & (
            | {
                createdAfterID?: PromptTaskID;
              }
            | {
                /**
                 * @TJS-type integer
                 */
                dueBeforeTimestampMillis: number;
              }
          ))
        | { ids: PromptTaskID[] };
      response?: ResponseList<"taskState", PromptTaskID, PromptState>;
    };
  };

  "/actionLogs"?: {
    GET?: {
      query: {
        /**
         * @minimum 1
         * @default 100
         * @TJS-type integer
         */
        limit?: number;
        createdAfterID?: ActionLogID;
      };
      response?: ResponseList<"actionLog", ActionLogID, ActionLog>;
    };

    PATCH?: {
      contentType: "application/json";
      body: {
        id: ActionLogID;
        data: ActionLog;
      }[];
      response?: null;
    };
  };

  "/taskData"?: {
    GET?: {
      query: { ids: PromptID[] };
      response?: ResponseList<"taskData", PromptID, Prompt>;
    };
    PATCH?: {
      contentType: "application/json";
      body: { id: PromptID; data: Prompt }[];
      response?: null;
    };
  };

  "/attachments"?: {
    /**
     * encode with multipart/form-data, with the file in part named "file"
     * make sure to include Content-Type heading for your attachment
     * returns application/json encoded ResponseObject<"attachmentIDReference", AttachmentID, AttachmentIDReference>
     */
    POST?: {
      // NOTE: Content-type must use regex to be validated since ince additional data,
      // like the form-data length, is usually appended to the MIME type
      /**
       * @TJS-type string
       * @TJS-pattern ^multipart/form-data
       */
      contentType: "multipart/form-data";
      body: {
        file: FileUploadBlob;
      };
      response?: ResponseObject<
        "attachmentIDReference",
        AttachmentID,
        AttachmentIDReference
      >;
    };
  };

  "/attachments/:id"?: {
    GET?: {
      // allow empty to indicate it takes no query values
      // eslint-disable-next-line @typescript-eslint/ban-types
      query: {};
      params: {
        id: AttachmentID;
      };
      response?: null;
    };
  };

  "/2/events"?: {
    GET?: {
      query: {
        /**
         * @minimum 1
         * @default 100
         * @TJS-type integer
         */
        limit?: number;
        /**
         * Events are returned in an arbitrary stable order. When `afterID` is set, only events after that event's ID in the stable order will be returned. You can combine this parameter with `limit` to page through results.
         */
        afterID?: core2.EventID;
        /**
         * When set, only events with matching `entityID` will be returned.
         */
        entityID?: core2.EntityID;
      };
      response?: ResponseList2<core2.Event>;
    };

    PATCH?: {
      contentType: "application/json";
      body: core2.Event[];
      response?: null;
    };
  };

  "/2/attachments/:id"?: {
    GET?: {
      // allow empty to indicate it takes no query values
      // eslint-disable-next-line @typescript-eslint/ban-types
      query: {};
      params: {
        id: core2.AttachmentID;
      };
      // Issues a redirect to the attachment contents.
      response?: null;
    };
  };
};

/**
 * @additionalProperties true
 */
export interface FileUploadBlob extends BlobLike {
  type: AttachmentMimeType;
  /**
   * File must be less than 10mb in size
   * @minimum 0
   * @maximum 10000000
   * @TJS-type integer
   */
  size: number;
}

export type Spec = RequiredSpec<ValidatableSpec>;

export type ResponseList<
  ObjectTypeString extends string,
  IDType extends string,
  DataType,
> = {
  objectType: "list";
  hasMore: boolean;
  data: ResponseObject<ObjectTypeString, IDType, DataType>[];
};

export type ResponseList2<ItemType> = {
  type: "list";
  hasMore: boolean;
  items: ItemType[];
};

export type ResponseObject<
  ObjectType extends string,
  IDType extends string,
  DataType,
> = {
  objectType: ObjectType;
  /**
   * @TJS-type string
   */
  id: IDType;
  data: DataType;
};
