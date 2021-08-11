import { parse as uuidParse, v5 as uuidV5 } from "uuid";
import { EntityID } from "../entity";
import { EventID } from "../event";
import { encodeUUIDBytesToWebSafeBase64ID } from "../generateUniqueID";

let _orbitMigratedCore1TaskNamespaceUUID: ArrayLike<number> | null = null;

export function convertCore1ID<ID extends EntityID | EventID>(
  input: string,
): ID {
  if (!_orbitMigratedCore1TaskNamespaceUUID) {
    _orbitMigratedCore1TaskNamespaceUUID = uuidParse(
      "a430c93f-60dc-4799-b2a6-df402ff941a5",
    );
  }

  const bytes = new Uint8Array(16);
  uuidV5(input, _orbitMigratedCore1TaskNamespaceUUID, bytes);
  return encodeUUIDBytesToWebSafeBase64ID(bytes);
}
