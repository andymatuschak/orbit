import Automerge
import AutomergeRepo
import CryptoKit
import ExpoModulesCore
import Foundation
import WidgetKit

private let bridgeQueue = DispatchQueue(
  label: "com.withorbit.automerge.bridge",
  qos: .userInitiated
)

struct OrbitRepoMaterializedDocument: Sendable {
  let json: String
  let heads: [String]
  let conflictCount: Int
  let conflicts: [OrbitRepoMaterializedConflict]

  var bridgeValue: [String: Any] {
    [
      "json": json,
      "heads": heads,
      "conflictCount": conflictCount,
      "conflicts": conflicts.map(\.bridgeValue),
    ]
  }
}

struct OrbitRepoAttachment: Sendable {
  let bytes: Data
  let sha256Hex: String
  let documentURL: String
}

struct OrbitRepoMaterializedConflict: Sendable {
  let path: [String]
  let variantCount: Int

  var bridgeValue: [String: Any] {
    [
      "path": path,
      "variantCount": variantCount,
    ]
  }
}

public final class OrbitAutomergeModule: Module, @unchecked Sendable {
  private lazy var repoStore = OrbitAutomergeRepoStore(
    events: OrbitAutomergeRepoEvents(
      documentChanged: { [weak self] localStoreID, documentURL in
        DispatchQueue.main.async { [weak self] in
          self?.sendEvent(
            orbitRepoEvents.documentChanged,
            [
              "localStoreID": localStoreID,
              "documentURL": documentURL,
            ])
        }
      },
      syncStateChanged: { [weak self] localStoreID, state in
        DispatchQueue.main.async { [weak self] in
          self?.sendEvent(
            orbitRepoEvents.syncStateChanged,
            [
              "localStoreID": localStoreID,
              "state": state,
            ])
        }
      }
    )
  )

  nonisolated public func definition() -> ModuleDefinition {
    Name("OrbitAutomerge")
    Events(
      orbitRepoEvents.documentChanged,
      orbitRepoEvents.syncStateChanged
    )

    AsyncFunction("openRepo") { (localStoreID: String) async throws in
      try await repoStore.open(localStoreID: localStoreID)
    }

    AsyncFunction("closeRepo") { (localStoreID: String) async in
      await repoStore.close(localStoreID: localStoreID)
    }

    AsyncFunction("repoDocumentsExist") {
      (localStoreID: String, documentURLs: [String]) async throws -> [Bool] in
      try await repoStore.contains(
        localStoreID: localStoreID,
        documentURLs: documentURLs
      )
    }

    AsyncFunction("createRepoDocument") {
      (
        localStoreID: String,
        json: String,
        documentURL: String?
      ) async throws -> [String: Any] in
      let created = try await repoStore.create(
        localStoreID: localStoreID,
        documentURL: documentURL,
        json: json
      )
      var value = created.document.bridgeValue
      value["documentURL"] = created.documentURL
      return value
    }

    AsyncFunction("readRepoAttachment") {
      (localStoreID: String, documentURL: String) async throws -> [String: Any] in
      let attachment = try await repoStore.readAttachment(
        localStoreID: localStoreID,
        documentURL: documentURL
      )
      return [
        "bytes": attachment.bytes,
        "sha256Hex": attachment.sha256Hex,
        "documentURL": attachment.documentURL,
      ]
    }

    AsyncFunction("materializeRepoDocument") {
      (localStoreID: String, documentURL: String) async throws -> [String: Any] in
      let value = try await repoStore.materialize(
        localStoreID: localStoreID,
        documentURL: documentURL
      )
      return value.bridgeValue
    }

    AsyncFunction("repoDocumentHasHeads") {
      (
        localStoreID: String,
        documentURL: String,
        heads: [String]
      ) async throws -> Bool in
      try await repoStore.hasHeads(
        localStoreID: localStoreID,
        documentURL: documentURL,
        heads: heads
      )
    }

    AsyncFunction("materializeRepoDocuments") {
      (
        localStoreID: String,
        documentURLs: [String]
      ) async throws -> [[String: Any]] in
      try await repoStore.materialize(
        localStoreID: localStoreID,
        documentURLs: documentURLs
      ).map(\.bridgeValue)
    }

    AsyncFunction("applyRepoPatch") {
      (
        localStoreID: String,
        documentURL: String,
        patchJSON: String
      ) async throws in
      try await repoStore.applyPatch(
        localStoreID: localStoreID,
        documentURL: documentURL,
        patchJSON: patchJSON
      )
    }

    AsyncFunction("ensureRepoDocument") {
      (localStoreID: String, documentURL: String) async throws -> Bool in
      try await repoStore.ensure(
        localStoreID: localStoreID,
        documentURL: documentURL
      )
    }

    AsyncFunction("connectRepo") {
      (
        localStoreID: String,
        websocketURL: String,
        firebaseIDToken: String
      ) async throws in
      try await repoStore.connect(
        localStoreID: localStoreID,
        websocketURL: websocketURL,
        firebaseIDToken: firebaseIDToken
      )
    }

    AsyncFunction("disconnectRepo") { (localStoreID: String) async in
      await repoStore.disconnect(localStoreID: localStoreID)
    }

    OnDestroy {
      Task { [repoStore] in
        await repoStore.closeAll()
      }
    }

    AsyncFunction("replaceWidgetProjection") {
      (
        vaultID: String,
        reviewItemsJSON: String,
        revision: String
      ) throws -> Void in
      let store = try WidgetProjectionStore()
      let changed = try store.replaceProjection(
        vaultID: vaultID,
        reviewItemsJSON: reviewItemsJSON,
        revision: revision
      )
      if changed {
        WidgetCenter.shared.reloadTimelines(ofKind: "OrbitHomeScreen")
      }
    }.runOnQueue(bridgeQueue)

    AsyncFunction("pendingWidgetReviewsJSON") {
      (vaultID: String) throws -> String in
      let store = try WidgetProjectionStore()
      return try store.pendingReviewsJSON(vaultID: vaultID)
    }.runOnQueue(bridgeQueue)

    AsyncFunction("markWidgetReviewsImported") {
      (
        vaultID: String,
        observationIDs: [String],
        reviewItemsJSON: String,
        revision: String
      ) throws -> Void in
      let store = try WidgetProjectionStore()
      try store.markReviewsImported(
        vaultID: vaultID,
        observationIDs: observationIDs,
        reviewItemsJSON: reviewItemsJSON,
        revision: revision
      )
      WidgetCenter.shared.reloadTimelines(ofKind: "OrbitHomeScreen")
    }.runOnQueue(bridgeQueue)

  }
}

