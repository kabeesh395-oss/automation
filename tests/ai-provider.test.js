/**
 * JARVIS Phase 4 AI Provider & Dynamic Generation Test Suite
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAIProvider, AICredentialsMissingError, setAIProvider } from '../core/ai/provider.js';
import { GeminiAIProvider } from '../core/ai/gemini-provider.js';
import { MockAIProvider } from '../core/ai/mock-provider.js';
import { parseStructuredResponse, AIResponseParseError } from '../core/ai/response-parser.js';
import { validateSafePath, applyFileChanges, FilePatchSecurityError } from '../core/file-patcher.js';
import { analyzeProduct } from '../core/product-analyst.js';
import { designArchitecture } from '../core/software-architect.js';
import { designUxPlan } from '../core/ux-architect.js';
import { planTasks } from '../core/task-planner.js';
import { TaskGraph } from '../core/task-graph.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_WORKSPACE = join(import.meta.dirname, 'scratch_ai_test_workspace');

describe('AI Provider Abstraction & Security Controls', () => {
  before(() => {
    if (!existsSync(TEST_WORKSPACE)) mkdirSync(TEST_WORKSPACE, { recursive: true });
  });

  after(() => {
    if (existsSync(TEST_WORKSPACE)) rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('should instantiate Gemini provider by default', () => {
    const provider = getAIProvider({ forceNew: true });
    assert.ok(provider instanceof GeminiAIProvider);
  });

  it('should throw explicit AICredentialsMissingError when API key is missing', async () => {
    const unconfiguredProvider = new GeminiAIProvider({ apiKey: '' });
    assert.equal(unconfiguredProvider.isConfigured(), false);

    await assert.rejects(
      async () => {
        await unconfiguredProvider.generateStructured({ systemPrompt: 'test', userPrompt: 'test' });
      },
      (err) => {
        assert.ok(err instanceof AICredentialsMissingError);
        assert.equal(err.status, 'BLOCKED');
        return true;
      }
    );
  });

  it('should parse clean JSON from markdown code fences', () => {
    const raw = '```json\n{\n  "app_name": "habit-tracker",\n  "version": 1\n}\n```';
    const parsed = parseStructuredResponse(raw);
    assert.equal(parsed.app_name, 'habit-tracker');
    assert.equal(parsed.version, 1);
  });

  it('should reject malformed JSON with AIResponseParseError', () => {
    const malformed = '```json\n{ app_name: invalid_json_here \n```';
    assert.throws(
      () => parseStructuredResponse(malformed),
      AIResponseParseError
    );
  });

  it('should reject JSON failing schema validator', () => {
    const raw = JSON.stringify({ invalid_property: true });
    const validator = (obj) => ({ valid: false, errors: ['Missing app_name'] });

    assert.throws(
      () => parseStructuredResponse(raw, validator),
      (err) => {
        assert.ok(err instanceof AIResponseParseError);
        assert.ok(err.message.includes('Missing app_name'));
        return true;
      }
    );
  });
});

describe('Safe File Patch Protocol Controls', () => {
  it('should allow valid relative file creation within workspace', () => {
    const safePath = validateSafePath('src/main.js', TEST_WORKSPACE);
    assert.ok(safePath.startsWith(TEST_WORKSPACE));
  });

  it('should reject path traversal outside workspace', () => {
    assert.throws(
      () => validateSafePath('../../etc/passwd', TEST_WORKSPACE),
      FilePatchSecurityError
    );
  });

  it('should reject protected file modifications (.env, .git)', () => {
    assert.throws(
      () => validateSafePath('.env', TEST_WORKSPACE),
      FilePatchSecurityError
    );
    assert.throws(
      () => validateSafePath('.env.production', TEST_WORKSPACE),
      FilePatchSecurityError
    );
    assert.throws(
      () => validateSafePath('.git/config', TEST_WORKSPACE),
      FilePatchSecurityError
    );
  });

  it('should apply file creation, track hashes, and support clean deletion', () => {
    const changeSet = {
      changes: [
        { path: 'src/app.js', operation: 'create', content: 'console.log("hello jarvis");\n' }
      ]
    };

    const result = applyFileChanges(changeSet, TEST_WORKSPACE);
    assert.equal(result.success, true);
    assert.equal(result.auditLog.applied.length, 1);
    assert.ok(result.auditLog.applied[0].afterHash);

    // Now delete
    const deleteSet = {
      changes: [
        { path: 'src/app.js', operation: 'delete' }
      ]
    };
    const delResult = applyFileChanges(deleteSet, TEST_WORKSPACE);
    assert.equal(delResult.success, true);
    assert.equal(delResult.auditLog.applied[0].operation, 'delete');
    assert.equal(existsSync(join(TEST_WORKSPACE, 'src/app.js')), false);
  });
});

describe('Fresh Idea Pipeline Test: Material Differences Across 3 Target Applications', () => {
  const mockProvider = new MockAIProvider();

  it('TEST A: Android Habit Tracker (Kotlin, Compose, DAG)', async () => {
    const idea = 'Build an Android habit tracker where users can create habits, mark them complete, and view weekly progress.';

    const { requirements, productSpecMd } = await analyzeProduct(idea, { aiProvider: mockProvider });
    assert.equal(requirements.target_platform, 'android');
    assert.equal(requirements.app_name, 'habit-tracker');
    assert.ok(requirements.core_features.some(f => f.name.includes('habit')));
    assert.ok(productSpecMd.includes('Product Specification: habit-tracker'));

    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    assert.equal(arch.platform, 'android');
    assert.equal(arch.language, 'kotlin');
    assert.equal(arch.framework, 'android-jetpack-compose');

    const ux = await designUxPlan(requirements, arch, { aiProvider: mockProvider });
    assert.ok(ux.screens.length > 0);
    assert.equal(ux.screens[0].name, 'MainScreen');

    const { taskQueue } = await planTasks(requirements, arch, ux, 'PRJ-TEST-HABIT', { aiProvider: mockProvider });
    assert.ok(taskQueue.tasks.length >= 4);
    assert.ok(taskQueue.tasks.some(t => t.id.includes('ANDROID') || t.id.includes('COMPOSE')));

    const graph = new TaskGraph(taskQueue.tasks);
    assert.equal(graph.hasCycle(), false);
  });

  it('TEST B: Web Expense Tracker (JavaScript, React/Vite, Web DAG)', async () => {
    const idea = 'Build a web expense tracker with login, expense categories, monthly totals, and CSV export.';

    const { requirements } = await analyzeProduct(idea, { aiProvider: mockProvider });
    assert.equal(requirements.target_platform, 'web');
    assert.equal(requirements.app_name, 'web-expense-tracker');
    assert.ok(requirements.core_features.some(f => f.name.includes('expense')));

    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    assert.equal(arch.platform, 'web');
    assert.equal(arch.language, 'javascript');
    assert.equal(arch.framework, 'react-vite');

    const ux = await designUxPlan(requirements, arch, { aiProvider: mockProvider });
    assert.ok(ux.screens.length > 0);

    const { taskQueue } = await planTasks(requirements, arch, ux, 'PRJ-TEST-EXPENSE', { aiProvider: mockProvider });
    assert.ok(taskQueue.tasks.some(t => t.id.includes('WEB')));
    assert.ok(!taskQueue.tasks.some(t => t.id.includes('ANDROID')));
  });

  it('TEST C: Backend REST API (Node.js, Express, Headless API DAG)', async () => {
    const idea = 'Build a REST API for managing books with authentication, CRUD operations, search, and pagination.';

    const { requirements } = await analyzeProduct(idea, { aiProvider: mockProvider });
    assert.equal(requirements.target_platform, 'backend');
    assert.equal(requirements.app_name, 'books-rest-api');
    assert.ok(requirements.core_features.some(f => f.name.includes('crud')));

    const arch = await designArchitecture(requirements, { aiProvider: mockProvider });
    assert.equal(arch.platform, 'backend');
    assert.equal(arch.framework, 'express');

    const ux = await designUxPlan(requirements, arch, { aiProvider: mockProvider });
    // Headless API has 0 UI screens
    assert.equal(ux.screens.length, 0);
    assert.equal(ux.navigation_structure.pattern, 'HeadlessApi');

    const { taskQueue } = await planTasks(requirements, arch, ux, 'PRJ-TEST-API', { aiProvider: mockProvider });
    assert.ok(taskQueue.tasks.some(t => t.id.includes('API')));
    assert.ok(!taskQueue.tasks.some(t => t.type === 'ui_implementation'));
  });
});
