import Automerge
import AutomergeRepo
@preconcurrency import Combine
import Foundation

private let orbitRepoDocumentChangedEvent = "onRepoDocumentChanged"
private let orbitRepoSyncStateChangedEvent = "onRepoSyncStateChanged"

struct OrbitAutomergeRepoEvents {
  let documentChanged: @Sendable (_ localStoreID: String, _ documentURL: String) -> Void
  let syncStateChanged: @Sendable (_ localStoreID: String, _ state: String) -> Void
}

/// Owns one upstream Repo per local vault. AutomergeRepo's global actor is the
/// serialization boundary for local mutations, remote merges, and file saves.
@AutomergeRepo
final class OrbitAutomergeRepoStore {
  private var sessions: [String: OrbitAutomergeRepoSession] = [:]
  private let events: OrbitAutomergeRepoEvents

  nonisolated init(events: OrbitAutomergeRepoEvents) {
    self.events = events
  }

  func open(localStoreID: String) throws {
    if let existing = sessions[localStoreID] {
      existing.referenceCount += 1
      return
    }
    sessions[localStoreID] = try OrbitAutomergeRepoSession(
      localStoreID: localStoreID,
      events: events
    )
  }

  func close(localStoreID: String) async {
    guard let session = sessions[localStoreID] else { return }
    session.referenceCount -= 1
    guard session.referenceCount == 0 else { return }
    sessions.removeValue(forKey: localStoreID)
    await session.close()
  }

  func closeAll() async {
    let active = Array(sessions.values)
    sessions.removeAll()
    for session in active {
      await session.close()
    }
  }

  func contains(localStoreID: String, documentURLs: [String]) throws -> [Bool] {
    let session = try requireSession(localStoreID)
    return try documentURLs.map { try session.contains(documentURL: $0) }
  }

  func create(
    localStoreID: String,
    documentURL: String?,
    json: String
  ) async throws -> (documentURL: String, document: OrbitRepoMaterializedDocument) {
    try await requireSession(localStoreID).create(
      documentURL: documentURL,
      json: json
    )
  }

  func readAttachment(
    localStoreID: String,
    documentURL: String
  ) async throws -> OrbitRepoAttachment {
    try await requireSession(localStoreID).readAttachment(documentURL: documentURL)
  }

  func materialize(
    localStoreID: String,
    documentURL: String
  ) async throws -> OrbitRepoMaterializedDocument {
    try await requireSession(localStoreID).materialize(
      documentURL: documentURL
    )
  }

  func materialize(
    localStoreID: String,
    documentURLs: [String]
  ) async throws -> [OrbitRepoMaterializedDocument] {
    let session = try requireSession(localStoreID)
    var documents: [OrbitRepoMaterializedDocument] = []
    documents.reserveCapacity(documentURLs.count)
    for documentURL in documentURLs {
      documents.append(
        try await session.materialize(documentURL: documentURL)
      )
    }
    return documents
  }

  func hasHeads(
    localStoreID: String,
    documentURL: String,
    heads: [String]
  ) async throws -> Bool {
    try await requireSession(localStoreID).hasHeads(
      documentURL: documentURL,
      heads: heads
    )
  }

  func applyPatch(
    localStoreID: String,
    documentURL: String,
    patchJSON: String
  ) async throws {
    try await requireSession(localStoreID).applyPatch(
      documentURL: documentURL,
      patchJSON: patchJSON
    )
  }

  func ensure(localStoreID: String, documentURL: String) async throws -> Bool {
    try await requireSession(localStoreID).ensure(documentURL: documentURL)
  }

  func connect(
    localStoreID: String,
    websocketURL: String,
    pairingToken: String
  ) async throws {
    try await requireSession(localStoreID).connect(
      websocketURL: websocketURL,
      pairingToken: pairingToken
    )
  }

  func disconnect(localStoreID: String) async {
    guard let session = sessions[localStoreID] else { return }
    await session.disconnect()
  }

  private func requireSession(_ localStoreID: String) throws -> OrbitAutomergeRepoSession {
    guard let session = sessions[localStoreID] else {
      throw OrbitAutomergeRepoStoreError.repoNotOpen
    }
    return session
  }
}

