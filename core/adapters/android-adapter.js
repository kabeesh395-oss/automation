/**
 * JARVIS Generic Android Runtime Adapter (Phase 5)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export class AndroidAdapter {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
    this.adbPath = this._findAdb();
  }

  _findAdb() {
    const androidHome = process.env.ANDROID_HOME || 'C:\\Android\\sdk';
    const adbPath = join(androidHome, 'platform-tools', 'adb.exe');
    return existsSync(adbPath) ? adbPath : 'adb';
  }

  _runAdb(args, timeoutMs = 60000) {
    try {
      const stdout = execSync(`"${this.adbPath}" ${args}`, {
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { ok: true, stdout: stdout.trim(), exitCode: 0 };
    } catch (err) {
      return {
        ok: err.status === 0,
        stdout: err.stdout?.trim() || '',
        stderr: err.stderr?.trim() || err.message,
        exitCode: err.status ?? 1
      };
    }
  }

  /**
   * Discovers connected devices.
   */
  getConnectedDevices() {
    const res = this._runAdb('devices');
    if (!res.ok) return [];
    const lines = res.stdout.split('\n').filter(l => l.trim().length > 0);
    return lines.slice(1).filter(l => !l.includes('daemon')).map(l => l.split('\t')[0]);
  }

  /**
   * Installs an APK.
   */
  installApk(apkPath) {
    return this._runAdb(`install -r -t "${apkPath}"`);
  }

  /**
   * Parses AndroidManifest.xml (if available) to determine package and launcher activity.
   */
  getAppInfo() {
    const manifestPath = join(this.workspaceDir, 'app', 'src', 'main', 'AndroidManifest.xml');
    if (!existsSync(manifestPath)) return null;

    const manifest = readFileSync(manifestPath, 'utf-8');
    
    // Extract package name
    let packageName = null;
    const pkgMatch = manifest.match(/package="([^"]+)"/);
    if (pkgMatch) {
      packageName = pkgMatch[1];
    } else {
      // In newer gradle versions, applicationId is in build.gradle
      const gradlePath = join(this.workspaceDir, 'app', 'build.gradle');
      const ktsPath = join(this.workspaceDir, 'app', 'build.gradle.kts');
      let buildFile = existsSync(gradlePath) ? gradlePath : (existsSync(ktsPath) ? ktsPath : null);
      if (buildFile) {
        const buildContent = readFileSync(buildFile, 'utf-8');
        const appIdMatch = buildContent.match(/applicationId\s*=?\s*["']([^"']+)["']/);
        if (appIdMatch) packageName = appIdMatch[1];
      }
    }

    // Extract launcher activity
    let launcherActivity = null;
    const activityRegex = /<activity[^>]*android:name="([^"]+)"[^>]*>[\s\S]*?<category android:name="android\.intent\.category\.LAUNCHER"[\s\S]*?<\/activity>/;
    const activityMatch = manifest.match(activityRegex);
    if (activityMatch) {
      launcherActivity = activityMatch[1];
      if (launcherActivity.startsWith('.')) {
        launcherActivity = packageName + launcherActivity;
      }
    }

    return { packageName, launcherActivity };
  }

  /**
   * Launches the application.
   */
  launchApp(packageName, launcherActivity) {
    if (!launcherActivity) {
      // Use monkey if launcher activity is unknown
      return this._runAdb(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    }
    return this._runAdb(`shell am start -n ${packageName}/${launcherActivity}`);
  }

  /**
   * Captures UI Hierarchy XML.
   */
  dumpUI() {
    const dumpRes = this._runAdb('shell uiautomator dump /sdcard/window_dump.xml');
    if (!dumpRes.ok) return dumpRes;
    
    const pullRes = this._runAdb(`pull /sdcard/window_dump.xml "${join(this.workspaceDir, 'window_dump.xml')}"`);
    if (!pullRes.ok) return pullRes;

    try {
      const xml = readFileSync(join(this.workspaceDir, 'window_dump.xml'), 'utf-8');
      return { ok: true, uiState: xml, exitCode: 0 };
    } catch (e) {
      return { ok: false, stderr: 'Failed to read pulled UI dump', exitCode: 1 };
    }
  }

  /**
   * Interacts with UI.
   */
  tap(x, y) {
    return this._runAdb(`shell input tap ${x} ${y}`);
  }

  inputText(text) {
    const escaped = text.replace(/ /g, '%s');
    return this._runAdb(`shell input text ${escaped}`);
  }

  captureLogcat() {
    return this._runAdb('logcat -d');
  }

  captureScreenshot(outputPath) {
    const res = this._runAdb(`shell screencap -p /sdcard/screen.png`);
    if (res.ok) {
      return this._runAdb(`pull /sdcard/screen.png "${outputPath}"`);
    }
    return res;
  }
}
