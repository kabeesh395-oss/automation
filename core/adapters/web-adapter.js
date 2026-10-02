/**
 * JARVIS Generic Web Runtime Adapter (Phase 5)
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class WebAdapter {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Checks if Playwright is available in the workspace or globally.
   */
  isToolingAvailable() {
    try {
      execSync('node -e "require(\'playwright\')"', { cwd: this.workspaceDir, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates and executes a generic Playwright script to verify runtime.
   */
  async runVerification(startCmd, targetUrl) {
    if (!this.isToolingAvailable()) {
      return { ok: false, status: 'NOT_CONFIGURED', error: 'Playwright tooling not available' };
    }

    const scriptName = 'jarvis_web_verify.cjs';
    const scriptPath = join(this.workspaceDir, scriptName);
    const screenshotPath = join(this.workspaceDir, 'jarvis_web_screenshot.png');

    const scriptContent = `
const { chromium } = require('playwright');
const { exec } = require('child_process');

(async () => {
  // Start dev server
  const server = exec('${startCmd}', { cwd: __dirname });
  
  // Wait for server to boot (naive wait)
  await new Promise(r => setTimeout(r, 5000));

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    const response = await page.goto('${targetUrl}', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Initial State
    const initialHtml = await page.content();
    let stateChanged = false;
    let interaction = null;

    // Try interacting
    const button = page.locator('button').first();
    const input = page.locator('input').first();
    
    if (await button.isVisible()) {
      await button.click();
      interaction = 'clicked button';
    } else if (await input.isVisible()) {
      await input.fill('test');
      interaction = 'filled input';
    }
    
    if (interaction) {
      await page.waitForTimeout(1000); // Wait for potential state changes
      const newHtml = await page.content();
      stateChanged = initialHtml !== newHtml;
      if (stateChanged && newHtml.length === initialHtml.length) {
         // same length, different content?
         console.log("HTML slightly changed!");
      }
    }
    
    await page.screenshot({ path: '${screenshotPath.replace(/\\/g, '\\\\')}' });
    
    const html = await page.content();
    
    console.log(JSON.stringify({
      ok: response.ok() && errors.length === 0 && (interaction === null || stateChanged),
      status: response.status(),
      errors,
      interaction,
      stateChanged,
      htmlLength: html.length,
      htmlSnippet: html.substring(0, 1000)
    }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    if (browser) await browser.close();
    try {
      if (server && server.pid) {
        if (process.platform === 'win32') {
          require('child_process').execSync('taskkill /F /T /PID ' + server.pid, { stdio: 'ignore' });
        } else {
          server.kill('SIGINT');
        }
      }
    } catch(e) {}
    process.exit(0);
  }
})();
    `;

    writeFileSync(scriptPath, scriptContent, 'utf-8');

    const clearPort = () => {
      try {
        const url = new URL(targetUrl);
        if (url.port && process.platform === 'win32') {
          const out = execSync(`netstat -ano | findstr :${url.port}`, { encoding: 'utf-8' });
          for (const line of out.trim().split(/\r?\n/)) {
            const pid = line.trim().split(/\s+/).pop();
            if (pid && pid !== '0') {
              try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
            }
          }
        }
      } catch {}
    };

    clearPort();

    try {
      const stdout = execSync(`node ${scriptName}`, { cwd: this.workspaceDir, encoding: 'utf-8', timeout: 60000 });
      let result;
      try {
        const jsonStr = stdout.substring(stdout.indexOf('{'));
        result = JSON.parse(jsonStr.trim());
      } catch (e) {
        result = { ok: false, stdout };
      }
      return { ok: result.ok, stdout, result, exitCode: 0, screenshotPath };
    } catch (err) {
      return { ok: false, stderr: err.stderr || err.message || String(err), exitCode: 1 };
    } finally {
      clearPort();
    }
  }
}
