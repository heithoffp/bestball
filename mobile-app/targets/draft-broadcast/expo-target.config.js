/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'broadcast-upload',
  name: 'DraftBroadcast',
  // Shown in the iOS broadcast picker list.
  displayName: 'BBE Draft Capture',
  bundleIdentifier: '.draftbroadcast',
  deploymentTarget: '16.2',
  frameworks: ['ReplayKit', 'Vision', 'JavaScriptCore', 'CoreImage'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.bestballexposures.app'],
  },
};
