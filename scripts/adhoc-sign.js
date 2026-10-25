'use strict';

// electron-builder afterSign hook (macOS only).
// Re-signs the whole .app bundle ad hoc so that it has a valid, sealed signature.
// Without it, an Apple Silicon Mac reports a quarantined app as "damaged".
// This is not a replacement for a Developer ID certificate + notarization.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Absolute path: the tool is a fixed part of macOS, so PATH is not consulted.
const CODESIGN = '/usr/bin/codesign';

module.exports = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync(CODESIGN, ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync(CODESIGN, ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed and verified  file=${appPath}`);
};
