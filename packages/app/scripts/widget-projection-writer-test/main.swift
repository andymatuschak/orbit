import Foundation

let temporaryDirectory = FileManager.default.temporaryDirectory
  .appending(component: "orbit-widget-projection-writer-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(
  at: temporaryDirectory,
  withIntermediateDirectories: true
)
defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

let fileURL = temporaryDirectory.appending(component: "widget.json")
let store = try WidgetProjectionStore(fileURL: fileURL)

let reviewItemsJSON = """
  [
    {
      "task": {
        "id": "task-a",
        "componentStates": {
          "main": { "dueTimestampMillis": 1 }
        }
      },
      "componentID": "main"
    }
  ]
  """

guard try store.replaceProjection(
  vaultID: "vault-a",
  reviewItemsJSON: reviewItemsJSON,
  revision: "revision-a"
) else {
  fatalError("The initial projection was not reported as changed")
}

guard try !store.replaceProjection(
  vaultID: "vault-a",
  reviewItemsJSON: reviewItemsJSON,
  revision: "revision-a"
) else {
  fatalError("An identical projection was reported as changed")
}

guard try store.replaceProjection(
  vaultID: "vault-a",
  reviewItemsJSON: reviewItemsJSON,
  revision: "revision-b"
) else {
  fatalError("A new revision was not reported as changed")
}

guard try store.replaceProjection(
  vaultID: "vault-b",
  reviewItemsJSON: reviewItemsJSON,
  revision: "revision-b"
) else {
  fatalError("Selecting a different vault was not reported as changed")
}

guard try store.projectedReviewItemsJSON(vaultID: "vault-a") == nil else {
  fatalError("An unselected vault exposed a launch projection")
}
guard
  let projectedJSON = try store.projectedReviewItemsJSON(vaultID: "vault-b"),
  let projectedData = projectedJSON.data(using: .utf8),
  let projectedItems = try JSONSerialization.jsonObject(with: projectedData)
    as? [[String: Any]],
  projectedItems.count == 1,
  projectedItems.first?["componentID"] as? String == "main"
else {
  fatalError("The selected launch projection did not round-trip")
}

do {
  _ = try store.replaceProjection(
    vaultID: "vault-b",
    reviewItemsJSON: "not JSON",
    revision: "revision-b"
  )
  fatalError("Malformed input bypassed validation for an unchanged revision")
} catch {
  // Expected.
}

// FSRS interval calculations legitimately produce fractional milliseconds.
let fractionalDue = "1789442596306.177"
let fractionalProjection = reviewItemsJSON.replacingOccurrences(
  of: "\"dueTimestampMillis\": 1", with: "\"dueTimestampMillis\": \(fractionalDue)"
)
guard try store.replaceProjection(
  vaultID: "vault-b", reviewItemsJSON: fractionalProjection, revision: "fractional"
) else {
  fatalError("A fractional due timestamp rejected the entire projection")
}
let reopenedStore = try WidgetProjectionStore(fileURL: fileURL)
guard
  let fractionalJSON = try reopenedStore.projectedReviewItemsJSON(vaultID: "vault-b"),
  let fractionalData = fractionalJSON.data(using: .utf8),
  let fractionalItems = try JSONSerialization.jsonObject(with: fractionalData)
    as? [[String: Any]],
  let task = fractionalItems.first?["task"] as? [String: Any],
  let components = task["componentStates"] as? [String: Any],
  let component = components["main"] as? [String: Any],
  let due = component["dueTimestampMillis"] as? NSNumber,
  due.doubleValue == Double(fractionalDue),
  try reopenedStore.dueReviewSnapshot(throughTimestampMillis: 1_789_442_596_305, limit: 1)
    .items.isEmpty,
  try reopenedStore.dueReviewSnapshot(throughTimestampMillis: 1_789_442_596_306, limit: 1)
    .items.count == 1
else {
  fatalError("A fractional due timestamp did not survive persistence and timeline conversion")
}

for invalidDue in ["true", "false", "NaN", "Infinity", "-Infinity", "1e309",
  "9007199254740992", "-9007199254740992"]
{
  let invalidProjection = reviewItemsJSON.replacingOccurrences(
    of: "\"dueTimestampMillis\": 1", with: "\"dueTimestampMillis\": \(invalidDue)"
  )
  do {
    _ = try store.replaceProjection(
      vaultID: "vault-b", reviewItemsJSON: invalidProjection, revision: "invalid"
    )
    fatalError("An invalid due timestamp was accepted: \(invalidDue)")
  } catch {
    // Expected, including non-finite values which JSON itself cannot encode.
  }
}

// Unlike calculated due dates, recorded observation times must stay safe integers.
let pendingFileURL = temporaryDirectory.appending(component: "pending.json")
let pendingStore = try WidgetProjectionStore(fileURL: pendingFileURL)
for invalidTimestamp in [fractionalDue, "true", "false", "9007199254740992",
  "-9007199254740992"]
{
  let pendingJSON = """
    {"version":1,"selectedVaultID":"vault-b","revision":"pending","queue":[],
     "pendingReviews":[{"vaultID":"vault-b",
       "mutationID":"review/AAAAAAAAAAAAAAAAAAAAAA",
       "observationID":"review/AAAAAAAAAAAAAAAAAAAAAA",
       "taskID":"task-a","componentID":"main","outcome":"remembered",
       "occurredAtTimestampMillis":\(invalidTimestamp)}]}
    """
  let pendingData = Data(pendingJSON.utf8)
  try pendingData.write(to: pendingFileURL, options: .atomic)
  do {
    _ = try pendingStore.pendingReviewsJSON(vaultID: "vault-b")
    fatalError("An invalid observation timestamp was accepted: \(invalidTimestamp)")
  } catch {
    guard try Data(contentsOf: pendingFileURL) == pendingData else {
      fatalError("Rejected pending reviews were overwritten")
    }
  }
}

print("Widget projection writer regression test passed")
