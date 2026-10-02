/**
 * JARVIS Master Orchestrator
 * 
 * The central state machine that drives the entire development pipeline.
 * 
 * This is NOT a simulation — every phase runs real operations:
 * - Real file I/O for project creation
 * - Real terminal commands for build/test
 * - Real git operations for version control
 * - Real verification gates with evidence
 * 
 * The orchestrator coordinates work through a state machine.
 * In Antigravity, the agent reads the orchestrator's output and
 * executes the next action using its native capabilities.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createProjectState, saveState, loadState, updateState, transitionPhase,
  createTask, addTask, updateTask, getNextRunnableTasks, ensureStateDir,
} from './state-manager.js';
import { selectRequiredRoles, normalizeRole } from './agent-resolver.js';
import { preflight, initRepo, createFeatureBranch, commitChanges, getStatus } from './git-ops.js';
import { runAllGates, gateBuild, gateTests, gateSecurity, gateGit } from './gate-runner.js';
import { analyzeFailure, recordRecoveryAttempt } from './recovery.js';
import { validateProjectState, validateTask, validateRequirements } from './protocol/validator.js';
import * as logger from './logger.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');

// --- Phase Definitions ---

const PHASES = [
  'init',       // Environment inspection, project creation
  'analysis',   // Requirements extraction
  'design',     // Architecture + UX design
  'plan',       // Task decomposition
  'build',      // Code implementation
  'test',       // Testing
  'verify',     // Gate verification
  'security',   // Security scan
  'review',     // Code review
  'release',    // Packaging
  'done',       // Complete
];

/**
 * Initialize a new project from a user request.
 * 
 * @param {string} userRequest - Natural language project description
 * @param {object} options - { target, workspaceDir }
 * @returns {object} - Project state
 */
export async function initProject(userRequest, options = {}) {
  const target = options.target || detectTarget(userRequest);
  const workspaceDir = options.workspaceDir || join(ROOT_DIR, 'poc-workspace');

  logger.logInit(`Starting JARVIS for: "${userRequest}"`);
  logger.logInit(`Target platform: ${target}`);
  logger.logInit(`Workspace: ${workspaceDir}`);

  // Create state
  const state = createProjectState(userRequest, target);
  state.project.name = extractProjectName(userRequest);
  state.project.workspace_dir = workspaceDir;

  // Inspect environment
  state.environment = inspectEnvironment();

  // Save initial state
  ensureStateDir();
  saveState(state);

  logger.logInit(`Project created: ${state.project.id} — ${state.project.name}`);
  return state;
}

/**
 * Analyze requirements from the user request.
 * Returns structured requirements.
 */
export function analyzeRequirements(userRequest, target) {
  logger.logPlan('Analyzing requirements...');

  // Parse the user request into structured requirements
  const requirements = {
    target,
    user_request: userRequest,
    features: extractFeatures(userRequest),
    non_functional: [
      { name: 'buildable', description: 'Project must compile/build without errors' },
      { name: 'testable', description: 'Core features must have tests' },
    ],
    constraints: [],
    created: new Date().toISOString(),
  };

  // Validate
  const validation = validateRequirements(requirements);
  if (!validation.valid) {
    logger.logError(`Requirements validation failed: ${validation.errors.join(', ')}`);
  }

  // Save to state
  const state = loadState();
  state.requirements = requirements;
  transitionPhase('analysis');
  saveState(state);

  logger.logPlan(`Extracted ${requirements.features.length} features`);
  return requirements;
}

/**
 * Create architecture decisions based on requirements.
 */
export function createArchitecture(requirements) {
  logger.logPlan('Designing architecture...');

  const target = requirements.target;
  const architecture = {
    target,
    stack: getStackForTarget(target),
    components: [],
    api_contracts: [],
    decisions: [],
    created: new Date().toISOString(),
  };

  // Map features to components
  for (const feature of requirements.features) {
    architecture.components.push({
      name: feature.name,
      type: guessComponentType(feature, target),
      description: feature.description,
    });
  }

  // Save
  const state = loadState();
  state.architecture = architecture;
  state.decisions.push({
    id: `D-${Date.now().toString(36)}`,
    decision: `Stack: ${JSON.stringify(architecture.stack)}`,
    reason: `Best fit for ${target} target`,
    date: new Date().toISOString(),
  });
  transitionPhase('design');
  saveState(state);

  logger.logPlan(`Architecture: ${architecture.components.length} components, stack: ${architecture.stack.framework || architecture.stack.language}`);
  return architecture;
}

