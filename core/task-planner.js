/**
 * JARVIS Dynamic Task Planner Stage (Phase 4 AI-Driven)
 * 
 * Synthesizes Requirements, Architecture, and UX Plan into a dynamic,
 * dependency-aware task graph tailored to the application's unique domain.
 */

import { validateImplementationPlan, validateTaskQueue } from './protocol/validator.js';
import { getAIProvider } from './ai/provider.js';
import { buildTaskPlannerPrompt } from './ai/prompt-builder.js';
import * as logger from './logger.js';

export async function planTasks(requirements, architecture, uxPlan, projectId = 'PRJ-PHASE4', options = {}) {
  logger.logPlan(`[Task Planner] Dynamically generating task graph for project ${projectId}`);

  const provider = options.aiProvider || getAIProvider(options);
  const { systemPrompt, userPrompt } = buildTaskPlannerPrompt(requirements, architecture, uxPlan);

  const rawPlan = await provider.generateStructured({
    systemPrompt,
    userPrompt,
    context: { stage: 'task_planner', requirements, architecture, uxPlan }
  });

  const rawTasks = Array.isArray(rawPlan.tasks) ? rawPlan.tasks : [];

  if (rawTasks.length === 0) {
    throw new Error('Task planner model returned zero tasks');
  }

  // Normalize tasks
  const normalizedTasks = rawTasks.map((t, idx) => {
    const taskId = t.id || `T${String(idx + 1).padStart(3, '0')}_${(t.type || 'TASK').toUpperCase()}`;
    const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const status = deps.length === 0 ? 'ready' : 'pending';

    return {
      id: taskId,
      type: t.type || 'feature',
      description: t.description || `Implement task ${taskId}`,
      dependencies: deps,
      status,
      attempts: 0,
      owner: t.owner || (architecture.platform === 'android' ? 'android_engineer' : 'frontend_engineer'),
      inputs: [
        { key: 'requirements', data: { app_name: requirements.app_name } },
        { key: 'architecture', data: { platform: architecture.platform } }
      ],
      outputs: {},
      affected_files: Array.isArray(t.affected_files) ? t.affected_files : [],
      verification: {
        criteria: Array.isArray(t.verification?.criteria) ? t.verification.criteria : ['Task compiles and verifies'],
        status: 'pending',
        evidence: null
      },
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null
    };
  });

  const implementationPlan = {
    total_tasks: normalizedTasks.length,
    roles_needed: [...new Set(normalizedTasks.map(t => t.owner))],
    phases: [
      { phase_name: 'Scaffold & Foundation', task_ids: normalizedTasks.filter(t => t.dependencies.length === 0).map(t => t.id) },
      { phase_name: 'Core Features & Logic', task_ids: normalizedTasks.filter(t => t.dependencies.length > 0 && t.type !== 'build' && t.type !== 'verification').map(t => t.id) },
      { phase_name: 'Verification & Release', task_ids: normalizedTasks.filter(t => t.type === 'build' || t.type === 'verification' || t.type === 'testing').map(t => t.id) }
    ],
    tasks: normalizedTasks.map(t => ({
      task_id: t.id,
      type: t.type,
      description: t.description,
      role: t.owner,
      dependencies: t.dependencies,
      affected_files: t.affected_files,
      verification_criteria: t.verification.criteria
    })),
    created_at: new Date().toISOString()
  };

  const taskQueue = {
    project_id: projectId,
    tasks: normalizedTasks,
    updated_at: new Date().toISOString()
  };

  // Validate plans
  const planVal = validateImplementationPlan(implementationPlan);
  if (!planVal.valid) logger.logError(`Implementation plan validation errors: ${planVal.errors.join('; ')}`);

  const queueVal = validateTaskQueue(taskQueue);
  if (!queueVal.valid) logger.logError(`Task queue validation errors: ${queueVal.errors.join('; ')}`);

  return { implementationPlan, taskQueue };
}
