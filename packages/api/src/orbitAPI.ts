import {
  AttachmentMIMEType,
  Event,
  EntityID,
  EventID,
  Task,
  TaskID,
  AttachmentID,
} from "@withorbit/core";
import { BlobLike } from "./genericHTTPAPI.js";
import { RequiredSpec } from "./util/requiredSpec.js";

// Meant to conform to genericHTTPAPI/Spec, but I can't declare conformance without running into obscure Typescript limitations.
export type ValidatableSpec = {
  "/events"?: {
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
        afterID?: EventID;
        /**
         * When set, only events with matching `entityID` will be returned.
         */
        entityID?: EntityID;
      };
      response?: ResponseList<Event>;
    };

    PATCH?: {
      contentType: "application/json";
      body: Event[];
      response?: null;
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
      response?: BlobLike<AttachmentMIMEType>;
    };

    /**
     * encode with multipart/form-data, with the file in part named "file"
     * make sure to include Content-Type heading for your attachment
     */
    POST?: {
      // NOTE: Content-type must use regex to be validated since additional data,
      // like the form-data length, is usually appended to the MIME type
      /**
       * @TJS-type string
       * @TJS-pattern ^multipart/form-data
       */
      contentType: "multipart/form-data";
      params: {
        id: AttachmentID;
      };
      body: {
        file: BlobLike<AttachmentMIMEType>;
      };
      response?: null;
    };
  };

  /**
   * This API adds attachments to a user's collection by downloading them from URLs. It also adds corresponding AttachmentIngestEvents to the user's store using the metadata from the downloaded resources. It's used in the embedded interface.
   */
  "/attachments/ingestFromURLs"?: {
    POST?: {
      contentType: "application/json";
      body: {
        id: AttachmentID;
        url: string;
      }[];
      response?: null;
    };
  };

  "/tasks/bulkGet"?: {
    POST?: {
      contentType: "application/json";
      body: TaskID[];
      response?: ResponseList<Task>;
    };
  };
};

export type Spec = RequiredSpec<ValidatableSpec>;

export type ResponseList<ItemType> = {
  type: "list";
  hasMore: boolean;
  items: ItemType[];
};
