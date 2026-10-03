const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Yjs uses lib0 only for secure random IDs; use the maintained Expo native API.
  if (platform !== 'web' && moduleName === 'lib0/webcrypto') {
    return { filePath: path.resolve(__dirname, 'src/services/yjs-crypto.ts'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
