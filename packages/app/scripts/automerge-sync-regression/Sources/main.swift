import Automerge
import Darwin
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

struct CatalogFixture {
  let snapshot: Data
  let changes: Data
  let heads: Set<String>
  let count: Int
}

func catalogMap(_ document: Document) throws -> ObjId {
  guard case .Object(let entries, .Map)? = try document.get(obj: .ROOT, key: "entries") else {
    throw NSError(domain: "Catalog entries map missing", code: 1)
  }
  return entries
}

func catalogFixture(directory: String?) throws -> CatalogFixture {
  if let directory {
    let url = URL(fileURLWithPath: directory)
    func read(_ name: String) throws -> Data {
      let file = url.appendingPathComponent(name)
      guard let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size <= 8 * 1024 * 1024 else {
        throw NSError(domain: "Catalog fixture exceeds 8 MiB per file", code: 1)
      }
      return try Data(contentsOf: file)
    }
    guard let expected = try JSONSerialization.jsonObject(with: read("expected.json")) as? [String: Any],
      let count = expected["count"] as? Int, (1...2048).contains(count),
      let heads = expected["heads"] as? [String], !heads.isEmpty else {
      throw NSError(domain: "Invalid synthetic catalog fixture", code: 1)
    }
    return CatalogFixture(snapshot: try read("snapshot.bin"), changes: try read("changes.bin"),
      heads: Set(heads), count: count)
  }
  // About 1 MiB of scalar strings followed by 512 separate replacements. Loading
  // their saved slabs then splitting them exposed hexane's retained-capacity bug.
  let count = 512
  let base = Document()
  base.actor = ActorId(data: Data([0xAA]))!
  let entries = try base.putObject(obj: .ROOT, key: "entries", ty: .Map)
  for index in 0..<count {
    try base.put(obj: entries, key: String(format: "key%05d", index),
      value: .String("\(index):" + String(repeating: "x", count: 2048)))
  }
  base.commitWith(message: "catalog snapshot", timestamp: Date(timeIntervalSince1970: 0))
  let snapshot = base.save()
  let updated = try Document(snapshot)
  updated.actor = ActorId(data: Data([0xBB]))!
  let loadedEntries = try catalogMap(updated)
  for index in 0..<count {
    try updated.put(obj: loadedEntries, key: String(format: "key%05d", index),
      value: .String("changed-\(index)"))
    updated.commitWith(message: "replace entry", timestamp: Date(timeIntervalSince1970: 0))
  }
  return CatalogFixture(snapshot: snapshot, changes: try updated.encodeChangesSince(heads: base.heads()),
    heads: Set(updated.heads().map(\.debugDescription)), count: count)
}

func catalogRegression(directory: String?) throws {
  let fixture = try catalogFixture(directory: directory)
  for mode in ["concatenated", "incremental", "merge"] {
    let loaded: Document
    switch mode {
    case "concatenated": loaded = try Document(fixture.snapshot + fixture.changes)
    case "incremental":
      loaded = try Document(fixture.snapshot)
      try loaded.applyEncodedChanges(encoded: fixture.changes)
    default:
      loaded = try Document(fixture.snapshot)
      try loaded.merge(other: Document(fixture.snapshot + fixture.changes))
    }
    let entries = try catalogMap(loaded)
    guard Set(loaded.heads().map(\.debugDescription)) == fixture.heads,
      loaded.length(obj: entries) == UInt64(fixture.count) else {
      throw NSError(domain: "Cold catalog heads/count differ: \(mode)", code: 1)
    }
    for index in 0..<fixture.count {
      guard try loaded.get(obj: entries, key: String(format: "key%05d", index)) ==
        .Scalar(.String("changed-\(index)")) else {
        throw NSError(domain: "Cold catalog value differs: \(mode), entry \(index)", code: 1)
      }
    }
  }
  var usage = rusage()
  getrusage(RUSAGE_SELF, &usage)
  print("Native Automerge catalog regression PASS: \(fixture.count) entries, snapshot+changes \(fixture.snapshot.count + fixture.changes.count) bytes, concatenated/incremental/merge heads and values match, peak RSS \(usage.ru_maxrss) bytes")
}

do {
  let modes = CommandLine.arguments.count > 1 ? [CommandLine.arguments[1]] : ["merge", "sync", "import"]
  for mode in modes {
    if mode == "catalog" {
      try catalogRegression(directory: CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : nil)
      continue
    }
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
  FileHandle.standardError.write(Data("Native Automerge regression FAILED: \(error)\n".utf8))
  exit(1)
}