@AutomergeRepo
private final class OrbitAutomergeRepoSession {
  var referenceCount = 1

  private let localStoreID: String
  private let storage: OrbitAutomergeFileStorage
  private let repo: Repo
  private let websocket: WebSocketProvider
  private let events: OrbitAutomergeRepoEvents
  private var documentObservers: [DocumentId: AnyCancellable] = [:]
  private var syncObserver: AnyCancellable?
  private var remoteStorageID: String?

  init(localStoreID: String, events: OrbitAutomergeRepoEvents) throws {
    self.localStoreID = localStoreID
    self.events = events
    storage = try OrbitAutomergeFileStorage(localStoreID: localStoreID)
    repo = Repo(
      sharePolicy: .agreeable,
      storage: storage,
      saveDebounce: .milliseconds(100),
      maxResolveFetchIterations: 40,
      resolveFetchIterationDelay: .milliseconds(500)
    )
    websocket = WebSocketProvider(
      // Repo Swift 0.3.2 uses `reconnectOnError` to keep its healthy receive
      // loop running, so `false` consumes only one post-handshake message.
      // Its retry-limit check also makes `1` exit before an internal retry,
      // leaving Orbit to reconnect with a paired credential.
      .init(reconnectOnError: true, maxNumberOfConnectRetries: 1)
    )
    repo.addNetworkAdapter(adapter: websocket)

    let storeID = localStoreID
    syncObserver = websocket.statePublisher.sink { state in
      events.syncStateChanged(storeID, orbitRepoSyncStateName(state))
    }
  }

  func contains(documentURL: String) throws -> Bool {
    let id = try orbitRepoDocumentID(documentURL)
    // Repo.documentIds() also includes requesting/loading handles. Those are
    // not evidence of local data: treating a pending fetch as a cache hit lets
    // local-first opening or connection priming wait on a peer that isn't
    // connected yet. watch() is installed only after find resolves a document.
    if documentObservers[id] != nil { return true }
    return try storage.contains(id: id)
  }

  func create(
    documentURL: String?,
    json: String
  ) async throws -> (documentURL: String, document: OrbitRepoMaterializedDocument) {
    let id = try documentURL.map(orbitRepoDocumentID) ?? DocumentId()
    if try storage.contains(id: id) { throw Errors.DuplicateID(id: id) }
    let handle = try await repo.create(id: id)
    watch(handle)
    try initializeRepoDocument(handle.doc, json: json)
    // The Repo owns the actual document throughout creation. Await durable
    // ordinary-file storage before returning its projection, never exported
    // Automerge bytes which JavaScript would have to send back into the Repo.
    try await storage.save(id: handle.id, data: handle.doc.save())
    return (
      documentURL: "automerge:\(handle.id.description)",
      document: try materializeRepoDocument(handle.doc)
    )
  }

  func readAttachment(documentURL: String) async throws -> OrbitRepoAttachment {
    let handle = try await find(documentURL: documentURL)
    return try readRepoAttachment(handle.doc)
  }

  func materialize(
    documentURL: String
  ) async throws -> OrbitRepoMaterializedDocument {
    let handle = try await find(documentURL: documentURL)
    return try materializeRepoDocument(handle.doc)
  }

  func hasHeads(documentURL: String, heads: [String]) async throws -> Bool {
    let handle = try await find(documentURL: documentURL)
    return try orbitDocumentHasHeads(handle.doc, heads: heads)
  }

  func applyPatch(
    documentURL: String,
    patchJSON: String
  ) async throws {
    let handle = try await find(documentURL: documentURL)
    try applyDocumentPatch(
      document: handle.doc,
      patchJSON: patchJSON
    )
    // Repo observes the in-memory change and schedules peer sync itself. Await
    // our ordinary-file provider directly so a local mutation never depends on
    // the state of that peer sync before JS sees durable success.
    try await storage.save(id: handle.id, data: handle.doc.save())
  }

