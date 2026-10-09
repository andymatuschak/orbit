import Foundation

let arguments = CommandLine.arguments
guard arguments.count >= 4 else {
  fatalError("Pass seed/inspect/record-first, App Group directory, and vault ID")
}
let directory = URL(fileURLWithPath: arguments[2])
let vaultID = arguments[3]
let store = try WidgetProjectionStore(
  fileURL: directory.appendingPathComponent(WidgetProjectionStore.fileName)
)
let records =
  try JSONSerialization.jsonObject(with: Data(store.pendingReviewsJSON(vaultID: vaultID).utf8))
  as! [[String: Any]]
switch arguments[1] {
case "seed":
  guard arguments.count == 5 else { fatalError("Pass the review-item fixture JSON path") }
  let json = try String(contentsOfFile: arguments[4], encoding: .utf8)
  let revision = UUID().uuidString
  try store.markReviewsImported(
    vaultID: vaultID,
    observationIDs: records.map { $0["observationID"] as! String },
    reviewItemsJSON: json,
    revision: revision
  )
  _ = try store.replaceProjection(vaultID: vaultID, reviewItemsJSON: json, revision: revision)
case "inspect":
  let queueJSON = try store.projectedReviewItemsJSON(vaultID: vaultID) ?? "[]"
  let queue = try JSONSerialization.jsonObject(with: Data(queueJSON.utf8)) as! [[String: Any]]
  let taskIDs = queue.map { ($0["task"] as! [String: Any])["id"] as! String }
  print("\(records.count)|\(taskIDs.joined(separator: ","))")
case "record-first":
  let snapshot = try store.dueReviewSnapshot(throughTimestampMillis: Int64.max, limit: 1)
  guard snapshot.vaultID == vaultID, let first = snapshot.items.first else {
    fatalError("The selected vault has no review item")
  }
  let item = try JSONSerialization.jsonObject(with: Data(first.utf8)) as! [String: Any]
  let taskID = (item["task"] as! [String: Any])["id"] as! String
  let componentID = item["componentID"] as! String
  var uuid = UUID().uuid
  let randomID = withUnsafeBytes(of: &uuid) { Data($0).base64EncodedString() }
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
  let reviewID = "review/\(randomID)"
  let accepted = try store.recordReview(
    mutationID: reviewID, observationID: reviewID, taskID: taskID,
    componentID: componentID, outcome: "remembered",
    occurredAtTimestampMillis: Int64(Date().timeIntervalSince1970 * 1000),
    expectedVaultID: vaultID
  )
  guard accepted else { fatalError("The selected vault changed before the review was accepted") }
  print(reviewID)
default: fatalError("Unknown widget projection command")
}
