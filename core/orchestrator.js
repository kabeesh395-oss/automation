/**
 * JARVIS Master Orchestrator (Phase 3)
 * 
 * Reusable Autonomous Software-Development State Machine:
 * 
 * NATURAL LANGUAGE IDEA
 *         ↓
 * [1. INIT]                - Toolchain & environment check, git branch setup
 *         ↓
 * [2. ANALYSIS]            - Product Analyst -> requirements.json + product_spec.md
 *         ↓
 * [3. ARCHITECTURE]        - Software Architect -> architecture.json
 *         ↓
 * [4. UX_PLAN]             - UX/UI Architect -> ux_plan.json
 *         ↓
 * [5. IMPLEMENTATION_PLAN] - Task Planner -> implementation_plan.json + task_queue.json
 *         ↓
 * [6. EXECUTION]           - Task Graph Execution Engine (code, models, UI)
 *         ↓
 * [7. BUILD & TEST]        - Gradle / test runners with bounded recovery loop
 *         ↓
 * [8. VERIFY & GATES]      - Gates 1–7 -> verification_report.json
 *         ↓
 * [9. RELEASE]             - Verified artifact + checksum
 *         ↓
 * [10. COMPLETED]          - Clean git commit & final report
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createProjectState, saveState, loadState, updateState, transitionPhase,
  ensureStateDir, STATE_DIR
} from './state-manager.js';
import { analyzeProduct } from './product-analyst.js';
import { designArchitecture } from './software-architect.js';
import { designUxPlan } from './ux-architect.js';
import { planTasks } from './task-planner.js';
import { TaskGraph } from './task-graph.js';
import { executeTask } from './executor.js';
import { analyzeFailure, recordRecoveryAttempt } from './recovery.js';
import { runAllGates } from './gate-runner.js';
import { getStatus, initRepo, createFeatureBranch } from './git-ops.js';
import * as logger from './logger.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');

export const ORCHESTRATOR_PHASES = {
  INIT: 'INIT',
  ANALYSIS: 'ANALYSIS',
  ARCHITECTURE: 'ARCHITECTURE',
  UX_PLAN: 'UX_PLAN',
  IMPLEMENTATION_PLAN: 'IMPLEMENTATION_PLAN',
  EXECUTION: 'EXECUTION',
  BUILD: 'BUILD',
  TEST: 'TEST',
  RECOVERY: 'RECOVERY',
  VERIFY: 'VERIFY',
  RELEASE: 'RELEASE',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED'
};

/**
 * Initialize a new project state.
 */
export async function initProject(userRequest, options = {}) {
  const target = options.target || 'android';
  const workspaceDir = options.workspaceDir || join(ROOT_DIR, 'poc-workspace');

  logger.logInit(`[JARVIS Phase 3] Initializing for: "${userRequest}"`);

  const state = createProjectState(userRequest, target);
  state.phase = ORCHESTRATOR_PHASES.INIT;
  state.project.workspace_dir = workspaceDir;

  ensureStateDir();
  saveState(state);

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Setup git feature branch
  try {
    initRepo(workspaceDir);
    createFeatureBranch('jarvis-phase3', workspaceDir);
  } catch { /* skip if already initialized */ }

  return state;
}

/**
 * Run Product Analysis stage.
 */
export async function runAnalysis(state) {
  logger.logPhase('ANALYSIS', 'Extracting product requirements');
  state.phase = ORCHESTRATOR_PHASES.ANALYSIS;

  const { requirements, productSpecMd } = await analyzeProduct(state.project.user_request, {
    target: state.project.target
  });

  state.requirements = requirements;
  state.project.name = requirements.app_name;

  // Persist artifact
  const artifactsDir = join(STATE_DIR, 'artifacts');
  if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(join(artifactsDir, 'requirements.json'), JSON.stringify(requirements, null, 2), 'utf-8');
  writeFileSync(join(artifactsDir, 'product_spec.md'), productSpecMd, 'utf-8');

  saveState(state);
  return requirements;
}

/**
 * Run Architecture Design stage.
 */
