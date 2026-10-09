import AutomergeRepo
import CryptoKit
import Foundation

/// A deliberately small Repo storage provider. Each Automerge document has
/// one atomic snapshot file and an ordered directory of incremental chunks.
/// Repo owns compaction; Orbit only supplies durable filesystem operations.
@AutomergeRepo
final class OrbitAutomergeFileStorage: StorageProvider {
  nonisolated let id: STORAGE_ID

  private let rootDirectory: URL

  nonisolated init(localStoreID: String) throws {
    guard !localStoreID.isEmpty, localStoreID.utf8.count <= 256 else {
      throw OrbitAutomergeFileStorageError.invalidStoreID
    }
    guard
      let applicationSupport = FileManager.default.urls(
        for: .applicationSupportDirectory,
        in: .userDomainMask
      ).first
    else {
      throw OrbitAutomergeFileStorageError.missingApplicationSupport
    }

    id = "orbit-native-storage-\(localStoreID)"
    rootDirectory = applicationSupport
      .appendingPathComponent("Orbit", isDirectory: true)
      .appendingPathComponent("Automerge", isDirectory: true)
      .appendingPathComponent("repos", isDirectory: true)
      .appendingPathComponent(
        orbitAutomergeSHA256Hex(Data(localStoreID.utf8)),
        isDirectory: true
      )
    try FileManager.default.createDirectory(
      at: rootDirectory,
      withIntermediateDirectories: true,
      attributes: [
        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
      ]
    )
  }

  func load(id: DocumentId) async throws -> Data? {
    let url = snapshotURL(for: id)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return try Data(contentsOf: url)
  }

  func save(id: DocumentId, data: Data) async throws {
    let directory = documentDirectory(for: id)
    try createDirectory(directory)
    try writeAtomically(data, to: snapshotURL(for: id))
  }

  func remove(id: DocumentId) async throws {
    let directory = documentDirectory(for: id)
    guard FileManager.default.fileExists(atPath: directory.path) else { return }
    try FileManager.default.removeItem(at: directory)
  }

  func addToRange(
    id: DocumentId,
    prefix: String,
    data: Data
  ) async throws {
    guard !data.isEmpty else { return }
    let directory = rangeDirectory(for: id, prefix: prefix)
    try createDirectory(directory)

    let digest = orbitAutomergeSHA256Hex(data)
    let existing = try rangeFileURLs(in: directory)
    if existing.contains(where: { $0.lastPathComponent.contains("-\(digest).") }) {
      return
    }
    let maximumSequence = existing
      .compactMap { orbitAutomergeChunkSequence($0) }
      .max()
    guard maximumSequence != UInt64.max else {
      throw OrbitAutomergeFileStorageError.rangeSequenceExhausted
    }
    let nextSequence = maximumSequence.map { $0 + 1 } ?? 0
    let filename = String(format: "%020llu-%@.amchange", nextSequence, digest)
    try writeAtomically(
      data,
      to: directory.appendingPathComponent(filename, isDirectory: false)
    )
  }

  func loadRange(id: DocumentId, prefix: String) async throws -> [Data] {
    let directory = rangeDirectory(for: id, prefix: prefix)
    guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
    return try rangeFileURLs(in: directory).map { try Data(contentsOf: $0) }
  }

  func removeRange(
    id: DocumentId,
    prefix: String,
    data: [Data]
  ) async throws {
    guard !data.isEmpty else { return }
    let directory = rangeDirectory(for: id, prefix: prefix)
    guard FileManager.default.fileExists(atPath: directory.path) else { return }

    var remainingDigests = data.reduce(into: [String: Int]()) { counts, value in
      counts[orbitAutomergeSHA256Hex(value), default: 0] += 1
    }
    for file in try rangeFileURLs(in: directory) {
      guard
        let digest = orbitAutomergeChunkDigest(file),
        let remaining = remainingDigests[digest],
        remaining > 0
      else { continue }
      try FileManager.default.removeItem(at: file)
      remainingDigests[digest] = remaining - 1
    }
    if try rangeFileURLs(in: directory).isEmpty {
      try FileManager.default.removeItem(at: directory)
    }
  }

  func contains(id: DocumentId) throws -> Bool {
    if FileManager.default.fileExists(atPath: snapshotURL(for: id).path) {
      return true
    }
    let changes = rangeDirectory(for: id, prefix: "incrChanges")
    guard FileManager.default.fileExists(atPath: changes.path) else {
      return false
    }
    return !(try rangeFileURLs(in: changes)).isEmpty
  }

  private func documentDirectory(for id: DocumentId) -> URL {
    rootDirectory.appendingPathComponent(id.description, isDirectory: true)
  }

  private func snapshotURL(for id: DocumentId) -> URL {
    documentDirectory(for: id)
      .appendingPathComponent("snapshot.automerge", isDirectory: false)
  }

  private func rangeDirectory(for id: DocumentId, prefix: String) -> URL {
    documentDirectory(for: id)
      .appendingPathComponent("ranges", isDirectory: true)
      .appendingPathComponent(
        orbitAutomergeSHA256Hex(Data(prefix.utf8)),
        isDirectory: true
      )
  }

  private func rangeFileURLs(in directory: URL) throws -> [URL] {
    try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
    .filter { $0.pathExtension == "amchange" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  private func createDirectory(_ url: URL) throws {
    try FileManager.default.createDirectory(
      at: url,
      withIntermediateDirectories: true,
      attributes: [
        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
      ]
    )
  }

  private func writeAtomically(_ data: Data, to url: URL) throws {
    try data.write(to: url, options: .atomic)
    // Atomic replacement creates a new inode, so apply protection to each
    // finished file rather than relying on directory inheritance.
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: url.path
    )
  }
}

private func orbitAutomergeSHA256Hex(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func orbitAutomergeChunkSequence(_ url: URL) -> UInt64? {
  guard let prefix = url.lastPathComponent.split(separator: "-", maxSplits: 1).first
  else { return nil }
  return UInt64(prefix)
}

private func orbitAutomergeChunkDigest(_ url: URL) -> String? {
  let name = url.deletingPathExtension().lastPathComponent
  let components = name.split(separator: "-", maxSplits: 1)
  guard components.count == 2 else { return nil }
  return String(components[1])
}

private enum OrbitAutomergeFileStorageError: String, LocalizedError {
  case invalidStoreID
  case missingApplicationSupport
  case rangeSequenceExhausted

  var errorDescription: String? { rawValue }
}
