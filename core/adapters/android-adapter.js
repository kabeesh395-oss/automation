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
    const candidates = [
      process.env.ADB_PATH,
      process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe') : null,
      process.env.ANDROID_SDK_ROOT ? join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb.exe') : null,
      'C:\\Android\\sdk\\platform-tools\\adb.exe',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null,
      'adb'
    ].filter(Boolean);
    for (const c of candidates) {
      if (c === 'adb') return 'adb';
      if (existsSync(c)) return c;
    }
    return 'adb';
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
    const lines = res.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return lines
      .filter(l => !l.startsWith('*') && !l.startsWith('List of devices'))
      .filter(l => l.includes('\tdevice') || l.endsWith(' device'))
      .map(l => l.split(/\s+/)[0]);
  }

  /**
   * Installs an APK.
   */
  installApk(apkPath) {
    return this._runAdb(`install -r -t "${apkPath}"`);
  }

  /**
   * Discovers aapt executable in build-tools.
   */
  _findAapt() {
    const androidHome = process.env.ANDROID_HOME || 'C:\\Android\\sdk';
    const buildToolsDir = join(androidHome, 'build-tools');
    if (existsSync(buildToolsDir)) {
      const versions = readdirSync(buildToolsDir);
      for (const v of versions.sort().reverse()) {
        const aapt = join(buildToolsDir, v, 'aapt.exe');
        if (existsSync(aapt)) return aapt;
      }
    }
    return 'aapt';
  }

  /**
   * Recursively finds built APKs.
   */
  findApk(searchDir = this.workspaceDir) {
    const found = [];
    const walk = (d) => {
      try {
        const files = readdirSync(d);
        for (const f of files) {
          const full = join(d, f);
          const st = statSync(full);
          if (st.isDirectory() && f !== 'node_modules' && f !== '.git') {
            walk(full);
          } else if (f.endsWith('.apk') && !f.includes('unaligned')) {
            found.push(full);
          }
        }
      } catch {}
    };
    walk(searchDir);
    // Prefer debug APK
    const debugApk = found.find(f => f.toLowerCase().includes('debug'));
    return debugApk || found[0] || null;
  }

  /**
   * Dynamically extracts package and launcher activity from an APK using aapt.
   */
  getApkInfo(apkPath) {
    const aapt = this._findAapt();
    try {
      const stdout = execSync(`"${aapt}" dump badging "${apkPath}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const pkgMatch = stdout.match(/package:\s*name='([^']+)'/);
      const actMatch = stdout.match(/launchable-activity:\s*name='([^']+)'/);
      return {
        packageName: pkgMatch ? pkgMatch[1] : null,
        launcherActivity: actMatch ? actMatch[1] : null
      };
    } catch {
      // Fallback to source-based parsing
      return this.getAppInfo();
    }
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

  wakeAndUnlock() {
    this._runAdb('shell input keyevent 224'); // KEYCODE_WAKEUP
    this._runAdb('shell input keyevent 82');  // KEYCODE_MENU (unlock)
  }

  stopApp(packageName) {
    return this._runAdb(`shell am force-stop ${packageName}`);
  }

  clearLogcat() {
    return this._runAdb('logcat -c');
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
   * Finds the center coordinates of a UI node dynamically by attribute (text, resource-id, or class).
   */
  findNodeBounds(uiXml, selector = {}) {
    if (!uiXml) return null;
    // Regex matching <node ... />
    const nodeRegex = /<node\s+([^>]+)\/>/g;
    let match;
    while ((match = nodeRegex.exec(uiXml)) !== null) {
      const attrs = match[1];
      
      const boundsMatch = attrs.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (!boundsMatch) continue;

      const textMatch = attrs.match(/text="([^"]*)"/);
      const idMatch = attrs.match(/resource-id="([^"]*)"/);
      const classMatch = attrs.match(/class="([^"]*)"/);

      const text = textMatch ? textMatch[1] : '';
      const resId = idMatch ? idMatch[1] : '';
      const className = classMatch ? classMatch[1] : '';

      let matched = true;
      if (selector.text && !text.toLowerCase().includes(selector.text.toLowerCase())) {
        matched = false;
      }
      if (selector.resourceId && !resId.toLowerCase().includes(selector.resourceId.toLowerCase())) {
        matched = false;
      }
      if (selector.className && !className.toLowerCase().includes(selector.className.toLowerCase())) {
        matched = false;
      }

      if (matched && (selector.text || selector.resourceId || selector.className)) {
        const x1 = parseInt(boundsMatch[1], 10);
        const y1 = parseInt(boundsMatch[2], 10);
        const x2 = parseInt(boundsMatch[3], 10);
        const y2 = parseInt(boundsMatch[4], 10);
        const centerX = Math.round((x1 + x2) / 2);
        const centerY = Math.round((y1 + y2) / 2);
        return {
          x: centerX,
          y: centerY,
          bounds: [x1, y1, x2, y2],
          text,
          resId,
          className
        };
      }
    }
    return null;
  }

  /**
   * Clicks a UI element matching selector dynamically.
   */
  clickNode(uiXml, selector) {
    const node = this.findNodeBounds(uiXml, selector);
    if (!node) {
      return { ok: false, error: 'Element not found in UI hierarchy', selector };
    }
    const tapRes = this.tap(node.x, node.y);
    return { ok: tapRes.ok, node, tapRes };
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
