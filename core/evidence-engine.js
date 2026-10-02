/**
 * JARVIS Evidence Engine & Generic Observation Model (Phase 5)
 * 
 * Enforces structured, objective runtime evidence collection across all platforms.
 * Rejects unsupported PASS claims.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const VERDICT = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  MOCK: 'MOCK'
};

export class EvidenceEngine {
  constructor(workspaceDir, stateDir) {
    this.workspaceDir = workspaceDir;
    this.stateDir = stateDir;
    this.evidenceLog = [];
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
  }

  /**
   * Generates a structured observation object.
   */
  createObservation({ project, target, command, args, exitCode, stdout, stderr, screenshotPath, uiState, networkResult, runtimeResult, testResult }) {
    return {
      timestamp: new Date().toISOString(),
      project,
      target,
      command,
      arguments: args,
      exitCode,
      stdout,
      stderr,
      screenshotPath,
      uiState,
      networkResult,
      runtimeResult,
      testResult
    };
  }

  /**
   * Evaluates an observation and returns a verified verdict.
   * A PASS is valid ONLY when supported by execution evidence.
   */
  evaluate(observation, criteria) {
    let verdict = VERDICT.FAIL;
    let reason = 'Insufficient evidence';

    // Must have at least one form of runtime evidence
    const hasCommandEvidence = observation.exitCode !== undefined && observation.stdout !== undefined;
    const hasUIEvidence = observation.uiState !== undefined;
    const hasNetworkEvidence = observation.networkResult !== undefined;

    if (!hasCommandEvidence && !hasUIEvidence && !hasNetworkEvidence) {
      reason = 'No runtime execution evidence provided';
      return this._record(observation, VERDICT.BLOCKED, reason);
    }

    if (criteria.type === 'command') {
      if (observation.exitCode === 0) {
        verdict = VERDICT.PASS;
        reason = 'Command executed successfully';
      } else {
        verdict = VERDICT.FAIL;
        reason = `Command failed with exit code ${observation.exitCode}`;
      }
    } else if (criteria.type === 'ui_interaction') {
      if (observation.uiState && observation.uiState.includes(criteria.expectedText)) {
        verdict = VERDICT.PASS;
        reason = `UI state contains expected text: ${criteria.expectedText}`;
      } else {
        verdict = VERDICT.FAIL;
        reason = `UI state missing expected text: ${criteria.expectedText}`;
      }
    } else if (criteria.type === 'network') {
       if (observation.networkResult && observation.networkResult.status === criteria.expectedStatus) {
         verdict = VERDICT.PASS;
         reason = `Network returned expected status ${criteria.expectedStatus}`;
       } else {
         verdict = VERDICT.FAIL;
         reason = `Network request failed or returned unexpected status`;
       }
    }

    return this._record(observation, verdict, reason);
  }

  _record(observation, verdict, reason) {
    const record = {
      ...observation,
      verdict,
      reason
    };
    this.evidenceLog.push(record);
    this._persist();
    return record;
  }

  _persist() {
    const logPath = join(this.stateDir, 'evidence.jsonl');
    const lines = this.evidenceLog.map(r => JSON.stringify(r)).join('\n');
    writeFileSync(logPath, lines, 'utf-8');
  }

  getLogs() {
    return this.evidenceLog;
  }
}
