/**
 * JARVIS Generic Backend Runtime Adapter (Phase 5)
 */

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class BackendAdapter {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Starts the server, waits for readiness, runs tests against it synchronously via script.
   */
  runVerification(startCmd = 'npm start', targetUrl = 'http://localhost:3000', testEndpoint = '/') {
    const scriptName = 'jarvis_backend_verify.cjs';
    const scriptPath = join(this.workspaceDir, scriptName);

    const scriptContent = `
const { spawn } = require('child_process');
const http = require('http');

(async () => {
  const parts = '${startCmd}'.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  
  let stdoutLog = '';
  let stderrLog = '';
  let isReady = false;

  const serverProc = spawn(cmd, args, {
    cwd: __dirname,
    shell: process.platform === 'win32'
  });

  serverProc.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutLog += text;
    if (!isReady && (text.includes('listening') || text.includes('started') || text.includes('http://'))) {
      isReady = true;
      executeVerificationReq('${targetUrl}${testEndpoint}').then(res => {
        serverProc.kill();
        console.log(JSON.stringify({ ok: res.ok, status: res.status, data: res.data, stdout: stdoutLog, stderr: stderrLog }));
        process.exit(0);
      });
    }
  });

  serverProc.stderr.on('data', (data) => {
    stderrLog += data.toString();
  });

  setTimeout(() => {
    if (!isReady) {
      serverProc.kill();
      console.log(JSON.stringify({ ok: false, status: 'STARTUP_TIMEOUT', stdout: stdoutLog, stderr: stderrLog }));
      process.exit(1);
    }
  }, 10000);
})();

async function executeVerificationReq(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 'NETWORK_ERROR', data: e.message }));
    req.end();
  });
}
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
      return { ok: result.ok, status: result.status, data: result.data, stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (err) {
      return { ok: false, stderr: err.stderr || err.message, exitCode: 1 };
    }
  }
}
