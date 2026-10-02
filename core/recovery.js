/**
 * JARVIS Real AI Recovery Engine (Phase 4)
 * 
 * Implements bounded error diagnosis, novelty tracking, and AI-driven code repair:
 * 1. Error classification & stable SHA-256 signature hashing
 * 2. Novelty verification against error_history.json
 * 3. AI Debugger code patch generation
 * 4. Safe File Patch Protocol application
 * 5. Bounded retries (Max 3 novel attempts before BLOCKED)
 */

import { createHash } from 'node:crypto';
import { logRecovery, logError } from './logger.js';
import { recordError, hasFixBeenAttempted, getAttemptCount } from './state-manager.js';
import { getAIProvider } from './ai/provider.js';
import { buildDebugRecoveryPrompt } from './ai/prompt-builder.js';
import { applyFileChanges } from './file-patcher.js';

export const MAX_ATTEMPTS = 3;

/** Compute stable error signature */
export function computeSignature(errorType, errorMessage, context = '') {
  const normalized = `${errorType}::${errorMessage.replace(/\d+/g, 'N').replace(/[a-f0-9]{7,}/gi, 'HASH').trim()}::${context}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Classify error type from log output */
export function classifyError(logOutput) {
  const lower = (logOutput || '').toLowerCase();

  if (
    lower.includes('command not found') ||
    lower.includes('is not recognized') ||
    lower.includes('is not set') ||
    lower.includes('no java command') ||
    lower.includes('sdk location not found') ||
    lower.includes('sdk not found') ||
    lower.includes('android_home')
  ) {
    return { type: 'missing_tool', category: 'environment' };
  }

  if (lower.includes('cannot find module') || lower.includes('module not found') || lower.includes('unresolved reference')) {
    return { type: 'missing_dependency', category: 'dependency' };
  }

  if (lower.includes('out of memory') || lower.includes('heap') || lower.includes('outofmemoryerror')) {
    return { type: 'build_error', category: 'memory' };
  }

  if (lower.includes('syntax error') || lower.includes('unexpected token')) {
    return { type: 'syntax_error', category: 'code' };
  }

  if (lower.includes('type error') || lower.includes('typeerror') || lower.includes('type mismatch')) {
    return { type: 'type_error', category: 'code' };
  }

  if (lower.includes('permission denied') || lower.includes('access denied')) {
    return { type: 'permission_error', category: 'environment' };
  }

  if (lower.includes('enoent') || lower.includes('no such file')) {
    return { type: 'file_not_found', category: 'filesystem' };
  }

  if (lower.includes('build failed') || lower.includes('compilation error') || lower.includes('compile error') || lower.includes('fatal error') || lower.includes('failure: build')) {
    return { type: 'build_error', category: 'build' };
  }

  if (lower.includes('test failed') || lower.includes('assertion') || lower.includes('comparisonfailure')) {
    return { type: 'test_failure', category: 'test' };
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { type: 'timeout', category: 'environment' };
  }

  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return { type: 'network_error', category: 'environment' };
  }

  return { type: 'unknown', category: 'unknown' };
}

/**
 * Attempt recovery for a failed operation.
 * Returns { canRetry, suggestion, signature, attemptNumber, duplicateFix, reason }
 */
export function analyzeFailure(taskId, errorOutput, proposedFix = null) {
  const classification = classifyError(errorOutput);
  const signature = computeSignature(classification.type, (errorOutput || '').slice(0, 500), taskId);
  const attemptCount = getAttemptCount(signature);

  logRecovery(`Error classified: ${classification.type} (${classification.category}), signature: ${signature}, attempts: ${attemptCount}/${MAX_ATTEMPTS}`);

  // Check if we've exceeded max attempts
  if (attemptCount >= MAX_ATTEMPTS) {
    logError(`Max recovery attempts (${MAX_ATTEMPTS}) reached for signature ${signature}. Marking as BLOCKED.`);
    return {
      canRetry: false,
      reason: `Max ${MAX_ATTEMPTS} distinct recovery attempts exhausted for signature ${signature}`,
      signature,
      classification,
      attemptNumber: attemptCount,
    };
  }

  // Check if this specific fix was already tried
  if (proposedFix && hasFixBeenAttempted(signature, proposedFix)) {
    logRecovery(`Fix already attempted for ${signature}: "${proposedFix}". Need a different approach.`);
    return {
      canRetry: true,
      reason: 'This fix was already attempted — try a different approach',
      signature,
      classification,
      attemptNumber: attemptCount,
      duplicateFix: true,
    };
  }

  return {
    canRetry: true,
    signature,
    classification,
    attemptNumber: attemptCount + 1,
    suggestion: getSuggestion(classification),
  };
}

/**
 * Executes AI Debugger to generate and apply an automated code patch.
 */
export async function attemptAIDebugRepair(errorContext, workspaceDir, options = {}) {
  const provider = options.aiProvider || getAIProvider(options);
  const { systemPrompt, userPrompt } = buildDebugRecoveryPrompt(errorContext);

  try {
    const patchResult = await provider.generateStructured({
      systemPrompt,
      userPrompt,
      context: { stage: 'recovery', errorContext }
    });

    if (patchResult && Array.isArray(patchResult.changes) && patchResult.changes.length > 0) {
      const applyResult = applyFileChanges(patchResult, workspaceDir);
      return {
        success: applyResult.success,
        rootCause: patchResult.root_cause,
        fixSummary: patchResult.fix_summary || 'AI patch applied',
        appliedChanges: applyResult.auditLog.applied
      };
    }

    return {
      success: false,
      reason: 'AI Debugger returned no valid changes array'
    };
  } catch (err) {
    logError(`AI Debugger patch generation failed: ${err.message}`);
    return {
      success: false,
      reason: err.message
    };
  }
}

/** Record the outcome of a recovery attempt */
export function recordRecoveryAttempt(taskId, signature, logExcerpt, rootCause, fix, success) {
  recordError({
    task_id: taskId,
    signature,
    log_excerpt: logExcerpt,
    root_cause: rootCause,
    attempted_fix: fix,
    result: success ? 'success' : 'failed',
  });
  logRecovery(`Recovery ${success ? 'succeeded' : 'failed'} for ${signature}: ${fix}`);
}

function getSuggestion(classification) {
  const suggestions = {
    missing_tool: 'Configure the required SDK/tool location or check PATH environment variables',
    missing_dependency: 'Add missing package dependency or import statement',
    syntax_error: 'Correct syntax error at reported line',
    type_error: 'Update type definitions and variable declarations',
    permission_error: 'Ensure write access to project directories',
    file_not_found: 'Verify and generate missing target files',
    build_error: 'Review build configuration, JVM args, and source code compilation',
    test_failure: 'Align component logic with test assertions',
    timeout: 'Optimize long-running tasks or increase command timeout',
    network_error: 'Check connectivity or switch to offline cache mode',
    unknown: 'Inspect full error trace and apply minimal targeted fix',
  };
  return suggestions[classification.type] || suggestions.unknown;
}
