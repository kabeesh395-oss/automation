/**
 * JARVIS Schema Validator
 * 
 * Validates state and artifact JSON against structured contracts.
 * Lightweight — uses structured schema checks.
 */

function validateRequired(obj, requiredFields, context = '') {
  const errors = [];
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`${context}Missing required field: ${field}`);
    }
  }
  return errors;
}

export const STATE_PHASES = [
  'INIT',
  'ANALYSIS',
  'ARCHITECTURE',
  'UX_PLAN',
  'IMPLEMENTATION_PLAN',
  'EXECUTION',
  'BUILD',
  'TEST',
  'RECOVERY',
  'VERIFY',
  'RELEASE',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
  // legacy compatibility
  'init', 'analysis', 'design', 'plan', 'build', 'test', 'verify', 'security', 'review', 'release', 'done', 'blocked'
];

/** Validate project state */
export function validateProjectState(state) {
  const errors = [];
  const topLevel = ['schema_version', 'project', 'phase', 'tasks', 'gates', 'updated'];
  errors.push(...validateRequired(state, topLevel, 'state.'));

  if (state.project) {
    errors.push(...validateRequired(state.project, ['id', 'user_request', 'created'], 'state.project.'));
  }

  if (state.tasks && Array.isArray(state.tasks)) {
    for (let i = 0; i < state.tasks.length; i++) {
      const task = state.tasks[i];
      const idField = task.id ? 'id' : 'task_id';
      errors.push(...validateRequired(task, [idField, 'description', 'status'], `state.tasks[${i}].`));
    }
  }

  if (state.phase && !STATE_PHASES.includes(state.phase)) {
    errors.push(`state.phase: invalid value "${state.phase}". Must be one of: ${STATE_PHASES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a task object */
export function validateTask(task) {
  const errors = [];
  const idField = task.id ? 'id' : 'task_id';
  errors.push(...validateRequired(task, [idField, 'description', 'status'], 'task.'));

  const validStatuses = ['pending', 'ready', 'running', 'done', 'failed', 'blocked', 'not_implemented'];
  if (task.status && !validStatuses.includes(task.status)) {
    errors.push(`task.status: invalid value "${task.status}". Must be one of: ${validStatuses.join(', ')}`);
  }

  if (task.dependencies && !Array.isArray(task.dependencies) && task.depends_on && !Array.isArray(task.depends_on)) {
    errors.push('task dependencies must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate requirements contract */
export function validateRequirements(req) {
  const errors = [];
  errors.push(...validateRequired(req, ['core_features'], 'requirements.'));

  const features = req.core_features || req.features;
  if (!features || !Array.isArray(features)) {
    errors.push('requirements.core_features must be an array');
  } else if (features.length === 0) {
    errors.push('requirements.core_features must not be empty');
  } else {
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (typeof f === 'object') {
        errors.push(...validateRequired(f, ['name', 'description'], `requirements.features[${i}].`));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate architecture contract */
export function validateArchitecture(arch) {
  const errors = [];
  errors.push(...validateRequired(arch, ['platform', 'language', 'framework', 'modules', 'build_configuration'], 'architecture.'));

  if (arch.modules && !Array.isArray(arch.modules)) {
    errors.push('architecture.modules must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate UX plan contract */
export function validateUxPlan(ux) {
  const errors = [];
  errors.push(...validateRequired(ux, ['navigation_structure', 'screens', 'user_flows'], 'ux_plan.'));

  if (ux.screens && !Array.isArray(ux.screens)) {
    errors.push('ux_plan.screens must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate implementation plan */
export function validateImplementationPlan(plan) {
  const errors = [];
  errors.push(...validateRequired(plan, ['total_tasks', 'tasks'], 'implementation_plan.'));

  if (plan.tasks && !Array.isArray(plan.tasks)) {
    errors.push('implementation_plan.tasks must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate task queue */
export function validateTaskQueue(queue) {
  const errors = [];
  errors.push(...validateRequired(queue, ['project_id', 'tasks'], 'task_queue.'));

  if (queue.tasks && !Array.isArray(queue.tasks)) {
    errors.push('task_queue.tasks must be an array');
  } else if (queue.tasks) {
    for (let i = 0; i < queue.tasks.length; i++) {
      errors.push(...validateTask(queue.tasks[i]).errors.map(e => `task_queue[${i}].${e}`));
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate gate evidence */
export function validateGateEvidence(evidence) {
  const errors = [];
  errors.push(...validateRequired(evidence, ['gate', 'checks'], 'evidence.'));

  if (evidence.checks && !Array.isArray(evidence.checks)) {
    errors.push('evidence.checks must be an array');
  } else if (evidence.checks) {
    for (let i = 0; i < evidence.checks.length; i++) {
      errors.push(...validateRequired(evidence.checks[i], ['check', 'pass'], `evidence.checks[${i}].`));
    }
  }

  return { valid: errors.length === 0, errors };
}
