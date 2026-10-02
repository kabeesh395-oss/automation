/**
 * JARVIS State Manager
 * 
 * Handles persistent project state with atomic writes.
 * All state mutations go through this module.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const STATE_DIR = join(import.meta.dirname, '..', 'state');
const STATE_FILE = join(STATE_DIR, 'project_state.json');
const ERROR_HISTORY_FILE = join(STATE_DIR, 'error_history.json');

/** Create a fresh project state from a user request */
export function createProjectState(userRequest, targetPlatform = 'web') {
  const now = new Date().toISOString();
  const projectId = `PRJ-${Date.now().toString(36).toUpperCase()}`;

  const state = {
    schema_version: '1.0',
    project: {
      id: projectId,
      name: '',
      target: targetPlatform,
      user_request: userRequest,
      created: now,
    },
    environment: {
      node_version: process.version,
      platform: process.platform,
      tools_available: [],
      tools_missing: [],
      limitations: [],
    },
    phase: 'init',
    phases_completed: [],
    tasks: [],
    decisions: [],
    requirements: null,
    architecture: null,
    implementation_plan: null,
    test_results: { last_run: '', passed: 0, failed: 0, log: '' },
    build_results: { last_run: '', status: '', log: '', artifact: '' },
    known_limitations: [],
    not_implemented: [],
    files_changed: [],
    git: { branch: '', head: '', dirty: false, pr_url: '' },
    gates: {
      g1_requirements: 'pending',
      g2_build: 'pending',
      g3_tests: 'pending',
      g4_runtime: 'pending',
      g5_feature: 'pending',
      g6_security: 'pending',
      g7_release: 'pending',
    },
    gate_evidence: {},
    errors: [],
    retry_counts: {},
    blockers: [],
    updated: now,
  };

  return state;
}

/** Ensure the state directory exists */
export function ensureStateDir() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  const artifactsDir = join(STATE_DIR, 'artifacts');
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }
}

/** Atomic write — write to temp file, then rename */
export function saveState(state) {
  ensureStateDir();
  state.updated = new Date().toISOString();
  const tempFile = STATE_FILE + '.tmp';
  writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tempFile, STATE_FILE);
  return state;
}

/** Load existing state, or return null if none exists */
export function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STATE] Failed to load state: ${err.message}`);
    return null;
  }
}

/** Update specific fields in state (merge) */
export function updateState(updates) {
  const state = loadState();
  if (!state) throw new Error('No project state found. Run init first.');
  const merged = deepMerge(state, updates);
  return saveState(merged);
}

/** Transition to a new phase */
export function transitionPhase(newPhase) {
  const state = loadState();
  if (!state) throw new Error('No project state found.');
  if (state.phase !== newPhase) {
    state.phases_completed.push({ phase: state.phase, completed: new Date().toISOString() });
  }
  state.phase = newPhase;
  return saveState(state);
}

// --- Task Management ---

/** Create a new task */
export function createTask({ description, role, depends_on = [], inputs = [], acceptance = [] }) {
  const taskId = `T-${String(Date.now()).slice(-6)}`;
  return {
    task_id: taskId,
    description,
    role,
    depends_on,
    status: 'pending',
    inputs,
    acceptance,
    output: null,
    files_changed: [],
    verification: 'pending',
    retry_count: 0,
    errors: [],
    created: new Date().toISOString(),
    started: null,
    completed: null,
  };
}

/** Add task to state */
export function addTask(task) {
  const state = loadState();
  if (!state) throw new Error('No project state found.');
  state.tasks.push(task);
  return saveState(state);
}

/** Update a task by ID */
export function updateTask(taskId, updates) {
  const state = loadState();
  if (!state) throw new Error('No project state found.');
  const idx = state.tasks.findIndex(t => t.task_id === taskId);
  if (idx === -1) throw new Error(`Task ${taskId} not found.`);
  state.tasks[idx] = { ...state.tasks[idx], ...updates };
  return saveState(state);
}

/** Get tasks by status */
export function getTasksByStatus(status) {
  const state = loadState();
  if (!state) return [];
  return state.tasks.filter(t => t.status === status);
}

/** Get next runnable tasks (pending + all dependencies met) */
export function getNextRunnableTasks() {
  const state = loadState();
  if (!state) return [];
  const completedIds = new Set(state.tasks.filter(t => t.status === 'done').map(t => t.task_id));
  return state.tasks.filter(t => {
    if (t.status !== 'pending') return false;
    return t.depends_on.every(dep => completedIds.has(dep));
  });
}

// --- Error History ---

/** Load error history */
export function loadErrorHistory() {
  ensureStateDir();
  if (!existsSync(ERROR_HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ERROR_HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/** Record an error attempt */
export function recordError({ task_id, signature, log_excerpt, root_cause, attempted_fix, result }) {
  const history = loadErrorHistory();
  const entry = {
    id: `E-${String(Date.now()).slice(-6)}`,
    task_id,
    signature,
    log_excerpt: log_excerpt?.slice(0, 2000),
    root_cause,
    attempted_fix,
    result,
    timestamp: new Date().toISOString(),
  };
  history.push(entry);
  writeFileSync(ERROR_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  return entry;
}

/** Check if a fix has already been attempted for a given error signature */
export function hasFixBeenAttempted(signature, fix) {
  const history = loadErrorHistory();
  return history.some(e => e.signature === signature && e.attempted_fix === fix);
}

/** Count distinct attempts for an error signature */
export function getAttemptCount(signature) {
  const history = loadErrorHistory();
  return history.filter(e => e.signature === signature).length;
}

// --- Utility ---

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export { STATE_DIR, STATE_FILE, ERROR_HISTORY_FILE };
