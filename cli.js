#!/usr/bin/env node

/**
 * JARVIS CLI
 * 
 * Entry point for the JARVIS orchestration system.
 * 
 * Usage:
 *   node cli.js init "<project idea>"
 *   node cli.js status
 *   node cli.js resume
 *   node cli.js verify [projectDir]
 *   node cli.js report
 *   node cli.js gates [projectDir]
 *   node cli.js tasks
 *   node cli.js env
 */

import { resolve, join } from 'node:path';
import {
  initProject, analyzeRequirements, createArchitecture,
  createTaskPlan, initWorkspace, verify, generateReport,
} from './core/orchestrator.js';
import {
  loadState, getNextRunnableTasks, updateTask, transitionPhase, saveState,
} from './core/state-manager.js';
import * as gitOps from './core/git-ops.js';
import * as gateRunner from './core/gate-runner.js';
import * as logger from './core/logger.js';
import { validateProjectState } from './core/protocol/validator.js';

const ROOT_DIR = resolve(import.meta.dirname);
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await cmdInit(args.slice(1).join(' '));
      break;
    case 'status':
      cmdStatus();
      break;
    case 'tasks':
      cmdTasks();
      break;
    case 'next':
      cmdNext();
      break;
    case 'verify':
      cmdVerify(args[1]);
      break;
    case 'gates':
      cmdGates(args[1]);
      break;
    case 'report':
      cmdReport(args[1]);
      break;
    case 'env':
      cmdEnv();
      break;
    case 'validate':
      cmdValidate();
      break;
    default:
      printUsage();
  }
}

