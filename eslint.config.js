const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'dist-android/**', 'node_modules/**', 'server/node_modules/**', 'android/**', 'ios/**', '.expo/**'] },
]);
