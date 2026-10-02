/**
 * JARVIS Generic AI Task Execution Engine (Phase 4)
 * 
 * Implements a generic AI coding workflow:
 * 1. Task-scoped context loading
 * 2. Model-driven code synthesis
 * 3. Safe File Patch Protocol application
 * 4. Task-level verification and state persistence
 * 
 * Completely free of hardcoded application templates, package names, or PoC logic.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveState } from './state-manager.js';
import { getAIProvider } from './ai/provider.js';
import { buildCodeGenerationPrompt } from './ai/prompt-builder.js';
import { applyFileChanges } from './file-patcher.js';
import { createCheckpoint, rollbackToCheckpoint, getDiffSummary } from './git-ops.js';
import { FakeDetector } from './fake-detector.js';
import * as logger from './logger.js';

export async function executeTask(task, workspaceDir, state, options = {}) {
  const taskId = task.id || task.task_id;
  logger.logTask(`Executing task [${taskId}]: "${task.description}" (Role: ${task.owner || task.role})`);

  task.status = 'running';
  task.started_at = new Date().toISOString();
  task.attempts = (task.attempts || 0) + 1;

  if (state && Array.isArray(state.tasks)) {
    const idx = state.tasks.findIndex(t => (t.id || t.task_id) === taskId);
    if (idx !== -1) state.tasks[idx] = task;
    saveState(state);
  }

  try {
    const requirements = state?.requirements || { app_name: 'app', core_features: [] };
    const architecture = state?.architecture || { platform: 'android', language: 'kotlin', framework: 'compose', build_configuration: { tool: 'gradle' } };
    const uxPlan = state?.ux_plan || { screens: [] };

    // If task is purely build or verification meta-task
    if (task.type === 'build' || task.type === 'verification') {
      logger.logTask(`Task [${taskId}] is a lifecycle stage (${task.type}) — marked ready for gate execution.`);
    } else {
      // AI-Driven Code Synthesis
      const provider = options.aiProvider || getAIProvider(options);

      // Load existing context for affected files
      const existingContext = loadRelevantFileContext(task.affected_files || [], workspaceDir);

      const { systemPrompt, userPrompt } = buildCodeGenerationPrompt(
        task,
        requirements,
        architecture,
        uxPlan,
        existingContext
      );

      const patchResult = await provider.generateStructured({
        systemPrompt,
        userPrompt,
        context: { stage: 'executor', task }
      });

      if (!patchResult || !Array.isArray(patchResult.changes)) {
        throw new Error(`AI model did not return a valid 'changes' array for task [${taskId}]`);
      }

      // Create git checkpoint BEFORE applying changes
      const checkpointHash = createCheckpoint(`Pre-task ${taskId}`, workspaceDir);

      // Apply changes via Safe File Patch Protocol
      const applyResult = applyFileChanges(patchResult, workspaceDir);

      if (!applyResult.success) {
        if (checkpointHash) rollbackToCheckpoint(checkpointHash, workspaceDir);
        const errMsgs = applyResult.auditLog.errors.map(e => `${e.path}: ${e.error}`).join('; ');
        throw new Error(`Failed to apply safe file patches: ${errMsgs}`);
      }

      // Check for fake functionality
      const detector = new FakeDetector(workspaceDir);
      for (const appliedFile of applyResult.auditLog.applied) {
        const fullPath = join(workspaceDir, appliedFile.path);
        const fakeResult = detector.scan(fullPath);
        if (fakeResult.verdict === 'MOCK' || fakeResult.verdict === 'SUSPICIOUS') {
           logger.logError(`Fake functionality detected in ${appliedFile.path}: ${fakeResult.findings.map(f => f.reason).join(', ')}`);
           // Reject fake implementation, rollback, and fail task
           if (checkpointHash) rollbackToCheckpoint(checkpointHash, workspaceDir);
           throw new Error(`AI generated fake or mock implementation: ${fakeResult.findings.map(f => f.reason).join(', ')}`);
        }
      }

      task.outputs = {
        applied_files: applyResult.auditLog.applied.map(a => a.path),
        summary: patchResult.summary || 'Files created/modified successfully',
        diff_summary: getDiffSummary(workspaceDir)
      };
    }

    task.status = 'done';
    task.completed_at = new Date().toISOString();
    task.verification = {
      status: 'pass',
      criteria: task.verification?.criteria || ['Execution completed cleanly'],
      evidence: task.outputs?.summary || 'Task completed and verified'
    };
    task.error = null;

    logger.logTask(`Task [${taskId}] SUCCEEDED.`);
    return { success: true, task };
  } catch (err) {
    logger.logError(`Task [${taskId}] FAILED: ${err.message}`);
    task.status = 'failed';
    task.error = err.message;
    task.verification = {
      status: 'fail',
      criteria: task.verification?.criteria || [],
      evidence: err.message
    };
    return { success: false, task, error: err };
  }
}

function loadRelevantFileContext(affectedFiles, workspaceDir) {
  const excerpts = [];

  for (const relPath of affectedFiles.slice(0, 5)) {
    const fullPath = join(workspaceDir, relPath);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        excerpts.push(`--- FILE: ${relPath} ---\n${content.slice(0, 2000)}\n`);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return excerpts.join('\n');
}
