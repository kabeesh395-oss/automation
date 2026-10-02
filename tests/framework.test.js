/**
 * JARVIS Framework Tests
 * 
 * Tests the core modules: state manager, validator, agent resolver,
 * recovery system, and orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Import all modules at the top level
import {
  createProjectState, saveState, loadState, ensureStateDir,
  createTask, addTask, updateTask, getNextRunnableTasks,
  loadErrorHistory, recordError, hasFixBeenAttempted, getAttemptCount,
} from '../core/state-manager.js';
import {
  validateProjectState, validateTask, validateRequirements,
} from '../core/protocol/validator.js';
import {
  loadAgents, normalizeRole, selectRequiredRoles,
} from '../core/agent-resolver.js';
import {
  computeSignature, classifyError, analyzeFailure,
} from '../core/recovery.js';
import {
  isGitRepo, getCurrentBranch, getStatus, preflight,
} from '../core/git-ops.js';
import {
  analyzeRequirements, createArchitecture, createTaskPlan,
} from '../core/orchestrator.js';

const ROOT = resolve(import.meta.dirname, '..');

// --- State Manager Tests ---

describe('State Manager', () => {
  it('should create a valid project state', () => {
    const state = createProjectState('Test project idea', 'web');
    assert.ok(state.project.id.startsWith('PRJ-'));
    assert.equal(state.project.user_request, 'Test project idea');
    assert.equal(state.project.target, 'web');
    assert.equal(state.phase, 'init');
    assert.ok(Array.isArray(state.tasks));
    assert.ok(state.gates);
  });

  it('should save and load state atomically', () => {
    ensureStateDir();
    const state = createProjectState('Save test', 'web');
    saveState(state);
    const loaded = loadState();
    assert.ok(loaded);
    assert.equal(loaded.project.user_request, 'Save test');
    assert.ok(loaded.updated);
  });

  it('should create tasks with required fields', () => {
    const task = createTask({
      description: 'Test task',
      role: 'frontend_engineer',
      depends_on: [],
    });
    assert.ok(task.task_id.startsWith('T-'));
    assert.equal(task.description, 'Test task');
    assert.equal(task.role, 'frontend_engineer');
    assert.equal(task.status, 'pending');
    assert.equal(task.retry_count, 0);
  });

  it('should track runnable tasks based on dependencies', () => {
    const state = createProjectState('Dep test', 'web');
    const t1 = createTask({ description: 'First', role: 'engineer', depends_on: [] });
    const t2 = createTask({ description: 'Second', role: 'engineer', depends_on: [t1.task_id] });
    state.tasks = [t1, t2];
    saveState(state);

    let runnable = getNextRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].task_id, t1.task_id);

    // Mark first as done
    state.tasks[0].status = 'done';
    saveState(state);
    runnable = getNextRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].task_id, t2.task_id);
  });

  it('should track error history', () => {
    recordError({
      task_id: 'T-001',
      signature: 'SIG-TEST-001',
      log_excerpt: 'test error',
      root_cause: 'test',
      attempted_fix: 'fix-A',
      result: 'failed',
    });

    assert.ok(hasFixBeenAttempted('SIG-TEST-001', 'fix-A'));
    assert.ok(!hasFixBeenAttempted('SIG-TEST-001', 'fix-B'));
    assert.ok(getAttemptCount('SIG-TEST-001') >= 1);
  });
});

// --- Validator Tests ---

describe('Validator', () => {
  it('should validate a correct project state', () => {
    const state = createProjectState('Valid state', 'web');
    const result = validateProjectState(state);
    assert.ok(result.valid, `Validation failed: ${result.errors.join(', ')}`);
  });

  it('should reject state with missing fields', () => {
    const result = validateProjectState({});
    assert.ok(!result.valid);
    assert.ok(result.errors.length > 0);
  });

  it('should reject invalid phase', () => {
    const state = createProjectState('Test', 'web');
    state.phase = 'invalid_phase';
    const result = validateProjectState(state);
    assert.ok(!result.valid);
  });

  it('should validate tasks', () => {
    const task = createTask({ description: 'Test', role: 'engineer', depends_on: [] });
    const result = validateTask(task);
    assert.ok(result.valid);
  });

  it('should validate requirements', () => {
    const result = validateRequirements({
      target: 'web',
      features: [{ name: 'feature-1' }],
    });
    assert.ok(result.valid);
  });

  it('should reject requirements without features', () => {
    const result = validateRequirements({ target: 'web' });
    assert.ok(!result.valid);
  });
});

// --- Agent Resolver Tests ---

describe('Agent Resolver', () => {
  it('should load agent definitions from .agents/agents/', () => {
    const agents = loadAgents();
    assert.ok(agents.length > 0, 'No agents loaded');
    assert.ok(agents.some(a => a.name.toLowerCase().includes('orchestrator')));
  });

  it('should normalize role names', () => {
    assert.equal(normalizeRole('Frontend Engineer'), 'frontend_engineer');
    assert.equal(normalizeRole('qa-test-engineer'), 'qa_test_engineer');
    assert.equal(normalizeRole('Code Reviewer'), 'code_reviewer');
  });

  it('should select only needed roles', () => {
    const roles = selectRequiredRoles({ target: 'web', features: [{ name: 'core-feature' }] });
    assert.ok(roles.includes('frontend_engineer'));
    assert.ok(roles.includes('product_analyst'));
    // AI engineer should NOT be selected for a simple web project
    assert.ok(!roles.includes('ai_gemini_engineer'));
  });
});

// --- Recovery Tests ---

describe('Recovery System', () => {
  it('should compute stable signatures', () => {
    const sig1 = computeSignature('build_error', 'FAILURE: Build failed with an exception');
    const sig2 = computeSignature('build_error', 'FAILURE: Build failed with an exception');
    assert.equal(sig1, sig2);
  });

  it('should normalize numbers in signatures', () => {
    const sig1 = computeSignature('build_error', 'Error at line 42');
    const sig2 = computeSignature('build_error', 'Error at line 99');
    assert.equal(sig1, sig2);
  });

  it('should classify errors correctly', () => {
    assert.equal(classifyError('Module not found: foo').type, 'missing_dependency');
    assert.equal(classifyError('SyntaxError: Unexpected token').type, 'syntax_error');
    assert.equal(classifyError('ENOENT: no such file').type, 'file_not_found');
    assert.equal(classifyError('Build failed with error').type, 'build_error');
  });
});

// --- Git Ops Tests ---

describe('Git Operations', () => {
  it('should detect git repo', () => {
    assert.ok(isGitRepo(ROOT));
  });

  it('should get current branch', () => {
    const branch = getCurrentBranch(ROOT);
    assert.ok(branch, 'Branch should not be null');
  });

  it('should return status', () => {
    const status = getStatus(ROOT);
    assert.ok(status.branch);
    assert.equal(typeof status.dirty, 'boolean');
  });

  it('should run preflight', () => {
    const result = preflight(ROOT);
    assert.ok(result.isRepo);
  });
});

// --- Orchestrator Integration Tests ---

describe('Orchestrator', () => {
  it('should analyze requirements from a user request', () => {
    ensureStateDir();
    const state = createProjectState('Create a web app with a home screen and a button', 'web');
    saveState(state);

    const reqs = analyzeRequirements('Create a web app with a home screen and a button', 'web');
    assert.ok(reqs.features.length > 0);
    assert.ok(reqs.features.some(f => f.name.includes('home-screen') || f.name.includes('button')));
  });

  it('should create architecture from requirements', () => {
    const reqs = { target: 'web', features: [{ name: 'home-screen', description: 'Home screen' }] };
    const arch = createArchitecture(reqs);
    assert.ok(arch.stack);
    assert.ok(arch.components.length > 0);
  });

  it('should create a task plan with correct dependencies', () => {
    const reqs = { target: 'web', features: [{ name: 'feature-a', description: 'Feature A' }] };
    const arch = { stack: { language: 'javascript', framework: 'vanilla' }, components: [] };
    const tasks = createTaskPlan(reqs, arch);
    assert.ok(tasks.length >= 3); // setup + feature + test + build
    // First task should have no deps
    assert.equal(tasks[0].depends_on.length, 0);
    // Later tasks depend on setup
    assert.ok(tasks[1].depends_on.includes(tasks[0].task_id));
  });
});