async function cmdInit(idea) {
  if (!idea) {
    console.error('Usage: jarvis init "<project idea>"');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════╗');
  console.log('║         JARVIS — Project Init            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();

  // Phase 0: Init
  const state = await initProject(idea);
  console.log(`\n✓ Project: ${state.project.id} — "${state.project.name}"`);
  console.log(`  Target:  ${state.project.target}`);
  console.log(`  Phase:   ${state.phase}`);

  // Phase 1: Requirements
  console.log('\n── Phase 1: Requirements ──');
  const requirements = analyzeRequirements(idea, state.project.target);
  console.log(`  Features: ${requirements.features.map(f => f.name).join(', ')}`);

  // Phase 2: Architecture
  console.log('\n── Phase 2: Architecture ──');
  const architecture = createArchitecture(requirements);
  console.log(`  Stack: ${JSON.stringify(architecture.stack)}`);

  // Phase 3: Task Plan
  console.log('\n── Phase 3: Task Plan ──');
  const tasks = createTaskPlan(requirements, architecture);
  for (const task of tasks) {
    console.log(`  [${task.task_id}] ${task.description} (${task.role})`);
  }

  // Phase 4: Workspace Init
  console.log('\n── Phase 4: Workspace ──');
  const wsDir = state.project.workspace_dir;
  initWorkspace(wsDir, architecture);
  console.log(`  Workspace initialized: ${wsDir}`);

  console.log('\n══════════════════════════════════════════');
  console.log(`✓ Init complete. ${tasks.length} tasks queued.`);
  console.log('  Run: jarvis next     — to see next tasks');
  console.log('  Run: jarvis status   — to see full status');
  console.log('══════════════════════════════════════════');
}

function cmdStatus() {
  const state = loadState();
  if (!state) {
    console.log('No project found. Run: jarvis init "<idea>"');
    return;
  }

  const validation = validateProjectState(state);

  console.log('╔══════════════════════════════════════════╗');
  console.log('║         JARVIS — Project Status          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();
  console.log(`  Project:  ${state.project.id} — ${state.project.name}`);
  console.log(`  Request:  ${state.project.user_request}`);
  console.log(`  Target:   ${state.project.target}`);
  console.log(`  Phase:    ${state.phase}`);
  console.log(`  Updated:  ${state.updated}`);
  console.log(`  Valid:    ${validation.valid ? '✓' : '✗ ' + validation.errors.join(', ')}`);

  console.log('\n── Tasks ──');
  const byStatus = {};
  for (const task of state.tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
  }
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log('\n── Gates ──');
  for (const [gate, status] of Object.entries(state.gates)) {
    const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '○';
    console.log(`  ${icon} ${gate}: ${status}`);
  }

  if (state.blockers.length > 0) {
    console.log('\n── Blockers ──');
    state.blockers.forEach(b => console.log(`  ⚠ ${b}`));
  }

  if (state.not_implemented.length > 0) {
    console.log('\n── Not Implemented ──');
    state.not_implemented.forEach(n => console.log(`  ◌ ${n.feature}: ${n.reason}`));
  }
}

function cmdTasks() {
  const state = loadState();
  if (!state) { console.log('No project found.'); return; }

  console.log('── Task Queue ──\n');
  for (const task of state.tasks) {
    const icon = { done: '✓', failed: '✗', running: '▶', pending: '○', blocked: '⚠', not_implemented: '◌' }[task.status] || '?';
    console.log(`  ${icon} [${task.task_id}] ${task.description}`);
    console.log(`    Role: ${task.role} | Status: ${task.status} | Retries: ${task.retry_count}`);
    if (task.depends_on.length > 0) {
      console.log(`    Depends: ${task.depends_on.join(', ')}`);
    }
    if (task.errors.length > 0) {
      console.log(`    Errors: ${task.errors[task.errors.length - 1]}`);
    }
    console.log();
  }
}

function cmdNext() {
  const nextTasks = getNextRunnableTasks();
  if (nextTasks.length === 0) {
    const state = loadState();
    if (!state) { console.log('No project found.'); return; }
    const hasFailed = state.tasks.some(t => t.status === 'failed' || t.status === 'blocked');
    if (hasFailed) {
      console.log('No runnable tasks. Some tasks are failed/blocked:');
      state.tasks.filter(t => t.status === 'failed' || t.status === 'blocked')
        .forEach(t => console.log(`  ✗ [${t.task_id}] ${t.description}: ${t.errors[t.errors.length - 1] || 'unknown'}`));
    } else if (state.tasks.every(t => t.status === 'done')) {
      console.log('All tasks complete! Run: jarvis verify');
    } else {
      console.log('No runnable tasks at this time.');
    }
    return;
  }

  console.log('── Next Runnable Tasks ──\n');
  for (const task of nextTasks) {
    console.log(`  ○ [${task.task_id}] ${task.description}`);
    console.log(`    Role: ${task.role}`);
    console.log(`    Acceptance: ${task.acceptance.join('; ')}`);
    console.log();
  }
}

function cmdVerify(projectDir) {
  const state = loadState();
  if (!state) { console.log('No project found.'); return; }

  const dir = projectDir || state.project?.workspace_dir || ROOT_DIR;
  const stack = state.architecture?.stack || {};

  const options = {};
  if (stack.build === 'gradle') {
    options.buildCmd = process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug';
  } else if (stack.build === 'npm') {
    options.buildCmd = 'npm run build';
  }
  if (stack.test === 'node-test') {
    options.testCmd = 'node --test';
  } else if (stack.test === 'junit') {
    options.testCmd = process.platform === 'win32' ? '.\\gradlew.bat test' : './gradlew test';
  }

  const results = verify(dir, options);

  console.log('\n── Verification Results ──\n');
  for (const [gate, result] of Object.entries(results)) {
    const icon = result.pass ? '✓' : '✗';
    console.log(`  ${icon} ${gate}: ${result.pass ? 'PASS' : 'FAIL'}`);
    if (result.evidence?.checks) {
      for (const check of result.evidence.checks) {
        console.log(`    ${check.pass ? '✓' : '✗'} ${check.check}${check.detail ? ': ' + check.detail : ''}`);
      }
    }
  }
}

function cmdGates(projectDir) {
  cmdVerify(projectDir);
}

function cmdReport(projectDir) {
  const report = generateReport(projectDir);
  console.log(JSON.stringify(report, null, 2));
}

function cmdEnv() {
  console.log('── Environment ──\n');
  const state = loadState();
  if (state?.environment) {
    console.log(JSON.stringify(state.environment, null, 2));
  } else {
    console.log('No environment data. Run: jarvis init "<idea>" first.');
  }
}

function cmdValidate() {
  const state = loadState();
  if (!state) { console.log('No project found.'); return; }
  const result = validateProjectState(state);
  if (result.valid) {
    console.log('✓ Project state is valid');
  } else {
    console.log('✗ Project state validation errors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
}

function printUsage() {
  console.log(`
JARVIS — Autonomous Software-Development Orchestrator

Usage:
  node cli.js init "<project idea>"   Initialize a project
  node cli.js status                  Show project status
  node cli.js tasks                   List all tasks
  node cli.js next                    Show next runnable tasks
  node cli.js verify [dir]            Run verification gates
  node cli.js report [dir]            Generate final report
  node cli.js env                     Show environment info
  node cli.js validate                Validate project state
  `);
}

main().catch(err => {
  console.error('JARVIS error:', err.message);
  process.exit(1);
});
