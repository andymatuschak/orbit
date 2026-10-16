// swift-tools-version: 5.9
import PackageDescription

// The runner supplies the resolved Swift wrappers and the exact FFI binary
// being checked. No download, app installation, or vault access is involved.
let package = Package(
  name: "AutomergeSyncRegression",
  platforms: [.macOS(.v13)],
  targets: [
    .binaryTarget(name: "automergeFFI", path: "automergeFFI.xcframework"),
    .target(name: "AutomergeUniffi", dependencies: ["automergeFFI"], path: "AutomergeUniffi"),
    .target(name: "Automerge", dependencies: ["AutomergeUniffi"], path: "Automerge"),
    .executableTarget(name: "SyncRegression", dependencies: ["Automerge"], path: "Sources"),
  ]
)
