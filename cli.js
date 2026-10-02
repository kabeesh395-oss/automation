#!/usr/bin/env node

/**
 * JARVIS CLI (Phase 3)
 * 
 * Commands:
 *   jarvis init "<idea>"       - Initialize a new project state
 *   jarvis analyze             - Run product analysis & requirements extraction
 *   jarvis plan                - Generate architecture, UX plan & task queue
 *   jarvis build [idea]        - Execute single-command pipeline or build tasks
 *   jarvis test                - Run automated unit tests
 *   jarvis verify [dir]        - Run verification gates
 *   jarvis resume              - Resume from saved state
 *   jarvis status              - Show project state machine status
 *   jarvis tasks               - List all tasks in queue
 *   jarvis report              - Generate verification report
 */

import { resolve, join } from 'node:path';
import {
  initProject, runAnalysis, runArchitecture, runUxPlan, runTaskPlan,
  executeTaskQueue, runVerification, runOrchestrator, resumeProject,
  generateReport
} from './core/orchestrator.js';
import { loadState, saveState } from './core/state-manager.js';
import { validateProjectState } from './core/protocol/validator.js';

const ROOT_DIR = resolve(import.meta.dirname);
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await cmdInit(args.slice(1).join(' '));
      break;
    case 'analyze':
      await cmdAnalyze();
      break;
    case 'plan':
      await cmdPlan();
      break;
    case 'build':
      await cmdBuild(args.slice(1).join(' '));
      break;
    case 'test':
      await cmdTest();
      break;
    case 'verify':
    case 'gates':
      cmdVerify(args[1]);
      break;
    case 'resume':
      await cmdResume();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'tasks':
      cmdTasks();
      break;
    case 'report':
      cmdReport(args[1]);
      break;
    case 'audit':
    case 'repair':
      await cmdAutonomousAudit(args[1], args.slice(2).join(' '));
      break;
    default:
      printUsage();
  }
}

async function cmdAutonomousAudit(projectDir, requirement) {
  if (!projectDir || !requirement) {
    console.error('Usage: node cli.js audit <projectPath> "<requirement>"');
    process.exit(1);
  }
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         JARVIS — Autonomous Audit & Repair                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  const { autonomousAuditAndRepair } = await import('./core/autonomous-repair.js');
  const result = await autonomousAuditAndRepair(projectDir, requirement);
  console.log('\n--- AUTONOMY EXECUTION RECORD ---');
  console.log(JSON.stringify(result, null, 2));
}

async function cmdInit(idea) {
  if (!idea) {
    console.error('Usage: jarvis init "<project idea>"');
    process.exit(1);
  }
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         JARVIS — Project Init            ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const state = await initProject(idea);
  console.log(`✓ Project Initialized: ${state.project.id}`);
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Target: ${state.project.target}`);
}

async function cmdAnalyze() {
  const state = loadState();
  if (!state) { console.error('No project state found. Run jarvis init "<idea>" first.'); process.exit(1); }
  const req = await runAnalysis(state);
  console.log(`✓ Product Analysis Complete: ${req.core_features.length} features extracted.`);
}

async function cmdPlan() {
  const state = loadState();
  if (!state) { console.error('No project state found.'); process.exit(1); }
  await runArchitecture(state);
  await runUxPlan(state);
  const { taskQueue } = await runTaskPlan(state);
  console.log(`✓ Planning Complete: ${taskQueue.tasks.length} tasks generated in graph.`);
}

async function cmdBuild(idea) {
  if (idea) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         JARVIS — Autonomous Pipeline Execution               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    const result = await runOrchestrator(idea);
    if (result.success) {
      console.log('\n✓ JARVIS Build Pipeline Succeeded!');
    } else {
      console.log('\n⚠ JARVIS Build Pipeline was interrupted or blocked.');
    }
    return;
  }

  const state = loadState();
  if (!state) { console.error('No project state found.'); process.exit(1); }
  const result = await executeTaskQueue(state);
  console.log(`✓ Tasks Execution: ${result.success ? 'Success' : 'Failed/Blocked'}`);
}

async function cmdTest() {
  const state = loadState();
  if (!state) { console.error('No project state found.'); process.exit(1); }
  const { gateResults } = runVerification(state);
  const testGate = gateResults.g3;
  console.log(`✓ Tests Gate: ${testGate.pass ? 'PASS' : 'FAIL'}`);
}

function cmdVerify(projectDir) {
  const state = loadState();
  if (!state) { console.error('No project state found.'); process.exit(1); }
  const { gateResults } = runVerification(state, { workspaceDir: projectDir });

  console.log('\n── Verification Gates ──\n');
  for (const [gate, res] of Object.entries(gateResults)) {
    const icon = res.pass ? '✓' : (res.status === 'NOT_VERIFIED' ? '○' : '✗');
    console.log(`  ${icon} ${gate}: ${res.pass ? 'PASS' : (res.status === 'NOT_VERIFIED' ? 'NOT_VERIFIED' : 'FAIL')}`);
  }
}

async function cmdResume() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         JARVIS — Resume Pipeline         ║');
  console.log('╚══════════════════════════════════════════╝\n');
  const result = await resumeProject();
  console.log(`\n✓ Resume completed. State: ${result.state?.phase || 'done'}`);
}

function cmdStatus() {
  const state = loadState();
  if (!state) { console.log('No active project found.'); return; }
  console.log(`Project:  ${state.project.id} — ${state.project.name || 'unnamed'}`);
  console.log(`Phase:    ${state.phase}`);
  console.log(`Request:  "${state.project.user_request}"`);
  console.log(`Tasks:    ${state.tasks.filter(t => t.status === 'done').length}/${state.tasks.length} done`);
  console.log(`Blockers: ${state.blockers.length}`);
}

function cmdTasks() {
  const state = loadState();
  if (!state) { console.log('No project found.'); return; }
  console.log('── Task Queue ──\n');
  for (const t of state.tasks) {
    const id = t.id || t.task_id;
    const icon = t.status === 'done' ? '✓' : t.status === 'running' ? '▶' : '○';
    console.log(`  ${icon} [${id}] ${t.description} (${t.status})`);
  }
}

function cmdReport(projectDir) {
  const report = generateReport(projectDir);
  console.log(JSON.stringify(report, null, 2));
}

function printUsage() {
  console.log(`
JARVIS — Autonomous Application Orchestrator (Phase 3)

Usage:
  node cli.js init "<idea>"       Initialize project
  node cli.js analyze             Extract requirements & product spec
  node cli.js plan                Generate architecture, UX plan & task graph
  node cli.js build "<idea>"      Run full end-to-end pipeline
  node cli.js test                Execute tests
  node cli.js verify              Evaluate all verification gates
  node cli.js resume              Resume from current phase
  node cli.js status              View state machine status
  node cli.js tasks               View task queue
  node cli.js report              Print verification report
`);
}

main().catch(err => {
  console.error('[JARVIS ERROR]', err.message);
  process.exit(1);
});
