/**
 * Metro Configuration for Expo
 *
 * Configured for monorepo support:
 * - Resolves @hellonext/shared package
 * - Watches workspace root for changes
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the workspace root
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages from
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force resolution of specific packages to the project's node_modules
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