func initializeRepoDocument(_ document: Automerge.Document, json: String) throws {
  guard let data = json.data(using: .utf8) else {
    throw OrbitAutomergeError.invalidUTF8
  }
  let value = try JSONSerialization.jsonObject(with: data)
  guard let root = value as? [String: Any] else {
    throw OrbitAutomergeError.invalidDocumentJSON
  }
  for key in root.keys.sorted() {
    try putJSONValue(root[key]!, in: document, objectID: .ROOT, key: key)
  }
  document.commitWith(
    message: "initialize Orbit Automerge document",
    timestamp: Date(timeIntervalSince1970: 0)
  )
}

func applyDocumentPatch(
  document: Automerge.Document,
  patchJSON: String
) throws {
  guard let patchData = patchJSON.data(using: .utf8) else {
    throw OrbitAutomergeError.invalidUTF8
  }
  guard
    let operations = try JSONSerialization.jsonObject(with: patchData)
      as? [[String: Any]]
  else {
    throw OrbitAutomergeError.invalidPatch
  }
  for operation in operations {
    guard
      let kind = operation["kind"] as? String,
      let path = operation["path"] as? [String],
      let key = path.last,
      !path.isEmpty
    else {
      throw OrbitAutomergeError.invalidPatch
    }
    let parent = try objectID(
      in: document,
      at: Array(path.dropLast())
    )
    switch kind {
    case "put":
      guard let value = operation["value"] else {
        throw OrbitAutomergeError.invalidPatch
      }
      try putJSONValue(value, in: document, objectID: parent, key: key)
    case "delete":
      if try document.get(obj: parent, key: key) != nil {
        try document.delete(obj: parent, key: key)
      }
    default:
      throw OrbitAutomergeError.invalidPatch
    }
  }
  if !operations.isEmpty {
    document.commitWith(
      message: "apply Orbit vault patch",
      timestamp: Date(timeIntervalSince1970: 0)
    )
  }
}

func readRepoAttachment(_ document: Automerge.Document) throws -> OrbitRepoAttachment {
  try requireString(
    document,
    objectID: .ROOT,
    key: "documentType",
    expected: "com.withorbit.attachment"
  )
  guard
    let schemaVersion = try document.get(obj: .ROOT, key: "schemaVersion"),
    isSchemaVersionOne(schemaVersion)
  else {
    throw OrbitAutomergeError.unexpectedAttachmentSchema
  }
  guard
    case .Scalar(.Bytes(let attachmentBytes))? = try document.get(
      obj: .ROOT,
      key: "bytes"
    )
  else {
    throw OrbitAutomergeError.missingAttachmentBytes
  }
  let digest = Data(SHA256.hash(data: attachmentBytes))
  // DocumentId's upstream encoder preserves these 16 content-derived bytes;
  // UUID is just the byte-sized identifier carrier, not a new random identity.
  let id = DocumentId(UUID(uuid: digest.withUnsafeBytes {
    $0.loadUnaligned(as: uuid_t.self)
  }))
  return OrbitRepoAttachment(
    bytes: attachmentBytes,
    sha256Hex: digest.map { String(format: "%02x", $0) }.joined(),
    documentURL: "automerge:\(id.description)"
  )
}