/**
 * Decompose the project into an ordered task queue.
 */
export function createTaskPlan(requirements, architecture) {
  logger.logPlan('Creating implementation plan...');

  const target = requirements.target;
  const tasks = [];
  const roles = selectRequiredRoles(requirements);

  // Phase 1: Project setup
  tasks.push(createTask({
    description: `Initialize ${target} project structure`,
    role: 'frontend_engineer',
    depends_on: [],
    inputs: [architecture.stack],
    acceptance: ['Project directory created', 'Base files generated'],
  }));

  // Phase 2: Implement each feature
  for (const feature of requirements.features) {
    const componentType = guessComponentType(feature, target);
    const role = componentType === 'backend' ? 'backend_engineer' : 'frontend_engineer';

    tasks.push(createTask({
      description: `Implement: ${feature.name} — ${feature.description}`,
      role,
      depends_on: [tasks[0].task_id], // Depends on project setup
      inputs: [feature],
      acceptance: [`${feature.name} feature works as described`],
    }));
  }

  // Phase 3: Tests
  tasks.push(createTask({
    description: 'Write and run tests for implemented features',
    role: 'qa_test_engineer',
    depends_on: tasks.slice(1).map(t => t.task_id), // Depends on all feature tasks
    inputs: requirements.features,
    acceptance: ['Tests exist', 'Tests pass'],
  }));

  // Phase 4: Build verification
  tasks.push(createTask({
    description: `Build the ${target} project and verify it compiles`,
    role: 'build_release_engineer',
    depends_on: [tasks[tasks.length - 1].task_id],
    inputs: [architecture.stack],
    acceptance: ['Build succeeds with exit code 0'],
  }));

  // Save tasks to state
  const state = loadState();
  for (const task of tasks) {
    state.tasks.push(task);
  }
  state.implementation_plan = {
    total_tasks: tasks.length,
    roles_needed: roles,
    created: new Date().toISOString(),
  };
  transitionPhase('plan');
  saveState(state);

  logger.logPlan(`Task plan: ${tasks.length} tasks, ${roles.length} roles needed`);
  return tasks;
}

/**
 * Initialize the project workspace — creates actual files and directories.
 */
export function initWorkspace(workspaceDir, architecture) {
  logger.logInit(`Initializing workspace: ${workspaceDir}`);

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Initialize git in workspace
  initRepo(workspaceDir);
  createFeatureBranch('jarvis-init', workspaceDir);

  return true;
}

/**
 * Run verification gates on the project.
 */
export function verify(projectDir, options = {}) {
  logger.logVerify('Running verification gates...');

  const state = loadState();
  if (!state) throw new Error('No project state found');

  const gateResults = runAllGates(state, projectDir, options);

  // Update state with gate results
  for (const [gate, result] of Object.entries(gateResults)) {
    const gateKey = gate.startsWith('g') ? `${gate}_${getGateName(gate)}` : gate;
    if (state.gates[gateKey] !== undefined) {
      state.gates[gateKey] = result.pass ? 'pass' : 'fail';
    }
    state.gate_evidence[gate] = result.evidence;
  }
  saveState(state);

  const passed = Object.values(gateResults).filter(r => r.pass).length;
  const total = Object.values(gateResults).length;
  logger.logVerify(`Gates: ${passed}/${total} passed`);

  return gateResults;
}

/**
 * Generate the final verification report.
 */
