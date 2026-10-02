/**
 * JARVIS Backend Gate Target Runner (Phase 4 Real Toolchain Execution)
 * 
 * Executes real server toolchain, build, unit/integration test, and security verifications.
 * Explicitly distinguishes NOT_CONFIGURED from FAIL and PASS.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as gitOps from '../../git-ops.js';
import { logGate } from '../../logger.js';
import { BackendAdapter } from '../../adapters/backend-adapter.js';

function runCmd(cmd, cwd, timeoutMs = 60000) {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    });
    return { ok: true, stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      ok: err.status === 0,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message,
      exitCode: err.status ?? 1
    };
  }
}

export function verifyToolchain(workspaceDir) {
  logGate('Running Backend Toolchain Gate');
  const nodeRes = runCmd('node -v', workspaceDir, 10000);
  const npmRes = runCmd('npm -v', workspaceDir, 10000);

  const nodePass = nodeRes.ok && nodeRes.stdout.startsWith('v');
  const npmPass = npmRes.ok;

  const checks = [
    { check: 'backend_runtime_node', pass: nodePass, detail: nodeRes.stdout || nodeRes.stderr },
    { check: 'backend_package_manager', pass: npmPass, detail: npmRes.stdout || npmRes.stderr }
  ];

  return {
    gate: 'toolchain',
    pass: nodePass && npmPass,
    evidence: { gate: 'toolchain', checks }
  };
}

export function verifyBuild(workspaceDir) {
  logGate('Running Backend Build Gate');
  const pkgPath = join(workspaceDir, 'package.json');

  if (!existsSync(pkgPath)) {
    return {
      gate: 'g2_build',
      pass: false,
      evidence: {
        gate: 'g2_build',
        checks: [{ check: 'package_json_exists', pass: false, detail: 'package.json not found' }]
      }
    };
  }

  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return { gate: 'g2_build', pass: false, evidence: { gate: 'g2_build', checks: [{ check: 'valid_package_json', pass: false }] } };
  }

  if (pkg.scripts?.build) {
    const buildRes = runCmd('npm run build', workspaceDir);
    return {
      gate: 'g2_build',
      pass: buildRes.ok,
      evidence: {
        gate: 'g2_build',
        checks: [{ check: 'npm_run_build', pass: buildRes.ok, exitCode: buildRes.exitCode, stdout: buildRes.stdout.slice(-1000) }]
      }
    };
  }

  // Pure node backend entry check
  const mainFile = pkg.main || 'src/server.js' || 'index.js';
  const hasEntry = existsSync(join(workspaceDir, mainFile)) || existsSync(join(workspaceDir, 'src', 'server.js')) || existsSync(join(workspaceDir, 'index.js'));

  return {
    gate: 'g2_build',
    pass: hasEntry,
    evidence: {
      gate: 'g2_build',
      checks: [{ check: 'server_entry_point', pass: hasEntry, detail: hasEntry ? `Server entry point exists: ${mainFile}` : 'No server entry point found' }]
    }
  };
}

export function verifyTests(workspaceDir) {
  logGate('Running Backend Tests Gate');
  const pkgPath = join(workspaceDir, 'package.json');

  if (!existsSync(pkgPath)) {
    return {
      gate: 'g3_tests',
      pass: false,
      status: 'NOT_CONFIGURED',
      evidence: { gate: 'g3_tests', checks: [{ check: 'package_json', pass: false, status: 'NOT_CONFIGURED' }] }
    };
  }

  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return { gate: 'g3_tests', pass: false, status: 'FAIL' };
  }

  const testScript = pkg.scripts?.test;
  if (!testScript || testScript.includes('no test specified') || testScript.trim() === 'exit 1') {
    return {
      gate: 'g3_tests',
      pass: false,
      status: 'NOT_CONFIGURED',
      evidence: {
        gate: 'g3_tests',
        checks: [
          {
            check: 'api_unit_test_suite_configured',
            pass: false,
            status: 'NOT_CONFIGURED',
            detail: 'No automated test runner script configured in package.json'
          }
        ]
      }
    };
  }

  const testRes = runCmd('npm test', workspaceDir);
  return {
    gate: 'g3_tests',
    pass: testRes.ok,
    status: testRes.ok ? 'PASS' : 'FAIL',
    evidence: {
      gate: 'g3_tests',
      checks: [
        {
          check: 'npm_test_execution',
          pass: testRes.ok,
          exitCode: testRes.exitCode,
          stdout: testRes.stdout.slice(-1000),
          stderr: testRes.stderr.slice(-1000)
        }
      ]
    }
  };
}

export function verifyArtifact(workspaceDir) {
  logGate('Running Backend Artifact Gate');
  const pkgPath = join(workspaceDir, 'package.json');
  const hasPkg = existsSync(pkgPath);

  return {
    gate: 'g7_release',
    pass: hasPkg,
    artifactDetails: {
      package_json: hasPkg ? pkgPath : null,
      workspace: workspaceDir
    },
    evidence: {
      gate: 'g7_release',
      checks: [{ check: 'backend_package_ready', pass: hasPkg }]
    }
  };
}

export function verifyRuntime(workspaceDir) {
  logGate('Running Backend Runtime Gate via BackendAdapter');
  
  const adapter = new BackendAdapter(workspaceDir);
  
  const pkgPath = join(workspaceDir, 'package.json');
  let startCmd = 'npm start';
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg.scripts && !pkg.scripts.start && pkg.scripts.dev) {
      startCmd = 'npm run dev';
    }
  }

  const result = adapter.runVerification(startCmd, 'http://localhost:3000', '/');

  return {
    gate: 'g4_runtime',
    pass: result.ok,
    status: result.ok ? 'PASS' : 'FAIL',
    evidence: {
      gate: 'g4_runtime',
      checks: [
        {
          check: 'live_api_healthcheck',
          pass: result.ok,
          status: result.ok ? 'PASS' : 'FAIL',
          http_status: result.status,
          response_data: result.data ? result.data.substring(0, 500) : null,
          stdout: result.stdout ? result.stdout.substring(0, 500) : null
        }
      ]
    }
  };
}

export function verifySecurity(workspaceDir) {
  logGate('Running Backend Security Gate');
  const secretPatterns = [
    /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
    /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    /AIza[0-9A-Za-z_-]{35}/g,
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/g
  ];

  let secretsFound = 0;
  const findings = [];

  function scan(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && /\.(js|ts|json|env|sql|yaml|yml)$/i.test(entry.name)) {
          try {
            const content = readFileSync(full, 'utf-8');
            for (const p of secretPatterns) {
              p.lastIndex = 0;
              const matches = content.match(p);
              if (matches) {
                secretsFound += matches.length;
                findings.push({ file: full, count: matches.length });
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  scan(workspaceDir);

  const pass = secretsFound === 0;
  return {
    gate: 'g6_security',
    pass,
    evidence: {
      gate: 'g6_security',
      checks: [{ check: 'secret_scan', pass, secrets_found: secretsFound, findings }]
    }
  };
}

export function verifyGit(workspaceDir) {
  logGate('Running Backend Git Gate');
  const status = gitOps.getStatus(workspaceDir);
  const isProtected = gitOps.isProtectedBranch(workspaceDir);

  return {
    gate: 'git',
    pass: !isProtected,
    evidence: {
      gate: 'git',
      checks: [
        { check: 'git_branch_status', branch: status.branch, pass: !status.dirty, dirty: status.dirty },
        { check: 'not_on_protected_branch', pass: !isProtected, branch: status.branch }
      ]
    }
  };
}