private func isSchemaVersionOne(_ value: Value) -> Bool {
  switch value {
  case .Scalar(.Int(1)), .Scalar(.Uint(1)), .Scalar(.F64(1)):
    return true
  default:
    return false
  }
}

private func objectID(
  in document: Automerge.Document,
  at path: [String]
) throws -> ObjId {
  var objectID = ObjId.ROOT
  for component in path {
    guard
      case .Object(let next, .Map)? = try document.get(
        obj: objectID,
        key: component
      )
    else {
      throw OrbitAutomergeError.invalidPatchPath
    }
    objectID = next
  }
  return objectID
}

private func putJSONValue(
  _ value: Any,
  in document: Automerge.Document,
  objectID: ObjId,
  key: String
) throws {
  if let dictionary = value as? [String: Any] {
    if dictionary.count == 1,
      let encoded = dictionary["$bytesBase64"] as? String,
      let bytes = Data(base64Encoded: encoded)
    {
      try document.put(obj: objectID, key: key, value: .Bytes(bytes))
      return
    }
    let child = try document.putObject(obj: objectID, key: key, ty: .Map)
    for childKey in dictionary.keys.sorted() {
      try putJSONValue(
        dictionary[childKey]!,
        in: document,
        objectID: child,
        key: childKey
      )
    }
    return
  }
  if let array = value as? [Any] {
    let child = try document.putObject(obj: objectID, key: key, ty: .List)
    for (index, entry) in array.enumerated() {
      try insertJSONValue(
        entry,
        in: document,
        objectID: child,
        index: UInt64(index)
      )
    }
    return
  }
  try document.put(
    obj: objectID,
    key: key,
    value: try scalarValue(value)
  )
}

private func insertJSONValue(
  _ value: Any,
  in document: Automerge.Document,
  objectID: ObjId,
  index: UInt64
) throws {
  if let dictionary = value as? [String: Any] {
    if dictionary.count == 1,
      let encoded = dictionary["$bytesBase64"] as? String,
      let bytes = Data(base64Encoded: encoded)
    {
      try document.insert(obj: objectID, index: index, value: .Bytes(bytes))
      return
    }
    let child = try document.insertObject(obj: objectID, index: index, ty: .Map)
    for childKey in dictionary.keys.sorted() {
      try putJSONValue(
        dictionary[childKey]!,
        in: document,
        objectID: child,
        key: childKey
      )
    }
    return
  }
  if let array = value as? [Any] {
    let child = try document.insertObject(obj: objectID, index: index, ty: .List)
    for (childIndex, entry) in array.enumerated() {
      try insertJSONValue(
        entry,
        in: document,
        objectID: child,
        index: UInt64(childIndex)
      )
    }
    return
  }
  try document.insert(
    obj: objectID,
    index: index,
    value: try scalarValue(value)
  )
}

private func scalarValue(_ value: Any) throws -> ScalarValue {
  if value is NSNull { return .Null }
  if let string = value as? String { return .String(string) }
  if let number = value as? NSNumber {
    if CFGetTypeID(number) == CFBooleanGetTypeID() {
      return .Boolean(number.boolValue)
    }
    let double = number.doubleValue
    guard double.isFinite else {
      throw OrbitAutomergeError.invalidDocumentJSON
    }
    return .F64(double)
  }
  throw OrbitAutomergeError.invalidDocumentJSON
}

func materializeRepoDocument(
  _ document: Automerge.Document
) throws -> OrbitRepoMaterializedDocument {
  var conflictCount = 0
  var conflicts: [OrbitRepoMaterializedConflict] = []
  let materialized = try materialize(
    document: document,
    objectID: .ROOT,
    objectType: .Map,
    path: [],
    conflictCount: &conflictCount,
    conflicts: &conflicts
  )
  // This is a transient bridge projection, not persisted canonical JSON.
  // Sorting every catalog key here has no semantic value to callers.
  let json = try JSONSerialization.data(withJSONObject: materialized)
  guard let jsonString = String(data: json, encoding: .utf8) else {
    throw OrbitAutomergeError.invalidUTF8
  }
  return OrbitRepoMaterializedDocument(
    json: jsonString,
    heads: sortedHeads(document),
    conflictCount: conflictCount,
    conflicts: conflicts
  )
}

private func requireString(
  _ document: Automerge.Document,
  objectID: ObjId,
  key: String,
  expected: String
) throws {
  guard
    case .Scalar(.String(let value))? = try document.get(
      obj: objectID,
      key: key
    ),
    value == expected
  else {
    throw OrbitAutomergeError.unexpectedDocumentType
  }
}

