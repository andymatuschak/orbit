#if !ORBIT_WIDGET_EXTENSION
import AppIntents
import Foundation
import UniformTypeIdentifiers

struct IngestAppIntent: AppIntent, CustomIntentMigratedAppIntent {
    static let title: LocalizedStringResource = "Ingest"
    static let description = IntentDescription("Import an Orbit Ingestible file")
    static let intentClassName = "ShortcutIngestIntent"

    static let supportedModes: IntentModes = .foreground(.deferred)

    static var parameterSummary: some ParameterSummary {
        Summary("Ingest Orbit Tasks from \(\.$file)")
    }

    @Parameter(title: "File", supportedContentTypes: [.json])
    var file: IntentFile

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let data = try await file.data(contentType: .json)
        guard String(data: data, encoding: .utf8) != nil else {
            throw IngestAppIntentError.invalidUTF8
        }
        guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
            throw IngestAppIntentError.invalidJSON
        }

        try await PendingIngestQueue.shared.enqueue(data: data)
        return .result(dialog: "Orbit queued the file for import.")
    }
}

private enum IngestAppIntentError: LocalizedError {
    case appGroupUnavailable
    case invalidJSON
    case invalidUTF8
    case queueFull

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            "Orbit could not access its shared storage."
        case .invalidJSON:
            "The selected file does not contain valid JSON."
        case .invalidUTF8:
            "The selected file is not valid UTF-8 JSON."
        case .queueFull:
            "Orbit's import inbox is full. Open Orbit to resolve its pending imports, then try again."
        }
    }
}

private actor PendingIngestQueue {
    static let shared = PendingIngestQueue()

    private let appGroup = "group.com.withorbit.native"
    private let completedPayloadKeyPrefix = "completedIngestPayload."
    private let generationKey = "pendingIngestGeneration"
    private let inboxDirectoryName = "PendingIngest"
    private let maximumQueueSize = 100
    private let retryAfterKeyPrefix = "ingestRetryAfter."
    private let retryAttemptKeyPrefix = "ingestRetryAttempt."
    private let storageKey = "pendingIngestPayloads"

    func enqueue(data: Data) throws {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            throw IngestAppIntentError.appGroupUnavailable
        }
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroup
        ) else {
            throw IngestAppIntentError.appGroupUnavailable
        }

        var payloads = try readPayloads(from: defaults)
        let completedPayloads = payloads.filter { payload in
            defaults.bool(forKey: completedPayloadKeyPrefix + payload.id)
        }
        let completedPayloadIDs = Set(completedPayloads.map(\.id))
        payloads.removeAll { payload in
            completedPayloadIDs.contains(payload.id)
        }
        guard payloads.count < maximumQueueSize else {
            throw IngestAppIntentError.queueFull
        }

        let fileManager = FileManager.default
        let inboxURL = containerURL.appendingPathComponent(
            inboxDirectoryName,
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: inboxURL,
            withIntermediateDirectories: true
        )
        let payloadID = UUID().uuidString
        let payloadURL = inboxURL.appendingPathComponent("\(payloadID).json")
        try data.write(to: payloadURL, options: .atomic)

        payloads.append(
            PendingIngestPayload(id: payloadID, fileURL: payloadURL.absoluteString)
        )
        defaults.set(try JSONEncoder().encode(payloads), forKey: storageKey)
        defaults.set(defaults.integer(forKey: generationKey) + 1, forKey: generationKey)
        for payload in completedPayloads {
            defaults.removeObject(forKey: completedPayloadKeyPrefix + payload.id)
            defaults.removeObject(forKey: retryAfterKeyPrefix + payload.id)
            defaults.removeObject(forKey: retryAttemptKeyPrefix + payload.id)
            if let fileURL = URL(string: payload.fileURL) {
                try? fileManager.removeItem(at: fileURL)
            }
        }
    }

    private func readPayloads(from defaults: UserDefaults) throws -> [PendingIngestPayload] {
        guard let data = defaults.data(forKey: storageKey) else {
            return []
        }
        return try JSONDecoder().decode([PendingIngestPayload].self, from: data)
    }
}

private struct PendingIngestPayload: Codable, Sendable {
    let id: String
    let fileURL: String
}
#endif
