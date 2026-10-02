/**
 * JARVIS Recovery System
 * 
 * Structured error recovery with history tracking.
 * Never repeats a failed fix. Max 3 attempts per error signature.
 */

import { createHash } from 'node:crypto';
import { logRecovery, logError } from './logger.js';
import { loadErrorHistory, recordError, hasFixBeenAttempted, getAttemptCount } from './state-manager.js';

const MAX_ATTEMPTS = 3;

/** Compute error signature from key error indicators */
export function computeSignature(errorType, errorMessage, context = '') {
  const normalized = `${errorType}::${errorMessage.replace(/\d+/g, 'N').replace(/[a-f0-9]{7,}/gi, 'HASH')}::${context}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Classify error type from log output */
export function classifyError(logOutput) {
  const lower = logOutput.toLowerCase();

  if (lower.includes('command not found') || lower.includes('is not recognized'))
    return { type: 'missing_tool', category: 'environment' };
  if (lower.includes('cannot find module') || lower.includes('module not found'))
    return { type: 'missing_dependency', category: 'dependency' };
  if (lower.includes('syntax error') || lower.includes('unexpected token'))
    return { type: 'syntax_error', category: 'code' };
  if (lower.includes('type error') || lower.includes('typeerror'))
    return { type: 'type_error', category: 'code' };
  if (lower.includes('permission denied') || lower.includes('access denied'))
    return { type: 'permission_error', category: 'environment' };
  if (lower.includes('enoent') || lower.includes('no such file'))
    return { type: 'file_not_found', category: 'filesystem' };
  if (lower.includes('build failed') || lower.includes('compilation error') || lower.includes('compile error'))
    return { type: 'build_error', category: 'build' };
  if (lower.includes('test failed') || lower.includes('assertion'))
    return { type: 'test_failure', category: 'test' };
  if (lower.includes('timeout') || lower.includes('timed out'))
    return { type: 'timeout', category: 'environment' };
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch failed'))
    return { type: 'network_error', category: 'environment' };

  return { type: 'unknown', category: 'unknown' };
}

/**
 * Attempt recovery for a failed operation.
 * Returns { canRetry, suggestion, signature, attemptNumber }
 */
export function analyzeFailure(taskId, errorOutput, proposedFix) {
  const classification = classifyError(errorOutput);
  const signature = computeSignature(classification.type, errorOutput.slice(0, 500), taskId);
  const attemptCount = getAttemptCount(signature);

  logRecovery(`Error classified: ${classification.type} (${classification.category}), signature: ${signature}, attempts: ${attemptCount}/${MAX_ATTEMPTS}`);

  // Check if we've exceeded max attempts
  if (attemptCount >= MAX_ATTEMPTS) {
    logError(`Max recovery attempts (${MAX_ATTEMPTS}) reached for signature ${signature}. Marking as blocked.`);
    return {
      canRetry: false,
      reason: `Max ${MAX_ATTEMPTS} distinct recovery attempts exhausted`,
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

/** Get a suggested fix based on error classification */
function getSuggestion(classification) {
  const suggestions = {
    missing_tool: 'Install the required tool or check PATH configuration',
    missing_dependency: 'Run the package installer (npm install, etc.) or check import paths',
    syntax_error: 'Review the code for syntax issues at the reported line',
    type_error: 'Check variable types and function signatures',
    permission_error: 'Check file/directory permissions',
    file_not_found: 'Verify file paths and ensure required files exist',
    build_error: 'Review build configuration and source code for compilation errors',
    test_failure: 'Review failing test assertions and the code under test',
    timeout: 'Check if the command is hanging; consider increasing timeout',
    network_error: 'Check network connectivity and service availability',
    unknown: 'Review the full error log for diagnostic information',
  };
  return suggestions[classification.type] || suggestions.unknown;
}