export async function runArchitecture(state, options = {}) {
  logger.logPhase('ARCHITECTURE', 'Designing system architecture and stack');
  state.phase = ORCHESTRATOR_PHASES.ARCHITECTURE;

  const architecture = await designArchitecture(state.requirements, options);
  state.architecture = architecture;
  state.decisions = architecture.decisions || [];

  const artifactsDir = join(STATE_DIR, 'artifacts');
  writeFileSync(join(artifactsDir, 'architecture.json'), JSON.stringify(architecture, null, 2), 'utf-8');

  saveState(state);
  return architecture;
}

/**
 * Run UX Planning stage.
 */
export async function runUxPlan(state, options = {}) {
  logger.logPhase('UX_PLAN', 'Designing UX flows and composable screen hierarchy');
  state.phase = ORCHESTRATOR_PHASES.UX_PLAN;

  const uxPlan = await designUxPlan(state.requirements, state.architecture, options);
  state.ux_plan = uxPlan;

  const artifactsDir = join(STATE_DIR, 'artifacts');
  writeFileSync(join(artifactsDir, 'ux_plan.json'), JSON.stringify(uxPlan, null, 2), 'utf-8');

  saveState(state);
  return uxPlan;
}

/**
 * Run Task Planning stage.
 */
export async function runTaskPlan(state, options = {}) {
  logger.logPhase('IMPLEMENTATION_PLAN', 'Generating dependency-aware task graph');
  state.phase = ORCHESTRATOR_PHASES.IMPLEMENTATION_PLAN;

  const { implementationPlan, taskQueue } = await planTasks(
    state.requirements,
    state.architecture,
    state.ux_plan,
    state.project.id,
    options
  );

  state.implementation_plan = implementationPlan;
  state.tasks = taskQueue.tasks;

  const artifactsDir = join(STATE_DIR, 'artifacts');
  writeFileSync(join(artifactsDir, 'implementation_plan.json'), JSON.stringify(implementationPlan, null, 2), 'utf-8');
  writeFileSync(join(artifactsDir, 'task_queue.json'), JSON.stringify(taskQueue, null, 2), 'utf-8');

  saveState(state);
  return { implementationPlan, taskQueue };
}

/**
 * Execute the task queue using the TaskGraph engine.
 */
export async function executeTaskQueue(state, options = {}) {
  logger.logPhase('EXECUTION', 'Executing task graph');
  state.phase = ORCHESTRATOR_PHASES.EXECUTION;
  saveState(state);

  const workspaceDir = state.project.workspace_dir || join(ROOT_DIR, 'poc-workspace');
  const graph = new TaskGraph(state.tasks);

  while (true) {
    const readyTasks = graph.getReadyTasks();
    if (readyTasks.length === 0) break;

    for (const task of readyTasks) {
      const result = await executeTask(task, workspaceDir, state, options);

      if (!result.success) {
        // Run Recovery Loop
        logger.logRecovery(`Attempting recovery for task [${task.id || task.task_id}]`);
        state.phase = ORCHESTRATOR_PHASES.RECOVERY;

        const recovery = analyzeFailure(task.id || task.task_id, result.error.message);
        if (recovery.canRetry) {
          logger.logRecovery(`Retrying task with suggestion: ${recovery.suggestion}`);
          // Attempt AI Debugger repair
          await attemptAIDebugRepair({
            taskId: task.id || task.task_id,
            classification: recovery.classification,
            errorLog: result.error.message,
            previousFixes: [recovery.suggestion]
          }, workspaceDir, options);

          // Retry task
          const retryResult = await executeTask(task, workspaceDir, state, options);
          recordRecoveryAttempt(task.id || task.task_id, recovery.signature, result.error.message, recovery.classification.type, recovery.suggestion, retryResult.success);
          if (!retryResult.success) {
            state.phase = ORCHESTRATOR_PHASES.BLOCKED;
            state.blockers.push({
              task_id: task.id || task.task_id,
              error: result.error.message,
              reason: recovery.reason || 'Task execution failed after recovery attempt'
            });
            saveState(state);
            return { success: false, state };
          }
        } else {
          state.phase = ORCHESTRATOR_PHASES.BLOCKED;
          state.blockers.push({
            task_id: task.id || task.task_id,
            error: result.error.message,
            reason: recovery.reason
          });
          saveState(state);
          return { success: false, state };
        }
      }
    }
  }

  saveState(state);
  return { success: graph.isCompleted(), state };
}

