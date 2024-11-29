#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { platform } from 'os';

const CONSOLE_YELLOW = '\x1b[33m';
const CONSOLE_RESET = '\x1b[0m';

/**
 * Checks if windows-build-tools is installed globally
 * @returns {boolean} True if installed or not on Windows
 */
const checkWindowsBuildTools = () => {
  const result = spawnSync('npm', ['list', '-g', 'windows-build-tools']);
  if (result.status !== 0) {
    console.warn(`${CONSOLE_YELLOW}Warning: windows-build-tools not found.`);
    console.warn('You may need to install it by running:');
    console.warn(`npm install --global windows-build-tools${CONSOLE_RESET}`);
    return false;
  }
  return true;
};

/**
 * Checks if SQLite3 is installed on Unix-like systems
 * @param {string} currentPlatform - The OS platform
 * @returns {boolean} True if installed or not on Unix-like system
 */
const checkUnixSqlite = (currentPlatform) => {
  const result = spawnSync('sqlite3', ['--version']);
  if (result.status !== 0) {
    console.warn(`${CONSOLE_YELLOW}Warning: SQLite3 not found.`);
    console.warn('Please install SQLite3 development files:');

    const installCommand = currentPlatform === 'darwin'
      ? 'brew install sqlite3'
      : 'sudo apt-get install sqlite3 libsqlite3-dev';

    console.warn(installCommand);
    console.warn(CONSOLE_RESET);
    return false;
  }
  return true;
};

/**
 * Checks if node-gyp is installed
 * @returns {boolean} True if installed
 */
const checkNodeGyp = () => {
  try {
    require('node-gyp');
    return true;
  } catch {
    console.warn(`${CONSOLE_YELLOW}Warning: node-gyp not found.`);
    console.warn('You may need to install build tools:');
    console.warn(`npm install -g node-gyp${CONSOLE_RESET}`);
    return false;
  }
};

/**
 * Checks SQLite installation and dependencies
 * @returns {boolean} True if all required dependencies are installed
 */
export const checkSqlite = () => {
  console.log('Checking SQLite installation...');

  const currentPlatform = platform();
  const checks = [
    currentPlatform === 'win32'
      ? checkWindowsBuildTools()
      : checkUnixSqlite(currentPlatform),
    checkNodeGyp()
  ];

  return checks.every(Boolean);
};

// Execute if running as script
if (import.meta.url === `file://${process.argv[1]}`) {
  checkSqlite();
}
