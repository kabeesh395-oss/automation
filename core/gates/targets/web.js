/**
 * JARVIS Web Gate Target Runner (Phase 4 Real Toolchain Execution)
 * 
 * Executes real Node/npm toolchain, build, test, and security verifications.
 * Explicitly reports NOT_CONFIGURED when test/build scripts are absent.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as gitOps from '../../git-ops.js';
import { logGate } from '../../logger.js';
import { WebAdapter } from '../../adapters/web-adapter.js';

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
  logGate('Running Web Toolchain Gate');
  const nodeRes = runCmd('node -v', workspaceDir, 10000);
  const npmRes = runCmd('npm -v', workspaceDir, 10000);

  const nodePass = nodeRes.ok && nodeRes.stdout.startsWith('v');
  const npmPass = npmRes.ok && npmRes.stdout.length > 0;

  const checks = [
    { check: 'node_runtime', pass: nodePass, detail: nodeRes.stdout || nodeRes.stderr },
    { check: 'npm_package_manager', pass: npmPass, detail: npmRes.stdout || npmRes.stderr }
  ];

  return {
    gate: 'toolchain',
    pass: nodePass && npmPass,
    evidence: { gate: 'toolchain', checks }
  };
}

export function verifyBuild(workspaceDir) {
  logGate('Running Web Build Gate');
  const pkgPath = join(workspaceDir, 'package.json');

  if (!existsSync(pkgPath)) {
    return {
      gate: 'g2_build',
      pass: false,
      evidence: {
        gate: 'g2_build',
        checks: [{ check: 'package_json_exists', pass: false, detail: 'package.json not found in workspace' }]
      }
    };
  }

  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return {
      gate: 'g2_build',
      pass: false,
      evidence: { gate: 'g2_build', checks: [{ check: 'valid_package_json', pass: false }] }
    };
  }

  if (!pkg.scripts?.build) {
    // If pure static HTML/JS web app
    const hasIndexHtml = existsSync(join(workspaceDir, 'index.html')) || existsSync(join(workspaceDir, 'src', 'index.html'));
    return {
      gate: 'g2_build',
      pass: hasIndexHtml,
      evidence: {
        gate: 'g2_build',
        checks: [
          {
            check: hasIndexHtml ? 'static_web_entry' : 'build_script_or_entry',
            pass: hasIndexHtml,
            detail: hasIndexHtml ? 'Static web entry index.html detected' : 'No build script and no index.html found'
          }
        ]
      }
    };
  }

  const buildRes = runCmd('npm run build', workspaceDir);
  return {
    gate: 'g2_build',
    pass: buildRes.ok,
    evidence: {
      gate: 'g2_build',
      checks: [
        {
          check: 'npm_run_build',
          pass: buildRes.ok,
          exitCode: buildRes.exitCode,
          stdout: buildRes.stdout.slice(-1000),
          stderr: buildRes.stderr.slice(-1000)
        }
      ]
    }
  };
}

export function verifyTests(workspaceDir) {
  logGate('Running Web Tests Gate');
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
            check: 'unit_test_suite_configured',
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
  logGate('Running Web Artifact Gate');
  const candidates = [
    join(workspaceDir, 'dist'),
    join(workspaceDir, 'build'),
    join(workspaceDir, 'index.html')
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      const stat = statSync(p);
      return {
        gate: 'g7_release',
        pass: true,
        artifactDetails: {
          path: p,
          isDirectory: stat.isDirectory(),
          sizeBytes: stat.size
        },
        evidence: {
          gate: 'g7_release',
          checks: [{ check: 'web_artifact_present', pass: true, file_path: p }]
        }
      };
    }
  }

  return {
    gate: 'g7_release',
    pass: false,
    evidence: {
      gate: 'g7_release',
      checks: [{ check: 'web_artifact_present', pass: false, detail: 'No dist/, build/, or index.html found' }]
    }
  };
}

export function verifyRuntime(workspaceDir) {
  logGate('Running Web Runtime Gate via WebAdapter');
  
  const adapter = new WebAdapter(workspaceDir);
  
  // Example commands based on typical web setups
  let startCmd = 'npm run dev';
  let targetUrl = 'http://localhost:5173'; // Vite default

  const pkgPath = join(workspaceDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (!pkg.scripts || !pkg.scripts.dev) {
      startCmd = 'npm start';
      targetUrl = 'http://localhost:3000'; // CRA default
    }
  }

  const result = adapter.runVerification(startCmd, targetUrl);

  if (!result.ok && result.status === 'NOT_CONFIGURED') {
    return {
      gate: 'g4_runtime',
      pass: false,
      status: 'NOT_CONFIGURED',
      evidence: {
        gate: 'g4_runtime',
        checks: [
          {
            check: 'browser_runtime_validation',
            pass: false,
            status: 'NOT_CONFIGURED',
            detail: result.error || 'Web browser runtime requires active browser agent session.'
          }
        ]
      }
    };
  }

  return {
    gate: 'g4_runtime',
    pass: result.ok,
    status: result.ok ? 'PASS' : 'FAIL',
    evidence: {
      gate: 'g4_runtime',
      checks: [
        {
          check: 'browser_runtime_validation',
          pass: result.ok,
          status: result.ok ? 'PASS' : 'FAIL',
          stdout: result.stdout?.substring(0, 500) || '',
          screenshotPath: result.screenshotPath || null
        }
      ]
    }
  };
}

export function verifySecurity(workspaceDir) {
  logGate('Running Web Security Gate');
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
        } else if (entry.isFile() && /\.(js|jsx|ts|tsx|json|html|css|env)$/i.test(entry.name)) {
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
  logGate('Running Web Git Gate');
  const status = gitOps.getStatus(workspaceDir);
  const commits = gitOps.getRecentCommits(workspaceDir);
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
