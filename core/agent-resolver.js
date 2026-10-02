/**
 * JARVIS Agent Resolver
 * 
 * Reads agent role definitions from .agents/agents/*.md
 * and maps task types to the appropriate agent roles.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logInfo } from './logger.js';

const AGENTS_DIR = join(import.meta.dirname, '..', '.agents', 'agents');

/** Parse a simple markdown agent file into structured data */
function parseAgentFile(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const agent = {
    file: filepath,
    name: '',
    purpose: '',
    model_tier: '',
    runs_when: '',
    forbidden: [],
  };

  let currentSection = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      agent.name = trimmed.slice(2).trim();
    } else if (trimmed.startsWith('## ')) {
      currentSection = trimmed.slice(3).trim().toLowerCase();
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = trimmed.slice(2).trim();
      if (currentSection.includes('forbidden')) {
        agent.forbidden.push(item);
      }
    } else if (currentSection === 'purpose' && trimmed) {
      agent.purpose = trimmed;
    } else if (currentSection.includes('model tier') && trimmed) {
      agent.model_tier = trimmed;
    } else if (currentSection.includes('runs when') && trimmed) {
      agent.runs_when = trimmed;
    }
  }
  return agent;
}

/** Load all agent definitions */
export function loadAgents() {
  try {
    const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
    return files.map(f => parseAgentFile(join(AGENTS_DIR, f)));
  } catch {
    return [];
  }
}

/** Role name normalization */
const ROLE_ALIASES = {
  'product_analyst': ['product-analyst', 'product analyst'],
  'ux_ui_architect': ['ux-ui-architect', 'ux/ui architect', 'ux architect', 'ui architect'],
  'software_architect': ['software-architect', 'software architect', 'architect'],
  'frontend_engineer': ['frontend-engineer', 'frontend engineer', 'frontend/android engineer', 'android engineer'],
  'backend_engineer': ['backend-engineer', 'backend engineer'],
  'ai_gemini_engineer': ['ai-gemini-engineer', 'ai/gemini engineer', 'ai engineer', 'gemini engineer'],
  'database_engineer': ['database-engineer', 'database engineer', 'db engineer'],
  'security_engineer': ['security-engineer', 'security engineer'],
  'qa_test_engineer': ['qa-test-engineer', 'qa/test engineer', 'qa engineer', 'test engineer'],
  'build_release_engineer': ['build-release-engineer', 'build/release engineer', 'build engineer', 'release engineer'],
  'code_reviewer': ['code-reviewer', 'code reviewer', 'reviewer'],
  'master_orchestrator': ['master-orchestrator', 'master orchestrator', 'orchestrator'],
};

/** Normalize a role string to a canonical role key */
export function normalizeRole(roleStr) {
  const lower = roleStr.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(ROLE_ALIASES)) {
    if (canonical === lower || aliases.includes(lower)) {
      return canonical;
    }
  }
  return lower.replace(/[\s/]+/g, '_');
}

/**
 * Determine which agent roles are needed for a given project.
 * @param {object} requirements - Project requirements
 * @returns {string[]} - List of canonical role keys
 */
export function selectRequiredRoles(requirements) {
  const roles = new Set(['product_analyst', 'software_architect']);

  const req = requirements || {};
  const target = req.target || 'web';
  const features = req.features || [];
  const featureStr = JSON.stringify(features).toLowerCase();

  // Always need at least one engineer
  if (target === 'android' || target === 'mobile') {
    roles.add('frontend_engineer');
  } else if (target === 'web') {
    roles.add('frontend_engineer');
  } else if (target === 'backend' || target === 'api') {
    roles.add('backend_engineer');
  } else {
    // Full-stack
    roles.add('frontend_engineer');
    roles.add('backend_engineer');
  }

  // Conditional roles
  if (featureStr.includes('ui') || featureStr.includes('screen') || featureStr.includes('page')) {
    roles.add('ux_ui_architect');
  }

  if (featureStr.includes('api') || featureStr.includes('server') || featureStr.includes('database') || featureStr.includes('backend')) {
    roles.add('backend_engineer');
  }

  if (featureStr.includes('gemini') || featureStr.includes('ai') || featureStr.includes('llm')) {
    roles.add('ai_gemini_engineer');
  }

  if (featureStr.includes('database') || featureStr.includes('db') || featureStr.includes('schema') || featureStr.includes('migration')) {
    roles.add('database_engineer');
  }

  if (featureStr.includes('firebase') || featureStr.includes('auth') || featureStr.includes('firestore')) {
    // Firebase is handled by relevant engineers + firebase-setup skill
  }

  // Always include QA, security, build at the end
  roles.add('qa_test_engineer');
  roles.add('security_engineer');
  roles.add('build_release_engineer');
  roles.add('code_reviewer');

  logInfo(`Selected roles: ${[...roles].join(', ')}`);
  return [...roles];
}
