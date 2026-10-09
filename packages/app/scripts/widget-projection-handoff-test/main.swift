import Darwin
import Foundation

func check(_ condition: Bool, _ message: String) {
  if !condition { fatalError(message) }
}

func items(_ count: Int) throws -> String {
  let values = (0..<count).map { index -> [String: Any] in
    ["task": ["id": "task-\(index)", "componentStates": ["main": ["dueTimestampMillis": index]]], "componentID": "main"]
  }
  return String(decoding: try JSONSerialization.data(withJSONObject: values), as: UTF8.self)
}

func review(_ store: WidgetProjectionStore, index: Int) throws {
  let id = "review/" + String(format: "%022d", index)
  _ = try store.recordReview(mutationID: id, observationID: id, taskID: "task-\(index)", componentID: "main", outcome: "remembered", occurredAtTimestampMillis: Int64(index), expectedVaultID: "vault-a")
}

func state(_ url: URL) throws -> [String: Any] {
  try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
}

func assertConsistent(_ url: URL, count: Int) throws {
  let value = try state(url)
  let queue = value["queue"] as! [[String: Any]]
  let pending = value["pendingReviews"] as! [[String: Any]]
  let queuedIDs = Set(queue.map { ($0["task"] as! [String: Any])["id"] as! String })
  let pendingIDs = Set(pending.map { $0["taskID"] as! String })
  check(queuedIDs.isDisjoint(with: pendingIDs), "A pending review resurrected in the queue")
  check(queuedIDs.union(pendingIDs).count == count, "A concurrent replacement lost a task or review")
  check(pending.count == pendingIDs.count, "A review was accepted more than once")
}

let arguments = CommandLine.arguments
if arguments.count > 2 {
  let mode = arguments[1]
  let url = URL(fileURLWithPath: arguments[2])
  let store = try WidgetProjectionStore(fileURL: url)
  switch mode {
  case "publish":
    for index in 0..<100 {
      _ = try store.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(50), revision: "publish-\(index)")
    }
  case "review":
    for index in 0..<50 { try review(store, index: index) }
  case "read":
    for _ in 0..<300 { try assertConsistent(url, count: 50) }
  case "accept-and-crash":
    try review(store, index: 0)
    kill(getpid(), SIGKILL)
  case "import-and-crash", "import":
    let records = try JSONSerialization.jsonObject(with: Data(store.pendingReviewsJSON(vaultID: "vault-a").utf8)) as! [[String: Any]]
    let ids = records.map { $0["observationID"] as! String }
    let authoritativeURL = url.deletingLastPathComponent().appendingPathComponent("authoritative-ids.json")
    let existing = (try? JSONSerialization.jsonObject(with: Data(contentsOf: authoritativeURL))) as? [String] ?? []
    // Models the domain's stable-ID idempotency, independently of handoff ack.
    try JSONSerialization.data(withJSONObject: Array(Set(existing + ids)).sorted()).write(to: authoritativeURL, options: .atomic)
    if mode == "import-and-crash" { kill(getpid(), SIGKILL) }
    try store.markReviewsImported(vaultID: "vault-a", observationIDs: ids, reviewItemsJSON: "[]", revision: "imported")
  case "crash-writer":
    try Data().write(to: url.deletingLastPathComponent().appendingPathComponent("writer-started"))
    var index = 0
    while true {
      _ = try store.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "crash-\(index)")
      index += 1
    }
  default: fatalError("Unknown process mode")
  }
  exit(0)
}

let directory = FileManager.default.temporaryDirectory.appendingPathComponent("orbit-widget-handoff-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: directory) }
let executable = URL(fileURLWithPath: arguments[0])
func child(_ mode: String, url: URL) throws -> Process {
  let process = Process()
  process.executableURL = executable
  process.arguments = [mode, url.path]
  try process.run()
  return process
}
func finished(_ process: Process, crashed: Bool = false) {
  process.waitUntilExit()
  if crashed { check(process.terminationReason == .uncaughtSignal, "The crash test did not terminate abruptly") }
  else { check(process.terminationStatus == 0, "A handoff process failed") }
}

// Three independent processes share the actual production coordination path.
let raceURL = directory.appendingPathComponent("race/widget.json")
let race = try WidgetProjectionStore(fileURL: raceURL)
_ = try race.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(50), revision: "initial")
let publisher = try child("publish", url: raceURL)
let reviewer = try child("review", url: raceURL)
let reader = try child("read", url: raceURL)
finished(publisher); finished(reviewer); finished(reader)
try assertConsistent(raceURL, count: 50)
check((try state(raceURL)["pendingReviews"] as! [Any]).count == 50, "Concurrent publication lost accepted reviews")

