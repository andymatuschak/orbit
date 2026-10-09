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

  # AutomergeRepo publicly imports Automerge, so linking its package is enough
  # for both modules. Adding automerge-swift separately makes Xcode archive the
  # shared automergeFFI binary artifact twice.
  spm_dependency(
    s,
    url: 'https://github.com/automerge/automerge-repo-swift.git',
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
