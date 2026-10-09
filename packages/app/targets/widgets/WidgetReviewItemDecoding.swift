import Foundation

// Rich prompt decoding belongs to the extension; storage is the same shared
// Foundation source compiled into the app and extension targets.
extension WidgetProjectionStore {
  func dueReviewItems(throughTimestampMillis: Int64, limit: Int) throws -> [OrbitReviewItem] {
    try dueReviewItemSnapshot(throughTimestampMillis: throughTimestampMillis, limit: limit).items
  }

  func dueReviewItemSnapshot(throughTimestampMillis: Int64, limit: Int) throws -> (
    vaultID: String?, items: [OrbitReviewItem]
  ) {
    let snapshot = try dueReviewSnapshot(
      throughTimestampMillis: throughTimestampMillis, limit: limit)
    let items = snapshot.items.compactMap { json -> OrbitReviewItem? in
      do {
        return try OrbitReviewItem(decoding: JSONSerialization.jsonObject(with: Data(json.utf8)))
      } catch {
        NSLog("Orbit widget skipped an invalid review projection row")
        return nil
      }
    }
    return (snapshot.vaultID, items)
  }
}