  func ensure(documentURL: String) async throws -> Bool {
    let id = try orbitRepoDocumentID(documentURL)
    do {
      let wasLoaded = repo.documentIds().contains(id)
      let wasStored = try storage.contains(id: id)
      let wasLocal = wasLoaded || wasStored
      let handle = try await repo.find(id: id)
      watch(handle)
      // Repo.find returns an already-local handle without initiating sync.
      // That is normally fine because Repo syncs every loaded handle when a
      // peer first appears, but Orbit may materialize more of its warm working
      // set immediately after that peer event. Re-importing the same handle is
      // Repo Swift's public, non-mutating way to request sync for an existing
      // document; Automerge merges an equivalent copy and Repo announces it to
      // all current peers. The copy matters: merging a Document object with
      // that exact same instance does not complete.
      if wasLocal && !repo.peers().isEmpty {
        let syncCopy = try Document(handle.doc.save())
        _ = try await repo.import(handle: DocHandle(id: id, doc: syncCopy))
      }
      return true
    } catch is Errors.Unavailable {
      return false
    }
  }

  func connect(
    websocketURL: String,
    pairingToken: String
  ) async throws {
    guard
      let url = URL(string: websocketURL),
      ["ws", "wss"].contains(url.scheme?.lowercased() ?? ""),
      url.user == nil,
      url.password == nil,
      url.fragment == nil,
      !pairingToken.isEmpty,
      pairingToken.utf8.count <= 8_192,
      pairingToken.rangeOfCharacter(from: .whitespacesAndNewlines) == nil
    else {
      throw OrbitAutomergeRepoStoreError.invalidSyncConnection
    }

    if !websocket.peeredConnections.isEmpty {
      await websocket.disconnect()
    }
    var request = URLRequest(url: url)
    request.setValue(
      "Bearer \(pairingToken)",
      forHTTPHeaderField: "Authorization"
    )
    try await websocket.connect(to: request)

    guard let connection = websocket.peeredConnections.first,
      connection.peered,
      let storageID = connection.peerMetadata?.storageId,
      !storageID.isEmpty,
      remoteStorageID == nil || remoteStorageID == storageID
    else {
      await websocket.disconnect()
      throw OrbitAutomergeRepoStoreError.unexpectedSyncPeer
    }
    remoteStorageID = storageID
  }

  func disconnect() async {
    await websocket.disconnect()
  }

  func close() async {
    documentObservers.removeAll()
    syncObserver?.cancel()
    syncObserver = nil
    await websocket.disconnect()
  }

  private func watch(_ handle: DocHandle) {
    guard documentObservers[handle.id] == nil else { return }
    let storeID = localStoreID
    let documentURL = "automerge:\(handle.id.description)"
    // Orbit consumers need the merged heads and values, not advance notice of
    // a mutation. objectWillChange fires before Repo applies a remote sync
    // message, which let JavaScript reproject the old queue with no later
    // notification. Automerge pairs it with objectDidChange after the update
    // is complete specifically so observers can safely read the new state.
    documentObservers[handle.id] = handle.doc.objectDidChange.sink { [events] _ in
      events.documentChanged(storeID, documentURL)
    }
  }

  private func find(documentURL: String) async throws -> DocHandle {
    let handle = try await repo.find(id: orbitRepoDocumentID(documentURL))
    watch(handle)
    return handle
  }
}

private func orbitRepoDocumentID(_ documentURL: String) throws -> DocumentId {
  let prefix = "automerge:"
  guard
    documentURL.hasPrefix(prefix),
    !documentURL.contains("/"),
    !documentURL.contains("#"),
    let id = DocumentId(String(documentURL.dropFirst(prefix.count)))
  else {
    throw OrbitAutomergeRepoStoreError.invalidDocumentIdentifier
  }
  return id
}

private func orbitRepoSyncStateName(_ state: WebSocketProviderState) -> String {
  switch state {
  case .connected: "connected"
  case .ready: "ready"
  case .reconnecting: "reconnecting"
  case .disconnected: "disconnected"
  }
}

private enum OrbitAutomergeRepoStoreError: String, LocalizedError {
  case invalidDocumentIdentifier
  case invalidSyncConnection
  case repoNotOpen
  case unexpectedSyncPeer

  var errorDescription: String? { rawValue }
}

let orbitRepoEvents = (
  documentChanged: orbitRepoDocumentChangedEvent,
  syncStateChanged: orbitRepoSyncStateChangedEvent
)
