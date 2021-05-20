import {
  ActionLog,
  ActionLogID,
  AttachmentID,
  AttachmentIDReference,
  Prompt,
  PromptID,
  PromptState,
  PromptTaskID,
} from "@withorbit/core";
import { BlobLike } from "./genericHTTPAPI";
import { RequiredSpec } from "./util/requiredSpec";

// Meant to conform to genericHTTPAPI/Spec, but I can't declare conformance without running into obscure Typescript limitations.
type SpecLegacy = {
  "/taskStates": {
    GET: {
      query:
        | ({
            limit?: number;
          } & (
            | {
                createdAfterID?: PromptTaskID;
              }
            | {
                dueBeforeTimestampMillis: number;
              }
          ))
        | { ids: PromptTaskID[] };
      response: ResponseList<"taskState", PromptTaskID, PromptState>;
    };
  };

  "/taskData": {
    GET: {
      query: { ids: PromptID[] };
      response: ResponseList<"taskData", PromptID, Prompt>;
    };

    PATCH: {
      body: { id: PromptID; data: Prompt }[];
      response: void;
    };
  };

  "/attachments": {
    POST: {
      contentType: "multipart/form-data";
      body: {
        file: BlobLike;
      };
      response: ResponseObject<
        "attachmentIDReference",
        AttachmentID,
        AttachmentIDReference
      >;
    };
  };

  "/attachments/:id": {
    GET: {
      params: {
        id: AttachmentID;
      };
      response: void;
    };
  };

  /*

  POST /attachments: upload an attachment
    encode with multipart/form-data, with the file in part named "file"
    make sure to include Content-Type heading for your attachment
    returns application/json encoded ResponseObject<"attachmentIDReference", AttachmentID, AttachmentIDReference>
   */
};

export type ValidatableSpec = {
  "/actionLogs"?: {
    GET?: {
      query: {
        /**
         * @minimum 1
         * @default 100
         * @TJS-type integer
         */
        limit?: number;
        /**
         * Created After ActionLogID
         * @TJS-type string
         */
        createdAfterID?: ActionLogID;
      };
      response?: ResponseList<"actionLog", ActionLogID, ActionLog>;
    };

    PATCH?: {
      body: {
        /**
         * Created After ActionLogID
         * @TJS-type string
         */
        id: ActionLogID;
        data: ActionLog;
      }[];
      response?: null;
    };
  };
};

export type Spec = RequiredSpec<ValidatableSpec> & SpecLegacy;

export type ResponseList<
  ObjectTypeString extends string,
  IDType extends string,
  DataType
> = {
  objectType: "list";
  hasMore: boolean;
  data: ResponseObject<ObjectTypeString, IDType, DataType>[];
};

export type ResponseObject<
  ObjectType extends string,
  IDType extends string,
  DataType
> = {
  objectType: ObjectType;
  id: IDType;
  data: DataType;
};