/**
 * Run verification gates and generate final report.
 */
export function runVerification(state, options = {}) {
  logger.logPhase('VERIFY', 'Executing verification gates');
  state.phase = ORCHESTRATOR_PHASES.VERIFY;

  const workspaceDir = state.project.workspace_dir || join(ROOT_DIR, 'poc-workspace');
  const gateResults = runAllGates(state, workspaceDir, options);

  for (const [gate, result] of Object.entries(gateResults)) {
    const gateKey = gate.startsWith('g') ? `${gate}_${getGateName(gate)}` : gate;
    if (state.gates[gateKey] !== undefined) {
      state.gates[gateKey] = result.pass ? 'pass' : (result.status === 'NOT_VERIFIED' ? 'NOT_VERIFIED' : (result.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'fail'));
    }
    state.gate_evidence[gate] = result.evidence;
  }

  // Update build and test results
  if (gateResults.g2) {
    state.build_results = {
      last_run: new Date().toISOString(),
      status: gateResults.g2.pass ? 'success' : 'failed',
      log: gateResults.g2.evidence?.checks?.[0]?.stdout || '',
      artifact: gateResults.g7?.artifactDetails?.file_path || null
    };
  }

  if (gateResults.g3) {
    const testCheck = gateResults.g3.evidence?.checks?.[0] || {};
    state.test_results = {
      last_run: new Date().toISOString(),
      passed: testCheck.passed || 0,
      failed: testCheck.failed || 0,
      log: testCheck.stdout || ''
    };
  }

  state.phase = ORCHESTRATOR_PHASES.RELEASE;
  saveState(state);

  const report = generateReport(workspaceDir);
  state.phase = ORCHESTRATOR_PHASES.COMPLETED;
  saveState(state);

  return { gateResults, report };
}

/**
 * Generate final verification report.
 */
