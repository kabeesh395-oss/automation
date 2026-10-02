/**
 * JARVIS Fake-Functionality Detector (Phase 5)
 * 
 * Generic detector for suspicious implementation patterns indicating hardcoded
 * or mocked functionality rather than real implementation.
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VERDICT } from './evidence-engine.js';

export const FAKE_VERDICT = {
  REAL: 'REAL',
  SUSPICIOUS: 'SUSPICIOUS',
  MOCK: 'MOCK',
  UNVERIFIED: 'UNVERIFIED'
};

const SUSPICIOUS_PATTERNS = [
  // Hardcoded success/data
  { regex: /return\s+\[\s*\{\s*id['"]?\s*:\s*['"]?[1-9]/i, reason: 'Hardcoded list response' },
  { regex: /return\s+true\s*;\s*\/\/\s*mock/i, reason: 'Explicit mock return' },
  { regex: /Thread\.sleep\(\d+\)/, reason: 'Simulated delay (Thread.sleep)' },
  { regex: /setTimeout\(/, reason: 'Simulated delay (setTimeout)' },
  { regex: /Promise\.resolve\(\{.*\}\)/i, reason: 'Hardcoded Promise resolution' },
  { regex: /["']Success["']/i, reason: 'Hardcoded success string' },
  { regex: /TODO:\s*implement/i, reason: 'Unimplemented TODO' },
  { regex: /class\s+\w*Mock\w*\s+implements/i, reason: 'Mock class implementation' }
];

export class FakeDetector {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Scans a file or directory for fake/mock patterns.
   */
  scan(targetPath) {
    let findings = [];
    
    const stat = statSync(targetPath);
    if (stat.isDirectory()) {
      const files = this._getAllFiles(targetPath);
      for (const file of files) {
        if (!file.includes('test') && !file.includes('spec') && !file.includes('__mocks__')) {
            findings = findings.concat(this._scanFile(file));
        }
      }
    } else {
      findings = this._scanFile(targetPath);
    }

    const classification = this._classify(findings);

    return {
      verdict: classification,
      findings
    };
  }

  _scanFile(filePath) {
    const findings = [];
    try {
      const content = readFileSync(filePath, 'utf-8');
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.regex.test(content)) {
          findings.push({
            file: filePath,
            pattern: pattern.regex.toString(),
            reason: pattern.reason
          });
        }
      }
    } catch (e) {
      // Ignore read errors
    }
    return findings;
  }

  _getAllFiles(dir) {
    let results = [];
    const list = readdirSync(dir, { withFileTypes: true });
    for (const file of list) {
      if (file.name === 'node_modules' || file.name === 'build' || file.name === 'dist' || file.name === '.git') continue;
      const fullPath = join(dir, file.name);
      if (file.isDirectory()) {
        results = results.concat(this._getAllFiles(fullPath));
      } else {
        if (/\.(js|ts|jsx|tsx|java|kt|py|go|cs)$/.test(file.name)) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  _classify(findings) {
    if (findings.length === 0) return FAKE_VERDICT.REAL;
    
    const mockKeywords = findings.filter(f => f.reason.toLowerCase().includes('mock'));
    if (mockKeywords.length > 0) return FAKE_VERDICT.MOCK;

    return FAKE_VERDICT.SUSPICIOUS;
  }
}
