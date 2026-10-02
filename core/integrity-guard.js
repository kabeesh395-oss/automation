/**
 * JARVIS Autonomy Architecture Integrity Guard
 * 
 * Enforces strict anti-cheating and anti-leakage rules on JARVIS's core autonomous
 * repair engine and adapters. Ensures that no project-specific strings, paths,
 * defect signatures, or pre-canned repair templates are embedded in generic logic.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export class IntegrityViolationError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.name = 'IntegrityViolationError';
    this.violations = violations;
  }
}

/**
 * Forbidden tokens that indicate leakage of acceptance-test defect templates
 * or project-specific hardcoding into generic repair code.
 */
const FORBIDDEN_TOKENS = [
  { pattern: /statusView\.setText/, label: 'Android statusView hardcoded repair' },
  { pattern: /State Changed: Action Completed Successfully/, label: 'Test Android hardcoded state string' },
  { pattern: /UI Crash:\s*runtime exception on boot/, label: 'Test Web hardcoded crash string' },
  { pattern: /console\.log\("App loaded cleanly"\)/, label: 'Test Web hardcoded restore string' },
  { pattern: /Internal Error/, label: 'Test Backend hardcoded error string' },
  { pattern: /test_android/, label: 'test_android project path' },
  { pattern: /test_web/, label: 'test_web project path' },
  { pattern: /test_backend/, label: 'test_backend project path' },
  { pattern: /Career\s*Hub|CareerHub/i, label: 'Career Hub reference' },
  { pattern: /StudyMate/i, label: 'StudyMate reference' }
];

/**
 * Validates that the specified file contains no leaked defect templates or forbidden references.
 */
export function verifyRepairEngineIntegrity(targetFilePath) {
  const fullPath = resolve(targetFilePath);
  if (!existsSync(fullPath)) {
    throw new IntegrityViolationError(`Integrity guard target file does not exist: ${fullPath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  const violations = [];

  for (const { pattern, label } of FORBIDDEN_TOKENS) {
    if (pattern.test(content)) {
      violations.push({ label, pattern: pattern.toString() });
    }
  }

  if (violations.length > 0) {
    const errorDetails = violations.map(v => `- ${v.label} (matches ${v.pattern})`).join('\n');
    throw new IntegrityViolationError(
      `INTEGRITY AUDIT FAILED: Forbidden test-specific or project-specific tokens detected in ${targetFilePath}:\n${errorDetails}`,
      violations
    );
  }

  return { ok: true, file: fullPath, violations: [] };
}
