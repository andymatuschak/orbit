Pod::Spec.new do |s|
  s.name = 'OrbitAutomerge'
  s.version = '0.0.1'
  s.summary = 'Orbit Expo bridge to the official Automerge Swift package'
  s.description = s.summary
  s.author = 'Orbit'
  s.homepage = 'https://withorbit.com'
  s.license = { :type => 'AGPL-3.0-or-later OR BUSL-1.1' }
  s.platforms = { :ios => '26.0' }
  s.swift_version = '6.0'
  s.source = { :git => 'https://github.com/andymatuschak/orbit.git' }
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'

  unless respond_to?(:spm_dependency, true)
    raise 'OrbitAutomerge requires React Native 0.75 or newer for spm_dependency'
  end

  # Use the prepared upstream packages, not Swift 0.7.2's older Rust binary.
  # lab:install applies the merged upstream core fix and builds its XCFramework.
  # Falling back to the released binary would reintroduce a native sync crash.
  repo_package = ENV['ORBIT_AUTOMERGE_REPO_PACKAGE']
  unless repo_package && File.file?(File.join(repo_package, 'Package.swift'))
    raise 'Run bun run lab:install to prepare the pinned Automerge native packages'
  end
  # AutomergeRepo publicly imports Automerge; avoid a second top-level product
  # which would archive the shared automergeFFI binary twice.
  spm_dependency(
    s,
    url: repo_package,
    requirement: { kind: 'exactVersion', version: '0.3.2' },
    products: ['AutomergeRepo']
  )

  # Xcode archives binary Swift-package signatures from both the shared build
  # directory and the CocoaPods target directory. Keep the shared copy so the
  # archive contains exactly one verified automergeFFI signature.
  s.script_phase = {
    name: 'Remove duplicate Automerge xcframework signature',
    script: 'rm -f "${CONFIGURATION_BUILD_DIR}/automergeFFI.xcframework-ios.signature"',
    execution_position: :after_compile
  }
end