let crashURL = directory.appendingPathComponent("crash/widget.json")
let crash = try WidgetProjectionStore(fileURL: crashURL)
_ = try crash.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "initial")
finished(try child("accept-and-crash", url: crashURL), crashed: true)
try assertConsistent(crashURL, count: 1)
finished(try child("import-and-crash", url: crashURL), crashed: true)
check((try state(crashURL)["pendingReviews"] as! [Any]).count == 1, "An unacknowledged review was discarded after importer crash")
finished(try child("import", url: crashURL))
finished(try child("import", url: crashURL))
let idsURL = crashURL.deletingLastPathComponent().appendingPathComponent("authoritative-ids.json")
check((try JSONSerialization.jsonObject(with: Data(contentsOf: idsURL)) as! [Any]).count == 1, "Crash replay duplicated the authoritative effect")
check((try state(crashURL)["pendingReviews"] as! [Any]).isEmpty, "Durable imported reviews were not acknowledged")

// Kill a publishing process repeatedly; the file stays complete and another
// process can reacquire coordination. The accepted pending record survives.
let interruptionURL = directory.appendingPathComponent("interruption/widget.json")
let interruption = try WidgetProjectionStore(fileURL: interruptionURL)
_ = try interruption.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "initial")
try review(interruption, index: 0)
for _ in 0..<8 {
  let marker = interruptionURL.deletingLastPathComponent().appendingPathComponent("writer-started")
  try? FileManager.default.removeItem(at: marker)
  let process = try child("crash-writer", url: interruptionURL)
  let deadline = Date().addingTimeInterval(10)
  while !FileManager.default.fileExists(atPath: marker.path) && Date() < deadline { usleep(1_000) }
  check(FileManager.default.fileExists(atPath: marker.path), "Writer never started")
  usleep(2_000)
  kill(process.processIdentifier, SIGKILL)
  finished(process, crashed: true)
  try assertConsistent(interruptionURL, count: 1)
  _ = try interruption.pendingReviewsJSON(vaultID: "vault-a")
}

// Account switching and selective acknowledgement preserve unrelated reviews.
_ = try interruption.replaceProjection(vaultID: "vault-b", reviewItemsJSON: items(1), revision: "vault-b")
let switchedSnapshot = try interruption.dueReviewSnapshot(throughTimestampMillis: 100, limit: 50)
check(switchedSnapshot.vaultID == "vault-b" && switchedSnapshot.items.count == 1, "Queue snapshot did not carry its vault ownership")
let beforeStaleIntent = try Data(contentsOf: interruptionURL)
let staleAccepted = try interruption.recordReview(mutationID: "review/0000000000000000000009", observationID: "review/0000000000000000000009", taskID: "task-0", componentID: "main", outcome: "forgotten", occurredAtTimestampMillis: 1, expectedVaultID: "vault-a")
check(!staleAccepted, "An old timeline recorded a review in the newly selected account")
check(try Data(contentsOf: interruptionURL) == beforeStaleIntent, "A stale account intent mutated the queue or journal")
let secondID = "review/0000000000000000000001"
_ = try interruption.recordReview(mutationID: secondID, observationID: secondID, taskID: "task-0", componentID: "main", outcome: "forgotten", occurredAtTimestampMillis: 1, expectedVaultID: "vault-b")
try interruption.markReviewsImported(vaultID: "vault-b", observationIDs: ["review/0000000000000000000000"], reviewItemsJSON: "[]", revision: "not-imported")
check((try state(interruptionURL)["pendingReviews"] as! [Any]).count == 2, "Acknowledgement crossed account namespaces")
try interruption.markReviewsImported(vaultID: "vault-b", observationIDs: [secondID], reviewItemsJSON: "[]", revision: "b-imported")
check((try state(interruptionURL)["pendingReviews"] as! [Any]).count == 1, "Acknowledgement discarded another vault's review")
_ = try interruption.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "back-to-a")
try review(interruption, index: 0) // exact stable-ID replay is a no-op
try assertConsistent(interruptionURL, count: 1)
do {
  _ = try interruption.recordReview(mutationID: "review/0000000000000000000000", observationID: "review/0000000000000000000000", taskID: "task-0", componentID: "main", outcome: "forgotten", occurredAtTimestampMillis: 0, expectedVaultID: "vault-a")
  fatalError("A divergent retry reused an accepted observation ID")
} catch {}

let malformedURL = directory.appendingPathComponent("malformed/widget.json")
let malformed = try WidgetProjectionStore(fileURL: malformedURL)
let malformedBytes = Data("{\"version\":1,\"queue\":[],\"pendingReviews\":[\"unreadable\"]}".utf8)
try malformedBytes.write(to: malformedURL)
do {
  _ = try malformed.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "new")
  fatalError("An unreadable pending journal was silently discarded")
} catch {}
check(try Data(contentsOf: malformedURL) == malformedBytes, "An unreadable pending journal was overwritten")
let missingJournalBytes = Data("{\"version\":1,\"queue\":[]}".utf8)
try missingJournalBytes.write(to: malformedURL)
do {
  _ = try malformed.replaceProjection(vaultID: "vault-a", reviewItemsJSON: items(1), revision: "new")
  fatalError("A missing pending journal was silently replaced")
} catch {}
check(try Data(contentsOf: malformedURL) == missingJournalBytes, "A missing pending journal was overwritten")

print("Widget JSON handoff passed: three-process races, eight interrupted writes, acceptance/import crash replay, selective account ack, malformed-journal preservation")
