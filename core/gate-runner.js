/**
 * JARVIS Gate Runner
 * 
 * Verification gates that run REAL checks.
 * A gate is PASS only with attached evidence.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { logGate, logError, logSecurity } from './logger.js';
import * as gitOps from './git-ops.js';

/**
 * Run a shell command and capture result.
 * Returns { ok, stdout, stderr, exitCode }
 */
function runCmd(cmd, cwd, timeoutMs = 120000) {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message,
      exitCode: err.status ?? 1,
    };
  }
}

// --- GATE 1: Requirements Traceability ---

export function gateRequirements(state, projectDir) {
  logGate('Running Gate 1: Requirements traceability');
  const evidence = { gate: 'g1_requirements', checks: [] };

  if (!state.requirements || !state.requirements.features) {
    evidence.checks.push({ check: 'requirements_exist', pass: false, detail: 'No requirements found in state' });
    return { pass: false, evidence };
  }

  const features = state.requirements.features;
  let mapped = 0;
  let unmapped = 0;
  for (const feature of features) {
    // Check if there's at least one task referencing this feature
    const hasTask = state.tasks.some(t =>
      t.description.toLowerCase().includes(feature.name?.toLowerCase() || feature.toLowerCase())
    );
    if (hasTask) {
      mapped++;
      evidence.checks.push({ check: `feature_mapped: ${feature.name || feature}`, pass: true });
    } else {
      unmapped++;
      evidence.checks.push({ check: `feature_mapped: ${feature.name || feature}`, pass: false, detail: 'No task found for this feature' });
    }
  }

  const pass = unmapped === 0 && mapped > 0;
  logGate(`Gate 1: ${mapped} mapped, ${unmapped} unmapped — ${pass ? 'PASS' : 'FAIL'}`);
  return { pass, evidence };
}

// --- GATE 2: Build ---

export function gateBuild(projectDir, buildCmd) {
  logGate(`Running Gate 2: Build — ${buildCmd}`);
  const evidence = { gate: 'g2_build', checks: [] };

  const result = runCmd(buildCmd, projectDir);
  evidence.checks.push({
    check: 'build_command',
    command: buildCmd,
    pass: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 3000),
    stderr: result.stderr.slice(0, 3000),
  });

  logGate(`Gate 2: Build ${result.ok ? 'PASS' : 'FAIL'} (exit ${result.exitCode})`);
  return { pass: result.ok, evidence };
}

// --- GATE 3: Tests ---

export function gateTests(projectDir, testCmd) {
  logGate(`Running Gate 3: Tests — ${testCmd}`);
  const evidence = { gate: 'g3_tests', checks: [] };

  const result = runCmd(testCmd, projectDir);
  evidence.checks.push({
    check: 'test_command',
    command: testCmd,
    pass: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(0, 5000),
    stderr: result.stderr.slice(0, 3000),
  });

  logGate(`Gate 3: Tests ${result.ok ? 'PASS' : 'FAIL'} (exit ${result.exitCode})`);
  return { pass: result.ok, evidence };
}

// --- GATE 4: Runtime ---

export function gateRuntime(projectDir, launchCmd, healthCheckUrl = null) {
  logGate('Running Gate 4: Runtime check');
  const evidence = { gate: 'g4_runtime', checks: [] };

  if (!launchCmd) {
    evidence.checks.push({
      check: 'runtime_launch',
      pass: false,
      detail: 'No launch command provided — cannot verify runtime',
    });
    logGate('Gate 4: SKIP — no launch command');
    return { pass: false, evidence };
  }

  // For a build-only check (no server), just verify the build output exists
  evidence.checks.push({
    check: 'runtime_launch',
    pass: false,
    detail: 'Runtime verification requires manual launch or emulator — marking as NOT_VERIFIED',
    launch_command: launchCmd,
  });

  logGate('Gate 4: NOT_VERIFIED — runtime verification is environment-dependent');
  return { pass: false, evidence };
}

// --- GATE 5: Feature Verification ---

export function gateFeature(state) {
  logGate('Running Gate 5: Feature verification');
  const evidence = { gate: 'g5_feature', checks: [] };

  // Check if all "done" tasks have verification
  const doneTasks = state.tasks.filter(t => t.status === 'done');
  const verifiedTasks = doneTasks.filter(t => t.verification === 'pass');

  evidence.checks.push({
    check: 'tasks_verified',
    total_done: doneTasks.length,
    verified: verifiedTasks.length,
    pass: doneTasks.length > 0 && verifiedTasks.length === doneTasks.length,
  });

  const pass = doneTasks.length > 0 && verifiedTasks.length === doneTasks.length;
  logGate(`Gate 5: ${verifiedTasks.length}/${doneTasks.length} tasks verified — ${pass ? 'PASS' : 'FAIL'}`);
  return { pass, evidence };
}

