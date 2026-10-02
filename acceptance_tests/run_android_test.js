import { AndroidAdapter } from '../core/adapters/android-adapter.js';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const GRADLE_BIN = "C:\\Users\\Admin\\.gradle\\wrapper\\dists\\gradle-8.7-bin\\bhs2wmbdwecv87pi65oeuq5iu\\gradle-8.7\\bin\\gradle.bat";

async function main() {
  const workspaceDir = resolve(import.meta.dirname, 'test_android');
  const adapter = new AndroidAdapter(workspaceDir);

  console.log('=== JARVIS REAL ANDROID RUNTIME ACCEPTANCE TEST ===\n');

  // 1. Device Discovery
  console.log('[1/8] Inspecting Connected ADB Devices...');
  const devices = adapter.getConnectedDevices();
  console.log('Discovered Devices:', devices);
  if (!devices || devices.length === 0) {
    console.error('VERDICT: NOT_CONFIGURED — NO_DEVICE');
    process.exit(1);
  }
  const deviceId = devices[0];
  console.log(`Targeting Physical Device: ${deviceId}\n`);

  adapter.wakeAndUnlock();

  // 2. Dynamic APK Discovery
  console.log('[2/8] Dynamically Discovering Built APK...');
  const apkPath = adapter.findApk(workspaceDir);
  console.log('Discovered APK Path:', apkPath);
  if (!apkPath || !fs.existsSync(apkPath)) {
    console.error('VERDICT: BLOCKED — No APK found');
    process.exit(1);
  }

  // 3. Dynamic Package & Launcher Discovery
  console.log('[3/8] Dynamically Extracting Package and Launcher via AAPT...');
  const apkInfo = adapter.getApkInfo(apkPath);
  console.log('Extracted APK Info:', apkInfo);
  if (!apkInfo.packageName) {
    console.error('VERDICT: BLOCKED — Could not determine package name');
    process.exit(1);
  }
  const { packageName, launcherActivity } = apkInfo;

  // 4. Clean Install & Launch
  console.log('[4/8] Installing APK on Device...');
  const installRes = adapter.installApk(apkPath);
  console.log('Install Result:', installRes.ok ? 'SUCCESS' : 'FAILED', installRes.stdout || installRes.stderr);

  adapter.clearLogcat();

  console.log(`[5/8] Launching App: ${packageName}/${launcherActivity}...`);
  const launchRes = adapter.launchApp(packageName, launcherActivity);
  console.log('Launch Output:', launchRes.stdout || launchRes.stderr);

  // Wait for activity to render
  await new Promise(r => setTimeout(r, 3000));

  // 5. Initial Observation & Dump UI
  console.log('[6/8] Dumping Initial UI Hierarchy and Capturing Screenshot...');
  const initialDump = adapter.dumpUI();
  const initialScreenshot = join(workspaceDir, 'screenshot_initial.png');
  adapter.captureScreenshot(initialScreenshot);
  console.log('Initial UI XML Length:', initialDump.uiState?.length || 0);
  console.log('Initial Screenshot Saved:', initialScreenshot);

  // 6. Dynamic Semantic Element Discovery and Real Interaction
  console.log('[7/8] Locating Clickable Element Dynamically (No Hardcoded Coordinates)...');
  const buttonNode = adapter.findNodeBounds(initialDump.uiState, { className: 'android.widget.Button' });
  console.log('Found Button Node Dynamically:', buttonNode);

  if (!buttonNode) {
    console.error('VERDICT: FAILED — No button element found in UI hierarchy');
    process.exit(1);
  }

  console.log(`Performing Dynamic Tap at Center Coordinates: (${buttonNode.x}, ${buttonNode.y})...`);
  adapter.tap(buttonNode.x, buttonNode.y);

  // Wait for state transition
  await new Promise(r => setTimeout(r, 2000));

  // 7. Post-Interaction Observation & State Verification
  console.log('[8/8] Dumping Post-Interaction UI and Verifying Observable State Change...');
  const postDump = adapter.dumpUI();
  const postScreenshot = join(workspaceDir, 'screenshot_post_interaction.png');
  adapter.captureScreenshot(postScreenshot);
  console.log('Post-Interaction Screenshot Saved:', postScreenshot);

  const stateChanged = initialDump.uiState !== postDump.uiState;
  const targetTextFound = postDump.uiState.includes('Action Completed Successfully');

  console.log('\n--- WORKING APP RUNTIME EVIDENCE ---');
  console.log('UI Hierarchy Changed:', stateChanged ? 'YES' : 'NO');
  console.log('Observable State Change Confirmed:', targetTextFound ? 'YES' : 'NO');
  console.log('Working App Verdict:', (stateChanged && targetTextFound) ? 'PASS' : 'FAIL');

  if (!stateChanged || !targetTextFound) {
    console.error('Working app failed to change state. Halting.');
    process.exit(1);
  }

  // =========================================================================
  // FAILURE TEST (Inject real UI state bug, rebuild, reinstall, observe failure)
  // =========================================================================
  console.log('\n=== ANDROID FAILURE TEST: INJECTING REAL UI/STATE BUG ===');
  const mainActivityPath = join(workspaceDir, 'app', 'src', 'main', 'java', 'org', 'jarvis', 'testapp', 'MainActivity.java');
  let originalCode = fs.readFileSync(mainActivityPath, 'utf-8');

  // Inject bug: make onClick do nothing so state never updates
  let buggyCode = originalCode.replace(
    'statusView.setText("State Changed: Action Completed Successfully");',
    '// BUG INJECTED: Button click does nothing\n                // statusView.setText(...);'
  );
  fs.writeFileSync(mainActivityPath, buggyCode, 'utf-8');
  console.log('Injected bug: click listener disabled.');

  console.log('Rebuilding Buggy APK with Gradle...');
  execSync(`"${GRADLE_BIN}" assembleDebug`, { cwd: workspaceDir, encoding: 'utf-8' });

  console.log('Reinstalling and Launching Buggy APK...');
  adapter.installApk(apkPath);
  adapter.stopApp(packageName);
  await new Promise(r => setTimeout(r, 1000));
  adapter.launchApp(packageName, launcherActivity);
  await new Promise(r => setTimeout(r, 3000));

  const buggyInitialDump = adapter.dumpUI();
  const buggyButtonNode = adapter.findNodeBounds(buggyInitialDump.uiState, { className: 'android.widget.Button' });
  adapter.tap(buggyButtonNode.x, buggyButtonNode.y);
  await new Promise(r => setTimeout(r, 2000));

  const buggyPostDump = adapter.dumpUI();
  const buggyStateChanged = buggyInitialDump.uiState !== buggyPostDump.uiState;
  const buggyTargetFound = buggyPostDump.uiState.includes('Action Completed Successfully');

  console.log('Buggy App UI Changed:', buggyStateChanged ? 'YES' : 'NO');
  console.log('Buggy App Target Text Found:', buggyTargetFound ? 'YES' : 'NO');
  const failureDetected = !buggyStateChanged && !buggyTargetFound;
  console.log('Failure Test Result:', failureDetected ? 'PASS (Correctly Detected Bug / Inaction)' : 'FAIL');

  const failureScreenshot = join(workspaceDir, 'screenshot_failure_test.png');
  adapter.captureScreenshot(failureScreenshot);
  console.log('Failure Screenshot Saved:', failureScreenshot);

  // =========================================================================
  // RECOVERY & REPAIR (Restore working code, rebuild, reinstall, verify PASS)
  // =========================================================================
  console.log('\n=== ANDROID RECOVERY & REPAIR ===');
  console.log('Applying repair to MainActivity.java...');
  fs.writeFileSync(mainActivityPath, originalCode, 'utf-8');

  console.log('Rebuilding Repaired APK with Gradle...');
  execSync(`"${GRADLE_BIN}" assembleDebug`, { cwd: workspaceDir, encoding: 'utf-8' });

  console.log('Reinstalling Repaired APK...');
  adapter.installApk(apkPath);
  adapter.stopApp(packageName);
  await new Promise(r => setTimeout(r, 1000));
  adapter.launchApp(packageName, launcherActivity);
  await new Promise(r => setTimeout(r, 3000));

  const repairedInitialDump = adapter.dumpUI();
  const repairedButton = adapter.findNodeBounds(repairedInitialDump.uiState, { className: 'android.widget.Button' });
  adapter.tap(repairedButton.x, repairedButton.y);
  await new Promise(r => setTimeout(r, 2000));

  const repairedPostDump = adapter.dumpUI();
  const repairedStateChanged = repairedInitialDump.uiState !== repairedPostDump.uiState;
  const repairedTargetFound = repairedPostDump.uiState.includes('Action Completed Successfully');

  console.log('Repaired App UI Changed:', repairedStateChanged ? 'YES' : 'NO');
  console.log('Repaired App Target Text Found:', repairedTargetFound ? 'YES' : 'NO');
  console.log('Post-Repair Verdict:', (repairedStateChanged && repairedTargetFound) ? 'PASS' : 'FAIL');

  const repairedScreenshot = join(workspaceDir, 'screenshot_repaired.png');
  adapter.captureScreenshot(repairedScreenshot);
  console.log('Repaired Screenshot Saved:', repairedScreenshot);

  const logcatRes = adapter.captureLogcat();
  const logcatSnippet = logcatRes.stdout.split('\n').filter(l => l.includes(packageName)).slice(-20).join('\n');
  console.log('\n--- LOGCAT SNIPPET FOR PACKAGE ---');
  console.log(logcatSnippet || '(No package-specific errors logged)');

  console.log('\n=== ALL REAL ANDROID RUNTIME ACCEPTANCE TESTS COMPLETE ===');
}

main().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
