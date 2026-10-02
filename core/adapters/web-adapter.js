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
    }
    
    await page.screenshot({ path: '${screenshotPath.replace(/\\/g, '\\\\')}' });
    
    const html = await page.content();
    
    console.log(JSON.stringify({
      ok: response.ok() && (interaction === null || stateChanged),
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
    server.kill();
  }
})();
    `;

    writeFileSync(scriptPath, scriptContent, 'utf-8');

    try {
      const stdout = execSync(`node ${scriptName}`, { cwd: this.workspaceDir, encoding: 'utf-8', timeout: 30000 });
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch (e) {
        result = { ok: false, stdout };
      }
      return { ok: result.ok, stdout, result, exitCode: 0, screenshotPath };
    } catch (err) {
      return { ok: false, stderr: err.stderr || err.message, exitCode: 1 };
    }
  }
}