// --- GATE 6: Security ---

export function gateSecurity(projectDir) {
  logGate('Running Gate 6: Security scan');
  const evidence = { gate: 'g6_security', checks: [] };

  // Check for common secret patterns in source files
  const secretPatterns = [
    /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/gi,
    /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    /AIza[0-9A-Za-z_-]{35}/g,  // Google API Key
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
  ];

  let secretsFound = 0;
  const findings = [];

  function scanDir(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && /\.(js|ts|kt|java|json|xml|yaml|yml|env|gradle|properties)$/i.test(entry.name)) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            for (const pattern of secretPatterns) {
              pattern.lastIndex = 0;
              const matches = content.match(pattern);
              if (matches) {
                secretsFound += matches.length;
                findings.push({ file: fullPath, pattern: pattern.source, count: matches.length });
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  scanDir(projectDir);

  evidence.checks.push({
    check: 'secret_scan',
    pass: secretsFound === 0,
    secrets_found: secretsFound,
    findings: findings.slice(0, 10),
  });

  // Check for .env.example not containing real values
  const envExample = join(projectDir, '.env.example');
  if (existsSync(envExample)) {
    const content = readFileSync(envExample, 'utf-8');
    const hasRealValues = /[:=]\s*[A-Za-z0-9]{20,}/.test(content);
    evidence.checks.push({
      check: 'env_example_safe',
      pass: !hasRealValues,
      detail: hasRealValues ? '.env.example may contain real secrets' : '.env.example looks safe',
    });
  }

  const pass = secretsFound === 0;
  logSecurity(`Gate 6: ${secretsFound} secrets found — ${pass ? 'PASS' : 'FAIL'}`);
  return { pass, evidence };
}

// --- GATE 7: Release ---

export function gateRelease(projectDir, artifactPath) {
  logGate('Running Gate 7: Release artifact check');
  const evidence = { gate: 'g7_release', checks: [] };

  if (!artifactPath || !existsSync(join(projectDir, artifactPath))) {
    evidence.checks.push({
      check: 'artifact_exists',
      pass: false,
      detail: `Artifact not found: ${artifactPath || 'none specified'}`,
    });
    logGate('Gate 7: FAIL — no artifact');
    return { pass: false, evidence };
  }

  evidence.checks.push({
    check: 'artifact_exists',
    pass: true,
    path: artifactPath,
  });

  logGate('Gate 7: PASS — artifact exists');
  return { pass: true, evidence };
}

// --- GIT GATE (bonus, always run) ---

export function gateGit(projectDir) {
  logGate('Running Git gate');
  const evidence = { gate: 'git', checks: [] };

  const status = gitOps.getStatus(projectDir);
  const commits = gitOps.getRecentCommits(projectDir);

  evidence.checks.push({
    check: 'git_status',
    branch: status.branch,
    head: status.head,
    dirty: status.dirty,
    changes_count: status.changes.length,
    recent_commits: commits.slice(0, 5),
  });

  evidence.checks.push({
    check: 'not_on_protected_branch',
    pass: !gitOps.isProtectedBranch(projectDir),
    branch: status.branch,
  });

  logGate(`Git gate: branch=${status.branch}, dirty=${status.dirty}`);
  return { pass: true, evidence };
}

/** Run all applicable gates and return results */
export function runAllGates(state, projectDir, { buildCmd, testCmd, launchCmd, artifactPath } = {}) {
  const results = {};

  results.g1 = gateRequirements(state, projectDir);
  results.git = gateGit(projectDir);
  results.g6 = gateSecurity(projectDir);

  if (buildCmd) {
    results.g2 = gateBuild(projectDir, buildCmd);
  }
  if (testCmd) {
    results.g3 = gateTests(projectDir, testCmd);
  }
  if (launchCmd) {
    results.g4 = gateRuntime(projectDir, launchCmd);
  }

  results.g5 = gateFeature(state);

  if (artifactPath) {
    results.g7 = gateRelease(projectDir, artifactPath);
  }

  return results;
}
