Pod::Spec.new do |s|
  s.name = 'OrbitHardwareKeyboard'
  s.version = '1.0.0'
  s.summary = 'Hardware keyboard shortcuts for Orbit'
  s.description = s.summary
  s.author = 'Orbit'
  s.homepage = 'https://withorbit.com'
  s.license = { :type => 'AGPL-3.0-or-later OR BUSL-1.1' }
  s.platforms = { :ios => '26.0' }
  s.swift_version = '6.0'
  s.source = { :git => 'https://github.com/andymatuschak/orbit.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GameController'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
