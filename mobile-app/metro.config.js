const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The TASK-318 spike is a self-contained Expo project nested inside this one.
// Metro must never crawl into it — its node_modules carries a second copy of
// react / react-native that would poison module resolution.
config.resolver.blockList = [
  new RegExp(`${path.resolve(__dirname, 'spike').replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`),
];

module.exports = config;
