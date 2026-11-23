#!/usr/bin/env node
/**
 * Copies the built renderer bundle (`dist/`) into the Android app so the
 * WebView loads exactly the same UI as the desktop build.
 *
 * The Android assets used to be updated by hand, which silently shipped a
 * stale bundle inside the APK (old hashed filenames accumulated next to the
 * new ones). Always replace the whole directory instead of copying on top.
 *
 * Usage:
 *   npm run build:renderer && npm run android:assets
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const targetDir = path.join(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'web');

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[android:assets] dist/index.html not found — run "npm run build:renderer" first.');
  process.exit(1);
}

/**
 * Recursive copy without `fs.cpSync`, which crashes the Node process on this
 * Windows setup (exit 0xC0000409) instead of reporting an error.
 */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, destination);
    else fs.copyFileSync(source, destination);
  }
}

fs.rmSync(targetDir, { recursive: true, force: true });
copyTree(distDir, targetDir);

const assetsDir = path.join(targetDir, 'assets');
const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
const html = fs.readFileSync(path.join(targetDir, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/assets\/([^"']+)/g)].map((m) => m[1]);
const missing = referenced.filter((name) => !assets.includes(name));

console.log(`[android:assets] synced dist/ -> ${path.relative(repoRoot, targetDir)}`);
console.log(`[android:assets] assets on disk: ${assets.join(', ') || '(none)'}`);

if (missing.length > 0) {
  console.error(`[android:assets] index.html references missing files: ${missing.join(', ')}`);
  process.exit(1);
}
