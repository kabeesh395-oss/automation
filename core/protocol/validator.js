/**
 * JARVIS Schema Validator
 * 
 * Validates state and artifact JSON against schemas.
 * Lightweight — no external dependencies, uses structural checks.
 */

/** Validate that an object has all required fields */
function validateRequired(obj, requiredFields, context = '') {
  const errors = [];
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`${context}Missing required field: ${field}`);
    }
  }
  return errors;
}

/** Validate project state schema */
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
      errors.push(...validateRequired(task, ['task_id', 'description', 'role', 'status'], `state.tasks[${i}].`));
    }
  }

  const validPhases = ['init', 'analysis', 'design', 'plan', 'build', 'test', 'debug', 'security', 'review', 'release', 'done', 'blocked'];
  if (state.phase && !validPhases.includes(state.phase)) {
    errors.push(`state.phase: invalid value "${state.phase}". Must be one of: ${validPhases.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/** Validate a task object */
export function validateTask(task) {
  const errors = [];

  errors.push(...validateRequired(task, ['task_id', 'description', 'role', 'status'], 'task.'));

  const validStatuses = ['pending', 'running', 'done', 'failed', 'blocked', 'not_implemented'];
  if (task.status && !validStatuses.includes(task.status)) {
    errors.push(`task.status: invalid value "${task.status}". Must be one of: ${validStatuses.join(', ')}`);
  }

  if (task.depends_on && !Array.isArray(task.depends_on)) {
    errors.push('task.depends_on must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate requirements object */
export function validateRequirements(requirements) {
  const errors = [];

  errors.push(...validateRequired(requirements, ['target', 'features'], 'requirements.'));

  if (requirements.features && !Array.isArray(requirements.features)) {
    errors.push('requirements.features must be an array');
  }

  if (requirements.features) {
    for (let i = 0; i < requirements.features.length; i++) {
      const f = requirements.features[i];
      if (typeof f === 'object') {
        errors.push(...validateRequired(f, ['name'], `requirements.features[${i}].`));
      }
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
  }

  if (evidence.checks) {
    for (let i = 0; i < evidence.checks.length; i++) {
      errors.push(...validateRequired(evidence.checks[i], ['check', 'pass'], `evidence.checks[${i}].`));
    }
  }

  return { valid: errors.length === 0, errors };
}

// CLI mode: validate a JSON file
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const file = process.argv[2];
  if (!file) {
    console.log('Usage: node validator.js <file.json> [--type state|task|requirements]');
    process.exit(1);
  }

  const { readFileSync } = await import('node:fs');
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const type = process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : 'state';

  const validators = { state: validateProjectState, task: validateTask, requirements: validateRequirements };
  const validator = validators[type] || validateProjectState;
  const result = validator(data);

  if (result.valid) {
    console.log(`✓ ${file} is valid (${type})`);
  } else {
    console.log(`✗ ${file} validation failed:`);
    result.errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
}
