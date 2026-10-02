/**
 * JARVIS Gate Runner
 * 
 * Target-pluggable verification gate system.
 * A gate is PASS only with real attached evidence.
 */

import * as androidTarget from './gates/targets/android.js';
import * as webTarget from './gates/targets/web.js';
import * as backendTarget from './gates/targets/backend.js';
import { logGate } from './logger.js';

function getTargetAdapter(targetPlatform = 'android') {
  switch (targetPlatform.toLowerCase()) {
    case 'android':
      return androidTarget;
    case 'web':
      return webTarget;
    case 'backend':
    case 'api':
      return backendTarget;
    default:
      return androidTarget;
  }
}

/** Gate 1: Requirements Traceability */
export function gateRequirements(state, projectDir) {
  logGate('Running Gate 1: Requirements Traceability');
  const evidence = { gate: 'g1_requirements', checks: [] };

  const features = state.requirements?.core_features || state.requirements?.features || [];
  if (features.length === 0) {
    evidence.checks.push({ check: 'requirements_exist', pass: false, detail: 'No requirements/features found' });
    return { pass: false, evidence };
  }

  let mapped = 0;
  let unmapped = 0;

  for (const feature of features) {
    const name = feature.name || feature;
    const hasTask = state.tasks.some(t => {
      const desc = (t.description || '').toLowerCase();
      return desc.includes(name.toLowerCase()) || (t.inputs && JSON.stringify(t.inputs).toLowerCase().includes(name.toLowerCase()));
    });

    if (hasTask) {
      mapped++;
      evidence.checks.push({ check: `feature_mapped: ${name}`, pass: true });
    } else {
      unmapped++;
      evidence.checks.push({ check: `feature_mapped: ${name}`, pass: false, detail: 'No task found' });
    }
  }

  const pass = unmapped === 0 && mapped > 0;
  return { pass, evidence };
}

/** Gate 5: Feature Verification */
export function gateFeature(state) {
  logGate('Running Gate 5: Feature Verification');
  const evidence = { gate: 'g5_feature', checks: [] };

  const doneTasks = state.tasks.filter(t => t.status === 'done');
  const verifiedTasks = doneTasks.filter(t => t.verification === 'pass' || t.verification?.status === 'pass');

  const pass = doneTasks.length > 0 && verifiedTasks.length === doneTasks.length;
  evidence.checks.push({
    check: 'tasks_verified',
    total_done: doneTasks.length,
    verified: verifiedTasks.length,
    pass
  });

  return { pass, evidence };
}

/** Run all applicable gates for a given project */
export function runAllGates(state, projectDir, options = {}) {
  const target = state.project?.target || state.requirements?.target_platform || 'android';
  const adapter = getTargetAdapter(target);

  const results = {};

  // Gate 1: Requirements
  results.g1 = gateRequirements(state, projectDir);

  // Toolchain Gate
  results.toolchain = adapter.verifyToolchain(projectDir);

  // Git Gate
  results.git = adapter.verifyGit(projectDir);

  // Gate 6: Security
  results.g6 = adapter.verifySecurity(projectDir);

  // Gate 2: Build
  results.g2 = adapter.verifyBuild(projectDir, options.buildCmd);

  // Gate 3: Tests
  results.g3 = adapter.verifyTests(projectDir, options.testCmd);

  // Gate 4: Runtime
  results.g4 = adapter.verifyRuntime(projectDir);

  // Gate 5: Feature
  results.g5 = gateFeature(state);

  // Gate 7: Release Artifact
  results.g7 = adapter.verifyArtifact(projectDir, options.artifactPath);

  return results;
}

export {
  androidTarget,
  webTarget,
  backendTarget
};
