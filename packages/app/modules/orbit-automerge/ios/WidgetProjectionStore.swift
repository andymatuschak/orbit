import CoreFoundation
import Darwin
import Foundation

enum WidgetProjectionStoreError: LocalizedError {
  case missingAppGroup
  case invalidInput(String)
  case invariant(String)
  case persistence(String)

  var errorDescription: String? {
    switch self {
    case .missingAppGroup: "The widget app group is not configured"
    case .invalidInput(let message), .invariant(let message), .persistence(let message): message
    }
  }
}

/// Compiled into both processes. One coordinated atomic JSON replacement is
/// the commit boundary for the disposable queue and durable pending reviews.
final class WidgetProjectionStore {
  static let fileName = "orbit-widget-v3.json"
  private let fileURL: URL

  convenience init() throws {
    guard let appGroupID = Bundle.main.object(forInfoDictionaryKey: "OrbitAppGroup") as? String,
      let directory = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupID)
    else { throw WidgetProjectionStoreError.missingAppGroup }
    try self.init(fileURL: directory.appendingPathComponent(Self.fileName))
  }

  init(fileURL: URL) throws {
    self.fileURL = fileURL
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  }

  func replaceProjection(vaultID: String, reviewItemsJSON: String, revision: String) throws -> Bool
  {
    let items = try decodeProjection(reviewItemsJSON)
    guard !vaultID.isEmpty, !revision.isEmpty else {
      throw WidgetProjectionStoreError.invalidInput("vault ID and revision must be non-empty")
    }
    return try access { state in
      guard state.selectedVaultID != vaultID || state.revision != revision else {
        return (false, false)
      }
      state.selectedVaultID = vaultID
      state.revision = revision
      state.queue = excludingPending(items, vaultID: vaultID, state: state)
      return (true, true)
    }
  }

  func pendingReviewsJSON(vaultID: String) throws -> String {
    try access { state in
      let records = state.pendingReviews.filter { $0.vaultID == vaultID }.sorted {
        ($0.occurredAtTimestampMillis, $0.observationID) < (
          $1.occurredAtTimestampMillis, $1.observationID
        )
      }
      return (try jsonString(records.map { $0.json(includeVault: false) }), false)
    }
  }

  /// Fresh projection and acknowledgement commit together. Reviews accepted
  /// after the importer read its batch remain pending and excluded.
  func markReviewsImported(
    vaultID: String, observationIDs: [String],
    reviewItemsJSON: String, revision: String
  ) throws {
    let freshItems = try decodeProjection(reviewItemsJSON)
    guard !vaultID.isEmpty, !revision.isEmpty else {
      throw WidgetProjectionStoreError.invalidInput("vault ID and revision must be non-empty")
    }
    try access { state in
      let importedIDs = Set(observationIDs)
      state.pendingReviews.removeAll {
        $0.vaultID == vaultID && importedIDs.contains($0.observationID)
      }
      if state.selectedVaultID == vaultID {
        state.queue = excludingPending(freshItems, vaultID: vaultID, state: state)
        state.revision = revision
      }
      return ((), true)
    }
  }

  func projectedReviewItemsJSON(vaultID: String) throws -> String? {
    try access { state in
      guard state.selectedVaultID == vaultID else { return (nil, false) }
      return (try jsonString(state.queue.map(\.json)), false)
    }
  }

  func dueReviewSnapshot(throughTimestampMillis: Int64, limit: Int) throws -> (
    vaultID: String?, items: [String]
  ) {
    try access { state in
      // Queue selection and ordering belong to the shared scheduler. Filtering
      // future entries must not undo its interleaved backlog policy.
      let items = state.queue.filter { $0.dueTimestampMillis <= throughTimestampMillis }
      return (
        (state.selectedVaultID, try items.prefix(max(0, limit)).map { try jsonString($0.json) }),
        false
      )
    }
  }

  func recordReview(
    mutationID: String, observationID: String, taskID: String, componentID: String,
    outcome: String, occurredAtTimestampMillis: Int64, expectedVaultID: String
  ) throws -> Bool {
    try access { state in
      // A timeline can outlive an account switch. Do not redirect its intent
      // into the newly selected account, even if both have the same task ID.
      guard state.selectedVaultID == expectedVaultID else { return (false, false) }
      guard let vaultID = state.selectedVaultID else {
        throw WidgetProjectionStoreError.invariant("no vault is selected")
      }
      let record = try PendingReview([
        "vaultID": vaultID, "mutationID": mutationID, "observationID": observationID,
        "taskID": taskID, "componentID": componentID, "outcome": outcome,
        "occurredAtTimestampMillis": occurredAtTimestampMillis,
      ])
      if let previous = state.pendingReviews.first(where: { $0.observationID == observationID }) {
        guard previous == record else {
          throw WidgetProjectionStoreError.invalidInput(
            "review ID was reused with different content")
        }
        return (true, false)
      }
      guard
        let index = state.queue.firstIndex(where: {
          $0.taskID == taskID && $0.componentID == componentID
        })
      else {
        throw WidgetProjectionStoreError.invariant("review projection target is absent")
      }
      state.queue.remove(at: index)
      state.pendingReviews.append(record)
      return (true, true)
    }
  }

  private struct State {
    var selectedVaultID: String?
    var revision: String?
    var queue: [ProjectionItem] = []
    var pendingReviews: [PendingReview] = []

    init(_ json: [String: Any]) throws {
      guard json["version"] as? Int == 1 else {
        throw WidgetProjectionStoreError.invariant("unsupported widget handoff version")
      }
      selectedVaultID = json["selectedVaultID"] as? String
      revision = json["revision"] as? String
      guard let items = json["queue"] as? [[String: Any]] else {
        throw WidgetProjectionStoreError.invariant("malformed widget queue")
      }
      // One stale/unsupported item must not hide every valid widget prompt.
      queue = items.compactMap { try? ProjectionItem($0) }
      guard let records = json["pendingReviews"] as? [[String: Any]] else {
        // Never overwrite an unreadable or missing journal with an empty one.
        throw WidgetProjectionStoreError.invariant("malformed pending widget reviews")
      }
      pendingReviews = try records.map(PendingReview.init)
      if queue.count > 0 && selectedVaultID == nil {
        throw WidgetProjectionStoreError.invariant("widget queue has no selected vault")
      }
    }

    var json: [String: Any] {
      [
        "version": 1, "selectedVaultID": selectedVaultID as Any? ?? NSNull(),
        "revision": revision as Any? ?? NSNull(), "queue": queue.map(\.json),
        "pendingReviews": pendingReviews.map { $0.json() },
      ]
    }
  }

  private struct ProjectionItem {
    let json: [String: Any]
    let taskID: String
    let componentID: String
    let dueTimestampMillis: Int64

    init(_ json: [String: Any]) throws {
      guard let task = json["task"] as? [String: Any],
        let taskID = task["id"] as? String, !taskID.isEmpty,
        let componentID = json["componentID"] as? String, !componentID.isEmpty,
        let components = task["componentStates"] as? [String: Any],
        let component = components[componentID] as? [String: Any],
        let due = component["dueTimestampMillis"] as? NSNumber,
        widgetSafeNumber(due)
      else { throw WidgetProjectionStoreError.invalidInput("invalid review item") }
      self.json = json
      self.taskID = taskID
      self.componentID = componentID
      dueTimestampMillis = due.int64Value
    }
  }

  private struct PendingReview: Equatable {
    let vaultID: String
    let mutationID: String
    let observationID: String
    let taskID: String
    let componentID: String
    let outcome: String
    let occurredAtTimestampMillis: Int64

    init(_ json: [String: Any]) throws {
      guard let vaultID = json["vaultID"] as? String, !vaultID.isEmpty,
        let mutationID = json["mutationID"] as? String,
        mutationID.range(of: "^review/[A-Za-z0-9_-]{22}$", options: .regularExpression) != nil,
        let observationID = json["observationID"] as? String, observationID == mutationID,
        let taskID = json["taskID"] as? String, !taskID.isEmpty,
        let componentID = json["componentID"] as? String, !componentID.isEmpty,
        let outcome = json["outcome"] as? String, ["remembered", "forgotten"].contains(outcome),
        let timestamp = json["occurredAtTimestampMillis"] as? NSNumber,
        widgetSafeInteger(timestamp)
      else { throw WidgetProjectionStoreError.invalidInput("invalid pending review") }
      self.vaultID = vaultID
      self.mutationID = mutationID
      self.observationID = observationID
      self.taskID = taskID
      self.componentID = componentID
      self.outcome = outcome
      occurredAtTimestampMillis = timestamp.int64Value
    }

    func json(includeVault: Bool = true) -> [String: Any] {
      var value: [String: Any] = [
        "mutationID": mutationID, "observationID": observationID,
        "taskID": taskID, "componentID": componentID, "outcome": outcome,
        "occurredAtTimestampMillis": occurredAtTimestampMillis,
      ]
      if includeVault { value["vaultID"] = vaultID }
      return value
    }
  }

  private func excludingPending(_ items: [ProjectionItem], vaultID: String, state: State)
    -> [ProjectionItem]
  {
    let pending = Set(
      state.pendingReviews.filter { $0.vaultID == vaultID }.map {
        "\($0.taskID)\0\($0.componentID)"
      })
    return items.filter { !pending.contains("\($0.taskID)\0\($0.componentID)") }
  }

  private func decodeProjection(_ serialized: String) throws -> [ProjectionItem] {
    guard let data = serialized.data(using: .utf8),
      let items = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { throw WidgetProjectionStoreError.invalidInput("expected a review-item array") }
    let decoded = try items.map(ProjectionItem.init)
    let keys = decoded.map { "\($0.taskID)\0\($0.componentID)" }
    guard Set(keys).count == keys.count else {
      throw WidgetProjectionStoreError.invalidInput("duplicate review item")
    }
    return decoded
  }

  private func jsonString(_ value: Any) throws -> String {
    String(
      decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
      as: UTF8.self)
  }

  /// Every participant coordinates on the same *stable directory*, not the
  /// replaced file's inode. No asynchronous Repo work happens in this block.
  private func access<T>(_ operation: (inout State) throws -> (T, Bool)) throws -> T {
    var coordinationError: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator().coordinate(
      writingItemAt: fileURL.deletingLastPathComponent(), options: [], error: &coordinationError
    ) { _ in
      result = Result {
        let exists = FileManager.default.fileExists(atPath: fileURL.path)
        let json: [String: Any]
        if exists {
          guard
            let value = try JSONSerialization.jsonObject(with: Data(contentsOf: fileURL))
              as? [String: Any]
          else {
            throw WidgetProjectionStoreError.invariant("malformed widget handoff")
          }
          json = value
        } else {
          json = ["version": 1, "queue": [], "pendingReviews": []]
        }
        var state = try State(json)
        if let vaultID = state.selectedVaultID {
          state.queue = excludingPending(state.queue, vaultID: vaultID, state: state)
        }
        let (value, changed) = try operation(&state)
        if changed || !exists { try persist(state.json) }
        return value
      }
    }
    if let coordinationError { throw coordinationError }
    guard let result else {
      throw WidgetProjectionStoreError.persistence("file coordination did not run")
    }
    return try result.get()
  }

  private func persist(_ json: [String: Any]) throws {
    try JSONSerialization.data(withJSONObject: json, options: [.sortedKeys]).write(
      to: fileURL, options: .atomic)
    #if os(iOS)
      try FileManager.default.setAttributes(
        [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
        ofItemAtPath: fileURL.path)
    #endif
    // Accepted reviews must survive process termination. Request a persistence
    // barrier too; atomic replacement alone only prevents torn JSON writes.
    let descriptor = Darwin.open(fileURL.path, O_RDONLY)
    guard descriptor >= 0 else {
      throw WidgetProjectionStoreError.persistence("could not open handoff for synchronization")
    }
    defer { Darwin.close(descriptor) }
    guard fcntl(descriptor, F_FULLFSYNC) == 0 || fsync(descriptor) == 0 else {
      throw WidgetProjectionStoreError.persistence("could not synchronize widget handoff")
    }
    let directory = Darwin.open(fileURL.deletingLastPathComponent().path, O_RDONLY)
    guard directory >= 0 else {
      throw WidgetProjectionStoreError.persistence("could not synchronize handoff directory")
    }
    defer { Darwin.close(directory) }
    guard fsync(directory) == 0 || errno == EINVAL else {
      throw WidgetProjectionStoreError.persistence("could not synchronize handoff replacement")
    }
  }
}

private func widgetSafeNumber(_ number: NSNumber) -> Bool {
  CFGetTypeID(number) != CFBooleanGetTypeID() && number.doubleValue.isFinite
    && abs(number.doubleValue) <= 9_007_199_254_740_991
}

private func widgetSafeInteger(_ number: NSNumber) -> Bool {
  widgetSafeNumber(number) && number.doubleValue.rounded(.towardZero) == number.doubleValue
}