private func materialize(
  document: Automerge.Document,
  value: Value,
  path: [String],
  conflictCount: inout Int,
  conflicts: inout [OrbitRepoMaterializedConflict]
) throws -> Any {
  switch value {
  case .Object(let objectID, let objectType):
    return try materialize(
      document: document,
      objectID: objectID,
      objectType: objectType,
      path: path,
      conflictCount: &conflictCount,
      conflicts: &conflicts
    )
  case .Scalar(let scalar):
    return materialize(scalar: scalar)
  }
}

private func materialize(
  document: Automerge.Document,
  objectID: ObjId,
  objectType: ObjType,
  path: [String],
  conflictCount: inout Int,
  conflicts: inout [OrbitRepoMaterializedConflict]
) throws -> Any {
  switch objectType {
  case .Map:
    var result: [String: Any] = [:]
    for key in document.keys(obj: objectID).sorted() {
      let variants = try document.getAll(obj: objectID, key: key)
      conflictCount += max(0, variants.count - 1)
      if variants.count > 1 {
        conflicts.append(materializedConflict(path: path + [key], variants: variants))
      }
      // getAll already retrieved the visible value when there is no conflict.
      // Avoid another Swift-to-Rust lookup for every ordinary catalog entry.
      let visible =
        try variants.count == 1
        ? variants.first
        : document.get(obj: objectID, key: key)
      guard let visible else {
        continue
      }
      result[key] = try materialize(
        document: document,
        value: visible,
        path: path + [key],
        conflictCount: &conflictCount,
        conflicts: &conflicts
      )
    }
    return result
  case .List:
    var result: [Any] = []
    for index in 0..<document.length(obj: objectID) {
      let variants = try document.getAll(obj: objectID, index: index)
      conflictCount += max(0, variants.count - 1)
      if variants.count > 1 {
        conflicts.append(materializedConflict(path: path + [String(index)], variants: variants))
      }
      let visible =
        try variants.count == 1
        ? variants.first
        : document.get(obj: objectID, index: index)
      guard let visible else {
        result.append(NSNull())
        continue
      }
      result.append(
        try materialize(
          document: document,
          value: visible,
          path: path + [String(index)],
          conflictCount: &conflictCount,
          conflicts: &conflicts
        ))
    }
    return result
  case .Text:
    return try document.text(obj: objectID)
  }
}

private func materializedConflict(
  path: [String],
  variants: Set<Value>
) -> OrbitRepoMaterializedConflict {
  return OrbitRepoMaterializedConflict(
    path: path,
    variantCount: variants.count
  )
}

private func materialize(scalar: ScalarValue) -> Any {
  switch scalar {
  case .Bytes(let data):
    return ["$bytesBase64": data.base64EncodedString()]
  case .String(let value):
    return value
  case .Uint(let value):
    return NSNumber(value: value)
  case .Int(let value):
    return NSNumber(value: value)
  case .F64(let value):
    return NSNumber(value: value)
  case .Counter(let value):
    return NSNumber(value: value)
  case .Timestamp(let value):
    return NSNumber(value: value.timeIntervalSince1970 * 1_000)
  case .Boolean(let value):
    return NSNumber(value: value)
  case .Unknown(let typeCode, let data):
    return [
      "$unknownScalarType": NSNumber(value: typeCode),
      "$bytesBase64": data.base64EncodedString(),
    ]
  case .Null:
    return NSNull()
  }
}

private func sortedHeads(_ document: Automerge.Document) -> [String] {
  document.heads().map(\.debugDescription).sorted()
}

/// Check ancestry without exporting or scanning the document's full history.
func orbitDocumentHasHeads(
  _ document: Automerge.Document,
  heads: [String]
) throws -> Bool {
  for head in heads {
    let hex = Array(head.utf8)
    guard hex.count == 64 else { throw OrbitAutomergeError.invalidChangeHash }
    var bytes = Data()
    for offset in stride(from: 0, to: hex.count, by: 2) {
      guard
        let pair = String(bytes: hex[offset..<offset + 2], encoding: .utf8),
        let byte = UInt8(pair, radix: 16)
      else {
        throw OrbitAutomergeError.invalidChangeHash
      }
      bytes.append(byte)
    }
    guard let hash = bytes.heads()?.first else { throw OrbitAutomergeError.invalidChangeHash }
    if document.change(hash: hash) == nil { return false }
  }
  return true
}

private enum OrbitAutomergeError: String, LocalizedError {
  case invalidUTF8
  case invalidDocumentJSON
  case invalidPatch
  case invalidPatchPath
  case invalidChangeHash
  case missingAttachmentBytes
  case unexpectedDocumentType
  case unexpectedAttachmentSchema

  var errorDescription: String? { rawValue }
}
