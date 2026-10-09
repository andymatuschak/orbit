import Foundation

let temporaryDirectory = FileManager.default.temporaryDirectory
  .appending(component: "orbit-widget-projection-reader-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(
  at: temporaryDirectory,
  withIntermediateDirectories: true
)
defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

let missingTitleJSON = """
  {
    "task": {
      "id": "valid-without-title",
      "provenance": { "identifier": "source" },
      "spec": {
        "type": "memory",
        "content": {
          "type": "qa",
          "body": { "text": "Question", "attachments": [] },
          "answer": { "text": "Answer", "attachments": [] }
        }
      },
      "componentStates": {
        "main": {
          "createdAtTimestampMillis": 1,
          "dueTimestampMillis": 1
        }
      }
    },
    "componentID": "main"
  }
  """

func pendingReview(vaultID: String, index: Int) -> [String: Any] {
  let id = "review/" + String(format: "%022d", index)
  return [
    "vaultID": vaultID, "mutationID": id, "observationID": id,
    "taskID": "reviewed-task-\(index)", "componentID": "main",
    "outcome": "remembered", "occurredAtTimestampMillis": index,
  ]
}

// Read the actual JSON handoff, including a malformed disposable queue item.
// Accepted pending reviews remain strict and independently scoped by vault.
let fileURL = temporaryDirectory.appending(component: "widget.json")
let validItem = try JSONSerialization.jsonObject(with: Data(missingTitleJSON.utf8))
let state: [String: Any] = [
  "version": 1, "selectedVaultID": "test-vault", "revision": "test",
  "queue": [["unsupported": true], validItem],
  "pendingReviews": [
    pendingReview(vaultID: "test-vault", index: 0),
    pendingReview(vaultID: "other-vault", index: 1),
  ],
]
try JSONSerialization.data(withJSONObject: state).write(to: fileURL, options: .atomic)
let store = try WidgetProjectionStore(fileURL: fileURL)
let reviewItems = try store.dueReviewItems(
  throughTimestampMillis: 2,
  limit: 50
)
guard reviewItems.count == 1 else {
  fatalError("Expected one valid review item, got \(reviewItems.count)")
}
guard reviewItems[0].task.id == "valid-without-title" else {
  fatalError("The valid review item was not retained")
}
guard reviewItems[0].task.provenance?.title == nil else {
  fatalError("A missing provenance title did not remain optional")
}

// Rendering consumes creation time and cloze ranges, not scheduling fields or
// the order of other components. Decode a minimal render payload directly.
let cloze = try OrbitTask(decoding: [
  "id": "cloze",
  "spec": ["type": "memory", "content": [
    "type": "cloze", "body": ["text": "A cloze prompt"],
    "components": ["a": ["ranges": [["startIndex": 2, "length": 5]]]],
  ]],
  "componentStates": ["a": ["createdAtTimestampMillis": 1]],
])
guard case .memory(.cloze(_, let components)) = cloze.spec,
  components["a"]?.ranges.first?.startIndex == 2,
  components["a"]?.ranges.first?.length == 5,
  cloze.componentStates["a"]?.createdAtTimestampMillis == 1
else {
  fatalError("Minimal render fields did not retain cloze ranges and creation time")
}

func countPending(_ store: WidgetProjectionStore, vaultID: String) throws -> Int {
  let records = try JSONSerialization.jsonObject(
    with: Data(store.pendingReviewsJSON(vaultID: vaultID).utf8)) as! [Any]
  return records.count
}
guard try countPending(store, vaultID: "test-vault") == 1,
  try countPending(store, vaultID: "other-vault") == 1
else {
  fatalError("Pending reviews from every vault did not round-trip")
}
try store.markReviewsImported(
  vaultID: "test-vault", observationIDs: ["review/0000000000000000000000"],
  reviewItemsJSON: "[]", revision: "imported"
)
let reopened = try WidgetProjectionStore(fileURL: fileURL)
guard try countPending(reopened, vaultID: "test-vault") == 0,
  try countPending(reopened, vaultID: "other-vault") == 1
else {
  fatalError("Acknowledgement repeated or discarded another vault's accepted reviews")
}

print("Widget projection reader regression test passed")
