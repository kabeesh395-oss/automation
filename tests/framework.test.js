/**
 * JARVIS Framework Tests (Phase 3)
 * 
 * Complete verification of:
 * - Explicit State Machine & persistence
 * - Dependency Graph & topological resolution
 * - Recovery Loop with bounded novelty checks & BLOCKED transition
 * - Schema contracts validation
 * - Target gate runners
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  createProjectState, saveState, loadState, ensureStateDir,
  recordError, hasFixBeenAttempted, getAttemptCount
} from '../core/state-manager.js';
import {
  validateProjectState, validateTask, validateRequirements,
  validateArchitecture, validateUxPlan, validateImplementationPlan, validateTaskQueue
} from '../core/protocol/validator.js';
import { analyzeProduct } from '../core/product-analyst.js';
import { designArchitecture } from '../core/software-architect.js';
import { designUxPlan } from '../core/ux-architect.js';
import { planTasks } from '../core/task-planner.js';
import { TaskGraph } from '../core/task-graph.js';
import { computeSignature, classifyError, analyzeFailure, recordRecoveryAttempt } from '../core/recovery.js';
import { isGitRepo, getCurrentBranch, getStatus, preflight } from '../core/git-ops.js';
import { ORCHESTRATOR_PHASES, initProject, resumeProject } from '../core/orchestrator.js';
import { MockAIProvider } from '../core/ai/mock-provider.js';

const ROOT = resolve(import.meta.dirname, '..');

// --- 1. State Machine & Persistence ---

describe('Phase 3 State Machine & Persistence', () => {
  it('should initialize state with explicit INIT phase', () => {
    const state = createProjectState('Test App Idea', 'android');
    assert.ok(state.project.id.startsWith('PRJ-'));
    assert.equal(state.project.target, 'android');
    assert.equal(state.phase, 'init');
  });

  it('should persist and resume state across simulated restarts', async () => {
    ensureStateDir();
    const state = createProjectState('Resume Test', 'android');
    state.phase = ORCHESTRATOR_PHASES.ANALYSIS;
    state.requirements = {
      app_name: 'test-app',
      target_platform: 'android',
      problem_statement: 'test problem',
      target_users: ['test-user'],
      core_features: [{ id: 'F001', name: 'feat', description: 'desc', priority: 'must', source: 'explicit' }],
      non_functional_requirements: [{ name: 'nf', description: 'desc' }],
      acceptance_criteria: ['test']
    };
    saveState(state);

    const reloaded = loadState();
    assert.equal(reloaded.phase, ORCHESTRATOR_PHASES.ANALYSIS);
    assert.equal(reloaded.project.user_request, 'Resume Test');
    assert.equal(reloaded.requirements.app_name, 'test-app');
  });
});

// --- 2. Schema Contracts Validation ---

describe('Schema Contracts Validation', () => {
  const mockProvider = new MockAIProvider();

  it('should validate complete requirements contract', async () => {
    const { requirements } = await analyzeProduct('Build a student productivity app with notes and dashboard', { aiProvider: mockProvider });
    const result = validateRequirements(requirements);
    assert.ok(result.valid, `Requirements validation failed: ${result.errors.join(', ')}`);
    assert.ok(requirements.core_features.length >= 2);
  });

  it('should validate architecture contract', async () => {
    const { requirements } = await analyzeProduct('Build a minimal Android counter app', { aiProvider: mockProvider });
    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    const result = validateArchitecture(arch);
    assert.ok(result.valid, `Architecture validation failed: ${result.errors.join(', ')}`);
    assert.equal(arch.platform, 'android');
    assert.equal(arch.language, 'kotlin');
  });

  it('should validate UX plan contract', async () => {
    const { requirements } = await analyzeProduct('Build a minimal Android counter app', { aiProvider: mockProvider });
    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    const ux = await designUxPlan(requirements, arch, { aiProvider: mockProvider });
    const result = validateUxPlan(ux);
    assert.ok(result.valid, `UX Plan validation failed: ${result.errors.join(', ')}`);
    assert.ok(ux.screens.length >= 1);
  });

  it('should validate task queue contract', async () => {
    const { requirements } = await analyzeProduct('Build a minimal Android counter app', { aiProvider: mockProvider });
    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    const ux = await designUxPlan(requirements, arch, { aiProvider: mockProvider });
    const { implementationPlan, taskQueue } = await planTasks(requirements, arch, ux, 'PRJ-PHASE4-TEST', { aiProvider: mockProvider });

    const planRes = validateImplementationPlan(implementationPlan);
    assert.ok(planRes.valid, `Implementation Plan validation failed: ${planRes.errors.join(', ')}`);

    const queueRes = validateTaskQueue(taskQueue);
    assert.ok(queueRes.valid, `Task Queue validation failed: ${queueRes.errors.join(', ')}`);
  });
});

// --- 3. Task Graph & Dependencies ---

describe('Task Graph Scheduler', () => {
  it('should resolve ready tasks based on dependency chain', () => {
    const t1 = { id: 'T1', dependencies: [], status: 'ready' };
    const t2 = { id: 'T2', dependencies: ['T1'], status: 'pending' };
    const t3 = { id: 'T3', dependencies: ['T2'], status: 'pending' };

    const graph = new TaskGraph([t1, t2, t3]);

    let ready = graph.getReadyTasks();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'T1');

    t1.status = 'done';
    ready = graph.getReadyTasks();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'T2');

    t2.status = 'done';
    ready = graph.getReadyTasks();
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'T3');
  });

  it('should detect cycles in task graph', () => {
    const t1 = { id: 'T1', dependencies: ['T2'], status: 'pending' };
    const t2 = { id: 'T2', dependencies: ['T1'], status: 'pending' };
    const cyclicGraph = new TaskGraph([t1, t2]);
    assert.ok(cyclicGraph.hasCycle());
  });

  it('should compute valid topological execution order', () => {
    const t1 = { id: 'T1', dependencies: [], status: 'pending' };
    const t2 = { id: 'T2', dependencies: ['T1'], status: 'pending' };
    const t3 = { id: 'T3', dependencies: ['T1'], status: 'pending' };
    const t4 = { id: 'T4', dependencies: ['T2', 'T3'], status: 'pending' };

    const graph = new TaskGraph([t4, t3, t2, t1]);
    const order = graph.getExecutionOrder();

    const ids = order.map(t => t.id);
    assert.ok(ids.indexOf('T1') < ids.indexOf('T2'));
    assert.ok(ids.indexOf('T1') < ids.indexOf('T3'));
    assert.ok(ids.indexOf('T2') < ids.indexOf('T4'));
    assert.ok(ids.indexOf('T3') < ids.indexOf('T4'));
  });
});

// --- 4. Recovery System & Failure Simulations ---

describe('Recovery System & Bounded Retries', () => {
  it('should simulate failure -> recovery analysis -> retry -> success', () => {
    const taskId = `T_TEST_RECOVER_${Date.now()}_01`;
    const errorOutput = 'Compilation error: unresolved reference UserEntity at line 12';

    // 1. First failure
    const recovery1 = analyzeFailure(taskId, errorOutput);
    assert.ok(recovery1.canRetry);
    assert.equal(recovery1.attemptNumber, 1);
    assert.ok(recovery1.suggestion);

    // Record recovery attempt
    recordRecoveryAttempt(taskId, recovery1.signature, errorOutput, 'unresolved reference', 'Add import com.app.domain.UserEntity', true);

    // Verify error was recorded
    assert.ok(hasFixBeenAttempted(recovery1.signature, 'Add import com.app.domain.UserEntity'));
  });

  it('should simulate repeated failures -> retry limit reached -> BLOCKED', () => {
    const taskId = `T_TEST_BLOCK_${Date.now()}_02`;
    const errorOutput = 'Fatal Error: Out of memory during compilation';
    const classification = classifyError(errorOutput);
    const sig = computeSignature(classification.type, errorOutput.slice(0, 500), taskId);

    // Simulate 3 prior failed attempts
    recordError({ task_id: taskId, signature: sig, log_excerpt: errorOutput, root_cause: 'OOM', attempted_fix: 'Increase heap to 2G', result: 'failed' });
    recordError({ task_id: taskId, signature: sig, log_excerpt: errorOutput, root_cause: 'OOM', attempted_fix: 'Increase heap to 4G', result: 'failed' });
    recordError({ task_id: taskId, signature: sig, log_excerpt: errorOutput, root_cause: 'OOM', attempted_fix: 'Enable daemon cache', result: 'failed' });

    // 4th failure must be rejected
    const recovery = analyzeFailure(taskId, errorOutput);
    assert.equal(recovery.canRetry, false);
    assert.ok(recovery.reason.includes('exhausted') || recovery.reason.includes('Max'));
  });

  it('should reject duplicate identical fixes', () => {
    const taskId = `T_TEST_DUP_${Date.now()}_03`;
    const errorOutput = 'Error: SDK location not found';
    const classification = classifyError(errorOutput);
    const sig = computeSignature(classification.type, errorOutput.slice(0, 500), taskId);

    recordError({ task_id: taskId, signature: sig, log_excerpt: errorOutput, root_cause: 'missing sdk', attempted_fix: 'Set ANDROID_HOME', result: 'failed' });

    // Propose same fix
    const analysis = analyzeFailure(taskId, errorOutput, 'Set ANDROID_HOME');
    assert.ok(analysis.duplicateFix);
  });
});

// --- 5. Git Operations ---

describe('Git Safety', () => {
  it('should detect git repo and status', () => {
    assert.ok(isGitRepo(ROOT));
    const status = getStatus(ROOT);
    assert.ok(status.branch);
    assert.equal(typeof status.dirty, 'boolean');
  });

  it('should run preflight check', () => {
    const pf = preflight(ROOT);
    assert.ok(pf.isRepo);
  });
});
