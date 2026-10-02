/**
 * JARVIS Activity Logger
 * 
 * Appends structured entries to activity.log (human) and activity.jsonl (machine).
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(import.meta.dirname, '..', 'state');
const LOG_FILE = join(STATE_DIR, 'activity.log');
const JSONL_FILE = join(STATE_DIR, 'activity.jsonl');

const TAGS = {
  plan: 'PLAN',
  init: 'INIT',
  build: 'BUILD',
  code: 'CODE',
  test: 'TEST',
  verify: 'VERIFY',
  git: 'GIT',
  error: 'ERROR',
  recovery: 'RECOVERY',
  gate: 'GATE',
  security: 'SECURITY',
  state: 'STATE',
  info: 'INFO',
};

function ensureLogDir() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Log an activity.
 * @param {string} tag - One of TAGS keys
 * @param {string} message - Human-readable message
 * @param {object} [details] - Optional structured details
 */
export function log(tag, message, details = {}) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const tagStr = (TAGS[tag] || tag).toUpperCase().padEnd(10);

  // Human-readable log
  const humanLine = `[${timestamp}] [${tagStr}] ${message}\n`;
  appendFileSync(LOG_FILE, humanLine, 'utf-8');

  // Machine-readable JSONL
  const jsonEntry = {
    timestamp,
    tag: tag.toLowerCase(),
    message,
    ...details,
  };
  appendFileSync(JSONL_FILE, JSON.stringify(jsonEntry) + '\n', 'utf-8');

  // Also print to console
  console.log(`[${tagStr.trim()}] ${message}`);
}

export function logPlan(msg, details) { log('plan', msg, details); }
export function logInit(msg, details) { log('init', msg, details); }
export function logBuild(msg, details) { log('build', msg, details); }
export function logCode(msg, details) { log('code', msg, details); }
export function logTest(msg, details) { log('test', msg, details); }
export function logVerify(msg, details) { log('verify', msg, details); }
export function logGit(msg, details) { log('git', msg, details); }
export function logError(msg, details) { log('error', msg, details); }
export function logRecovery(msg, details) { log('recovery', msg, details); }
export function logGate(msg, details) { log('gate', msg, details); }
export function logSecurity(msg, details) { log('security', msg, details); }
export function logPhase(phase, msg, details) { log('plan', `[Phase: ${phase}] ${msg}`, details); }
export function logTask(msg, details) { log('code', msg, details); }

