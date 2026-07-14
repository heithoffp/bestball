/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'DraftGlance',
  displayName: 'BBE Draft Glance',
  bundleIdentifier: '.draftglance',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $widgetBackground: '#060E1F',
    $accent: '#E8BF4A',
  },
};
