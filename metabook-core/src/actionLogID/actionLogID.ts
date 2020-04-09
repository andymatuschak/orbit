import "buffer";
import { Buffer } from "buffer";
import CID from "cids";
import DAGPB from "ipld-dag-pb";
import multihashing from "multihashing";
import { ActionLog } from "..";
import Proto from "../generated/proto";
import {
  ingestActionLogType,
  repetitionActionLogType,
} from "../types/actionLog";

function getProtobufTimestampFromMillis(
  millis: number,
): Proto.google.protobuf.ITimestamp {
  return {
    seconds: Math.floor(millis / 1000),
    nanos: (millis % 1000) * 10e6,
  };
}

function getProtobufRepresentationForActionLog(
  actionLog: ActionLog,
): Proto.IActionLog {
  const timestamp = getProtobufTimestampFromMillis(actionLog.timestampMillis);
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      return {
        timestamp,
        ingest: {
          taskID: actionLog.taskID,
        },
      };
    case repetitionActionLogType:
      return {
        timestamp,
        repetition: {
          taskID: actionLog.taskID,
          context: actionLog.context,
          outcome: actionLog.outcome,
          taskParameters: actionLog.taskParameters,
        },
      };
  }
}

function getDAGLinksForActionLog(actionLog: ActionLog): DAGPB.DAGLink[] {
  switch (actionLog.actionLogType) {
    case "ingest":
      return [];
    case "repetition":
      return actionLog.parentActionLogIDs.map(
        (actionLogID) => new DAGPB.DAGLink(undefined, undefined, actionLogID),
      );
  }
}

export type ActionLogID = string & { __actionLogIDOpaqueType: never };

export function getIDForActionLog(actionLog: ActionLog): ActionLogID {
  // 1. Serialize the action log into a protobuf.
  const actionLogEncoding = Proto.ActionLog.encode(
    getProtobufRepresentationForActionLog(actionLog),
  ).finish();
  const actionLogBuffer =
    actionLogEncoding instanceof Buffer
      ? actionLogEncoding
      : new Buffer(actionLogEncoding);

  // 2. Wrap that data in an IPLD MerkleDAG leaf node.
  const dagNode = new DAGPB.DAGNode(
    actionLogBuffer,
    getDAGLinksForActionLog(actionLog),
  );

  // 3. Serialize the MerkleDAG node to a protobuf.
  const nodeBuffer = dagNode.serialize();

  // 4. Hash the protobuf and encode that as a CID.
  const hash = multihashing(nodeBuffer, "sha2-256");
  const cid = new CID(1, "dag-pb", hash, "base58btc");

  return cid.toString() as ActionLogID;
}
