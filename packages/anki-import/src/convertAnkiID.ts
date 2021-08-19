import {
  encodeUUIDBytesToWebSafeBase64ID,
  EntityID,
  EventID,
} from "@withorbit/core";
import { parse as uuidParse, v5 as uuidV5 } from "uuid";

let _orbitAnkiImportNamespaceUUID: ArrayLike<number> | null = null;

// Generate a consistent Orbit ID (a v5 instead of v4 UUID) from an Anki ID.
export function convertAnkiID<ID extends EntityID | EventID>(
  input: string,
): ID {
  if (!_orbitAnkiImportNamespaceUUID) {
    _orbitAnkiImportNamespaceUUID = uuidParse(
      "a430c93f-60dc-4799-b2a6-df402ff941a5",
    );
  }

  const bytes = new Uint8Array(16);
  uuidV5(input, _orbitAnkiImportNamespaceUUID, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes);
}