export function generateReport(projectDir) {
  const state = loadState();
  if (!state) throw new Error('No project state found');

  const workspace = projectDir || state.project.workspace_dir || ROOT_DIR;
  const gitStatus = getStatus(workspace);

  const report = {
    project: state.project,
    generated: new Date().toISOString(),
    phase: state.phase,
    requirements_summary: {
      total_features: state.requirements?.core_features?.length || state.requirements?.features?.length || 0,
      target: state.requirements?.target_platform || state.project.target || 'android'
    },
    tasks_summary: {
      total: state.tasks.length,
      done: state.tasks.filter(t => t.status === 'done').length,
      failed: state.tasks.filter(t => t.status === 'failed').length,
      blocked: state.tasks.filter(t => t.status === 'blocked').length,
      pending: state.tasks.filter(t => t.status === 'pending').length
    },
    gates: state.gates,
    gate_evidence: state.gate_evidence,
    build_results: state.build_results,
    test_results: state.test_results,
    git: {
      ...gitStatus,
      jarvis_branch: gitStatus.branch
    },
    not_implemented: state.not_implemented || [],
    known_limitations: state.known_limitations || [],
    blockers: state.blockers || [],
    decisions: state.decisions || [],
    errors: state.errors || []
  };

  ensureStateDir();
  const reportPath = join(STATE_DIR, 'artifacts', 'verification_report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.logVerify(`Verification report saved: ${reportPath}`);
  return report;
}

/**
 * Complete Reusable End-to-End Pipeline
 */
export async function runOrchestrator(userRequest, options = {}) {
  logger.logInit(`=== JARVIS Reusable Pipeline: "${userRequest}" ===`);

  try {
    // 1. Init
    const state = await initProject(userRequest, options);

    // 2. Product Analysis
    await runAnalysis(state, options);

    // 3. Architecture
    await runArchitecture(state, options);

    // 4. UX Plan
    await runUxPlan(state, options);

    // 5. Task Plan
    await runTaskPlan(state, options);

    // 6. Execute Task Queue
    const execResult = await executeTaskQueue(state, options);
    if (!execResult.success) {
      logger.logError('Task execution was blocked or failed. State preserved for resume.');
      return { success: false, state: execResult.state };
    }

    // 7. Verify Gates & Package
    const { gateResults, report } = runVerification(state, options);

    logger.logInit(`=== Pipeline Completed Successfully. State: ${state.phase} ===`);
    return { success: true, state, gateResults, report };
  } catch (err) {
    logger.logError(`Pipeline error: ${err.message}`);
    const state = loadState();
    if (state) {
      state.phase = ORCHESTRATOR_PHASES.BLOCKED;
      state.blockers.push({
        error: err.message,
        stage: 'orchestrator',
        reason: err.name === 'AICredentialsMissingError' ? 'Missing AI credentials (GEMINI_API_KEY / GOOGLE_API_KEY)' : err.message
      });
      saveState(state);
    }
    return { success: false, error: err.message, status: 'BLOCKED' };
  }
}

/**
 * Resume execution from saved state.
 */
export async function resumeProject(options = {}) {
  const state = loadState();
  if (!state) throw new Error('No state to resume.');

  logger.logInit(`Resuming JARVIS from phase: ${state.phase}`);

  if (state.phase === ORCHESTRATOR_PHASES.INIT) {
    await runAnalysis(state, options);
    await runArchitecture(state, options);
    await runUxPlan(state, options);
    await runTaskPlan(state, options);
    await executeTaskQueue(state, options);
    return runVerification(state, options);
  } else if (state.phase === ORCHESTRATOR_PHASES.ANALYSIS) {
    await runArchitecture(state, options);
    await runUxPlan(state, options);
    await runTaskPlan(state, options);
    await executeTaskQueue(state, options);
    return runVerification(state, options);
  } else if (state.phase === ORCHESTRATOR_PHASES.ARCHITECTURE) {
    await runUxPlan(state, options);
    await runTaskPlan(state, options);
    await executeTaskQueue(state, options);
    return runVerification(state, options);
  } else if (state.phase === ORCHESTRATOR_PHASES.UX_PLAN) {
    await runTaskPlan(state, options);
    await executeTaskQueue(state, options);
    return runVerification(state, options);
  } else if (state.phase === ORCHESTRATOR_PHASES.IMPLEMENTATION_PLAN || state.phase === ORCHESTRATOR_PHASES.EXECUTION || state.phase === ORCHESTRATOR_PHASES.RECOVERY) {
    await executeTaskQueue(state, options);
    return runVerification(state, options);
  } else if (state.phase === ORCHESTRATOR_PHASES.VERIFY || state.phase === ORCHESTRATOR_PHASES.BUILD || state.phase === ORCHESTRATOR_PHASES.TEST) {
    return runVerification(state, options);
  } else {
    logger.logInit(`Project already in phase: ${state.phase}`);
    return { success: true, state };
  }
}

function getGateName(gate) {
  const names = { g1: 'requirements', g2: 'build', g3: 'tests', g4: 'runtime', g5: 'feature', g6: 'security', g7: 'release' };
  return names[gate] || gate;
}

// Backwards compatibility helpers
export function analyzeRequirements(userRequest, target) {
  const { requirements } = analyzeProduct(userRequest, { target });
  return requirements;
}

export function createArchitecture(requirements) {
  return designArchitecture(requirements);
}

export function createTaskPlan(requirements, architecture) {
  const ux = designUxPlan(requirements, architecture);
  const { taskQueue } = planTasks(requirements, architecture, ux);
  return taskQueue.tasks;
}

export function initWorkspace(workspaceDir, architecture) {
  if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
  try {
    initRepo(workspaceDir);
    createFeatureBranch('jarvis-init', workspaceDir);
  } catch { /* skip */ }
  return true;
}

export function verify(projectDir, options = {}) {
  const state = loadState();
  return runAllGates(state, projectDir, options);
}
