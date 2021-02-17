import {
  ActionLog,
  ActionLogID,
  PromptState,
  PromptTaskID,
} from "metabook-core";

// Meant to conform to genericHTTPAPI/Spec, but I can't declare conformance without running into obscure Typescript limitations.
export type Spec = {
  "/taskStates": {
    GET: {
      query:
        | {
            limit?: number;
            createdAfterID?: string;
            dueBeforeTimestampMillis?: number;
          }
        | { ids: string[] };
      response: ResponseList<"taskState", PromptTaskID, PromptState>;
    };
  };

  "/actionLogs": {
    GET: {
      query: {
        limit?: number;
        createdAfterID?: ActionLogID;
      };
      response: ResponseList<"actionLog", ActionLogID, ActionLog>;
    };

    PATCH: {
      body: { id: ActionLogID; data: ActionLog }[];
      response: void;
    };
  };
};

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
