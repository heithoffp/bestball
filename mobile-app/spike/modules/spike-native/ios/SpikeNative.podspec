Pod::Spec.new do |s|
  s.name           = 'SpikeNative'
  s.version        = '1.0.0'
  s.summary        = 'TASK-318 spike stub module'
  s.description    = 'Throwaway Swift module proving the Windows -> EAS -> device JS<->Swift round-trip (spike Q4).'
  s.author         = 'Best Ball Exposures'
  s.homepage       = 'https://bestballexposures.com'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '**/*.{h,m,mm,swift}'
end
