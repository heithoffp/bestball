Pod::Spec.new do |s|
  s.name           = 'BBEDraftNative'
  s.version        = '1.0.0'
  s.summary        = 'BBE live draft session native surface'
  s.description    = 'ActivityKit Live Activity bridge + Vision OCR for the Live Draft Session (EPIC-08, ADR-021).'
  s.author         = 'Best Ball Exposures'
  s.homepage       = 'https://bestballexposures.com'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'Photos', 'ReplayKit'
  s.weak_frameworks = 'ActivityKit'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '**/*.{h,m,mm,swift}'
end