export function generateReport(projectDir) {
  const state = loadState();
  if (!state) throw new Error('No project state found');

  const gitStatus = getStatus(projectDir || state.project.workspace_dir || ROOT_DIR);

  const report = {
    project: state.project,
    generated: new Date().toISOString(),
    phase: state.phase,
    requirements_summary: {
      total_features: state.requirements?.features?.length || 0,
      target: state.requirements?.target || 'unknown',
    },
    tasks_summary: {
      total: state.tasks.length,
      done: state.tasks.filter(t => t.status === 'done').length,
      failed: state.tasks.filter(t => t.status === 'failed').length,
      blocked: state.tasks.filter(t => t.status === 'blocked').length,
      pending: state.tasks.filter(t => t.status === 'pending').length,
    },
    gates: state.gates,
    gate_evidence: state.gate_evidence,
    build_results: state.build_results,
    test_results: state.test_results,
    git: {
      ...gitStatus,
      jarvis_branch: gitStatus.branch,
    },
    not_implemented: state.not_implemented,
    known_limitations: state.known_limitations,
    blockers: state.blockers,
    decisions: state.decisions,
    errors: state.errors,
  };

  // Save report
  ensureStateDir();
  const reportPath = join(ROOT_DIR, 'state', 'artifacts', 'verification_report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.logVerify(`Verification report saved: ${reportPath}`);
  return report;
}

// --- Helpers ---

function detectTarget(request) {
  const lower = request.toLowerCase();
  if (lower.includes('android')) return 'android';
  if (lower.includes('web') || lower.includes('website')) return 'web';
  if (lower.includes('api') || lower.includes('backend') || lower.includes('server')) return 'backend';
  if (lower.includes('cli') || lower.includes('command line')) return 'cli';
  return 'web'; // default
}

function extractProjectName(request) {
  // Try to extract a meaningful name
  const lower = request.toLowerCase();
  const patterns = [
    /create (?:a |an )?(?:minimal )?(.+?)(?:\s+app|\s+application|\s+with|\s+that|\s+containing)/i,
    /build (?:a |an )?(.+?)(?:\s+app|\s+application|\s+with|\s+that)/i,
    /(.+?)(?:\s+app|\s+application)/i,
  ];
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match) {
      return match[1].trim().replace(/\s+/g, '-').toLowerCase().slice(0, 30);
    }
  }
  return 'jarvis-project';
}

function extractFeatures(request) {
  const features = [];
  const lower = request.toLowerCase();

  // Parse common feature patterns
  const featurePatterns = [
    { pattern: /(?:home|main)\s*screen/i, name: 'home-screen', description: 'Home/main screen of the application' },
    { pattern: /title/i, name: 'title-display', description: 'Display a title text' },
    { pattern: /button/i, name: 'button-interaction', description: 'Interactive button element' },
    { pattern: /(?:login|sign\s*in)/i, name: 'login', description: 'User login/sign-in functionality' },
    { pattern: /(?:signup|sign\s*up|register)/i, name: 'signup', description: 'User registration functionality' },
    { pattern: /list/i, name: 'list-view', description: 'List display of items' },
    { pattern: /(?:nav|navigation|menu)/i, name: 'navigation', description: 'Navigation menu/bar' },
    { pattern: /(?:search)/i, name: 'search', description: 'Search functionality' },
    { pattern: /(?:settings|preferences)/i, name: 'settings', description: 'Settings/preferences screen' },
  ];

  for (const fp of featurePatterns) {
    if (fp.pattern.test(lower)) {
      features.push({ name: fp.name, description: fp.description, priority: 'must' });
    }
  }

  // If no features detected, create a generic one from the request
  if (features.length === 0) {
    features.push({
      name: 'core-feature',
      description: request,
      priority: 'must',
    });
  }

  return features;
}

function getStackForTarget(target) {
  switch (target) {
    case 'android':
      return { language: 'kotlin', framework: 'android-jetpack-compose', build: 'gradle', test: 'junit' };
    case 'web':
      return { language: 'javascript', framework: 'vanilla', build: 'none', test: 'node-test' };
    case 'backend':
      return { language: 'javascript', framework: 'express', build: 'npm', test: 'node-test' };
    case 'cli':
      return { language: 'javascript', framework: 'node', build: 'none', test: 'node-test' };
    default:
      return { language: 'javascript', framework: 'vanilla', build: 'none', test: 'node-test' };
  }
}

function guessComponentType(feature, target) {
  const name = (feature.name || '').toLowerCase();
  if (name.includes('api') || name.includes('server') || name.includes('database')) return 'backend';
  if (name.includes('screen') || name.includes('page') || name.includes('ui') || name.includes('button')) return 'frontend';
  return target === 'backend' ? 'backend' : 'frontend';
}

function getGateName(gate) {
  const names = { g1: 'requirements', g2: 'build', g3: 'tests', g4: 'runtime', g5: 'feature', g6: 'security', g7: 'release' };
  return names[gate] || gate;
}
