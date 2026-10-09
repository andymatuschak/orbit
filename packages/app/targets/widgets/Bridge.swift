import Foundation
import WidgetKit

@MainActor
final class Bridge {
  static let shared = Bridge()

  private let store: WidgetProjectionStore

  private init() {
    store = try! WidgetProjectionStore()
  }

  func generateReviewQueue() async -> (vaultID: String?, items: [OrbitReviewItem]) {
    do {
      let fuzzyDueTimestampMillis = Int64(
        (Date.now.timeIntervalSince1970 + 16 * 60 * 60) * 1_000
      )
      return try store.dueReviewItemSnapshot(
        throughTimestampMillis: fuzzyDueTimestampMillis,
        limit: 50
      )
    } catch {
      print("Couldn't generate the widget review queue: \(error)")
      return (nil, [])
    }
  }

  func recordReview(
    taskID: TaskID,
    componentID: String,
    outcome: TaskRepetitionOutcome,
    date: Date,
    expectedVaultID: String
  ) async throws {
    guard outcome == .remembered || outcome == .forgotten else {
      throw WidgetProjectionStoreError.invalidInput(
        "unsupported review outcome"
      )
    }
    let occurredAtTimestampMillis = Int64(
      (date.timeIntervalSince1970 * 1_000).rounded(.towardZero)
    )
    let mutationID = "review/\(webSafeRandomID())"
    _ = try store.recordReview(
      mutationID: mutationID,
      observationID: mutationID,
      taskID: taskID,
      componentID: componentID,
      outcome: outcome.rawValue,
      occurredAtTimestampMillis: occurredAtTimestampMillis,
      expectedVaultID: expectedVaultID
    )
    WidgetCenter.shared.reloadTimelines(ofKind: "OrbitHomeScreen")
  }
}

private func webSafeRandomID() -> String {
  var uuid = UUID().uuid
  return withUnsafeBytes(of: &uuid) { bytes in
    Data(bytes)
      .base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
