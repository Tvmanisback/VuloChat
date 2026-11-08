// Prepares the native Android project for VuloChat.
//
//  1. Generates android/ with Capacitor the first time (npx cap add android).
//  2. Copies the latest website build (www/) into the native project.
//  3. Adds the permissions VuloChat needs and keeps the keyboard from covering the composer.
//  4. Adds release signing that reads environment variables, so keystores never live in git.
//
// Run from the Android/ folder:  node scripts/prepare-android.mjs

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const androidDir = path.join(root, 'android');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!existsSync(path.join(androidDir, 'app'))) {
  console.log('Generating native Android project…');
  run('npx cap add android');
}

if (!existsSync(path.join(root, 'www', 'index.html'))) {
  throw new Error('www/index.html is missing. Build the website first and copy dist/ into Android/www.');
}
run('npx cap sync android');

// ---- AndroidManifest.xml ----
const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.INTERNET',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.POST_NOTIFICATIONS',
];
for (const perm of permissions) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace('<application', `<uses-permission android:name="${perm}" />\n    <application`);
  }
}
manifest = manifest.replace(/(<activity[^>]*android:name="\.MainActivity"[^>]*)(>)/, (match, head, close) =>
  head.includes('windowSoftInputMode') ? match : `${head} android:windowSoftInputMode="adjustResize"${close}`,
);
writeFileSync(manifestPath, manifest);

// ---- app/build.gradle ----
const gradlePath = path.join(androidDir, 'app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionName "[^"]*"/, 'versionName "1.0.0"');
if (!gradle.includes('VULO_SIGNING')) {
  gradle += `

// VULO_SIGNING: release signing comes from environment variables (set by CI or locally).
// Without VULO_KEYSTORE_PATH the release build is left unsigned and assembleDebug still works.
android {
    signingConfigs {
        release {
            if (System.getenv('VULO_KEYSTORE_PATH')) {
                storeFile file(System.getenv('VULO_KEYSTORE_PATH'))
                storePassword System.getenv('VULO_KEYSTORE_PASSWORD')
                keyAlias System.getenv('VULO_KEY_ALIAS')
                keyPassword System.getenv('VULO_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('VULO_KEYSTORE_PATH')) {
                signingConfig signingConfigs.release
            }
        }
    }
}
`;
}
writeFileSync(gradlePath, gradle);

console.log('Android project is ready. Build with: cd android && ./gradlew assembleRelease');
