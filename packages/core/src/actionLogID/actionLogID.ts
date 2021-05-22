import {
  ActionLog,
  ActionLogMetadata,
  BaseActionLog,
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "../types/actionLog";
import {
  WebPromptProvenance,
  PromptProvenanceType,
} from "../types/promptProvenance";
import { TaskMetadata, TaskProvenance } from "../types/taskMetadata";
import CID from "multiformats/cid";
import {
  CIDEncodable,
  encodeObjectToCIDString,
  encodeObjectToCIDStringSync,
} from "../util/cids";
import { getPromptTaskForID, PromptTaskID } from "../types/promptTask";
import {
  qaPromptType,
  clozePromptType,
  applicationPromptType,
} from "../types/prompt";

function canonicalizeProvenance(
  provenance: TaskProvenance,
): CIDEncodable<TaskProvenance> {
  function canonicalizeBaseProvenance(
    provenance: TaskProvenance,
  ): CIDEncodable<TaskProvenance> {
    return {
      provenanceType: provenance.provenanceType,
      externalID: provenance.externalID,
      modificationTimestampMillis: provenance.modificationTimestampMillis,
      title: provenance.title,
      url: provenance.url,
    };
  }

  switch (provenance.provenanceType) {
    case PromptProvenanceType.Anki:
    case PromptProvenanceType.Note:
      return canonicalizeBaseProvenance(provenance);
    case PromptProvenanceType.Web:
      const webProvenance = provenance as WebPromptProvenance;
      return {
        ...canonicalizeBaseProvenance(provenance),
        siteName: webProvenance.siteName,
        colorPaletteName: webProvenance.colorPaletteName,
      } as CIDEncodable<TaskProvenance>;
  }
}

function canonicalizeActionLog(actionLog: ActionLog): CIDEncodable<ActionLog> {
  function canonicalizeBaseActionLog(
    base: BaseActionLog,
  ): CIDEncodable<BaseActionLog> {
    return {
      timestampMillis: base.timestampMillis,
      taskID: base.taskID,
    };
  }

  function canonicalizeTaskParameters(
    taskID: string,
    taskParameters: ActionLogMetadata,
  ): CIDEncodable<ActionLogMetadata> {
    const promptTask = getPromptTaskForID(taskID as PromptTaskID);
    if (promptTask instanceof Error) {
      throw new Error(`Unexpected action log taskID: ${taskID}: ${promptTask}`);
    }
    switch (promptTask.promptType) {
      case qaPromptType:
      case clozePromptType:
        throw new Error(
          `Prompt type ${promptTask.promptType} should not have task parameters (${taskParameters})`,
        );
      case applicationPromptType:
        return { variantIndex: taskParameters.variantIndex };
    }
  }

  function canonicalizeParentActionLogIDs<
    T extends ActionLog & { parentActionLogIDs: ActionLogID[] }
  >(actionLog: T): CIDEncodable<ActionLogID[]> {
    return actionLog.parentActionLogIDs.map((id) => CID.parse(id));
  }

  function canonicalizeMetadata<T extends Partial<TaskMetadata>>(
    metadata: T,
    // This return type should really be CIDEncodable<T>, but TypeScript can't figure it out. This isn't safe.
  ): Partial<CIDEncodable<TaskMetadata>> {
    return {
      ...(metadata.isDeleted && { isDeleted: metadata.isDeleted }),
      ...(metadata.provenance && { provenance: metadata.provenance }),
    };
  }

  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      return {
        ...canonicalizeBaseActionLog(actionLog),
        actionLogType: actionLog.actionLogType,
        provenance: actionLog.provenance
          ? canonicalizeProvenance(actionLog.provenance)
          : null,
      };

    case repetitionActionLogType:
      return {
        ...canonicalizeBaseActionLog(actionLog),
        actionLogType: actionLog.actionLogType,
        parentActionLogIDs: canonicalizeParentActionLogIDs(actionLog),
        taskParameters: actionLog.taskParameters
          ? canonicalizeTaskParameters(
              actionLog.taskID,
              actionLog.taskParameters,
            )
          : null,
        outcome: actionLog.outcome,
        context: actionLog.context,
      };

    case rescheduleActionLogType:
      return {
        ...canonicalizeBaseActionLog(actionLog),
        actionLogType: actionLog.actionLogType,
        parentActionLogIDs: canonicalizeParentActionLogIDs(actionLog),
        newTimestampMillis: actionLog.newTimestampMillis,
      };

    case updateMetadataActionLogType:
      return {
        ...canonicalizeBaseActionLog(actionLog),
        actionLogType: actionLog.actionLogType,
        parentActionLogIDs: canonicalizeParentActionLogIDs(actionLog),
        updates: canonicalizeMetadata(actionLog.updates),
      };
  }
}

// without creating a boxed type the typescript-json-schema will not
// generate the correct type
interface BoxActionLogID {
  id: string & { __actionLogIDOpaqueType: never };
}

/**
 * @TJS-type string
 */
export type ActionLogID = BoxActionLogID["id"];

export async function getIDForActionLog(
  actionLog: ActionLog,
): Promise<ActionLogID> {
  return (await encodeObjectToCIDString(
    canonicalizeActionLog(actionLog),
  )) as ActionLogID;
}

export function getIDForActionLogSync(actionLog: ActionLog): ActionLogID {
  return encodeObjectToCIDStringSync(
    canonicalizeActionLog(actionLog),
  ) as ActionLogID;
}
