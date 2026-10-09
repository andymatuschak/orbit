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

print("Widget projection writer regression test passed")
