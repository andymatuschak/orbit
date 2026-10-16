import Automerge
import Foundation

// https://github.com/automerge/automerge/issues/1390
// A same-value put must not leave a speculative actor in the patch log after
// that actor is removed from the document. A later merge or receive then used
// to panic with PatchLogMismatch, poisoning the document's Rust lock.
func peers() throws -> (Document, Document) {
  let base = Document()
  base.actor = ActorId(data: Data([0x10]))!
  try base.put(obj: .ROOT, key: "value", value: .Int(1))
  base.commitWith(message: "base", timestamp: Date(timeIntervalSince1970: 0))
  let bytes = base.save()
  let local = try Document(bytes)
  local.actor = ActorId(data: Data([0x20]))!
  let remote = try Document(bytes)
  remote.actor = ActorId(data: Data([0x30]))!
  try local.put(obj: .ROOT, key: "value", value: .Int(1))
  local.commitWith(message: "same-value put", timestamp: Date(timeIntervalSince1970: 0))
  try remote.put(obj: .ROOT, key: "value", value: .Int(0))
  remote.commitWith(message: "real change", timestamp: Date(timeIntervalSince1970: 0))
  return (local, remote)
}

func synchronize(_ local: Document, _ remote: Document) throws {
  let localState = SyncState()
  let remoteState = SyncState()
  for _ in 0..<20 {
    let outgoing = local.generateSyncMessage(state: localState)
    if let outgoing { try remote.receiveSyncMessage(state: remoteState, message: outgoing) }
    let incoming = remote.generateSyncMessage(state: remoteState)
    if let incoming { try local.receiveSyncMessage(state: localState, message: incoming) }
    if outgoing == nil && incoming == nil {
      guard local.heads() == remote.heads(),
        try local.get(obj: .ROOT, key: "value") == .Scalar(.Int(0))
      else { throw NSError(domain: "Native sync did not converge", code: 1) }
      return
    }
  }
  throw NSError(domain: "Native sync did not become quiescent", code: 1)
}

do {
  let modes = CommandLine.arguments.count > 1 ? [CommandLine.arguments[1]] : ["merge", "sync", "import"]
  for mode in modes {
    let (local, remote) = try peers()
    switch mode {
    case "merge":
      try local.merge(other: remote)
    case "sync":
      break
    case "import":
      // Match the bridge's ordinary public Repo re-import workaround: merge a
      // distinct copy, not the document object into itself.
      try local.merge(other: Document(local.save()))
    default:
      throw NSError(domain: "Unknown regression mode", code: 1)
    }
    try synchronize(local, remote)
    print("Native Automerge no-op regression PASS: \(mode), matching heads and value")
  }
} catch {
  FileHandle.standardError.write(Data("Native Automerge no-op regression FAILED: \(error)\n".utf8))
  exit(1)
}
