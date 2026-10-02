/**
 * JARVIS Phase 5 Integration & Unit Tests
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import assert from 'node:assert';
import { EvidenceEngine, VERDICT } from '../core/evidence-engine.js';
import { FakeDetector, FAKE_VERDICT } from '../core/fake-detector.js';
import { BackendAdapter } from '../core/adapters/backend-adapter.js';
import { WebAdapter } from '../core/adapters/web-adapter.js';
import { AndroidAdapter } from '../core/adapters/android-adapter.js';
import { createCheckpoint, rollbackToCheckpoint, initRepo } from '../core/git-ops.js';

const TEST_WORKSPACE = join(import.meta.dirname, 'phase5_workspace');

function setupWorkspace() {
  if (existsSync(TEST_WORKSPACE)) {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
  mkdirSync(TEST_WORKSPACE, { recursive: true });
  initRepo(TEST_WORKSPACE);
}

function runTests() {
  console.log('--- JARVIS Phase 5 Test Suite ---');
  setupWorkspace();

  try {
    testEvidenceEngine();
    testFakeDetector();
    testGitCheckpoint();
    testBackendAdapter();
    testWebAdapter();
    
    console.log('\\n✓ All Phase 5 Tests Passed Successfully');
  } catch (err) {
    console.error('\\n✗ Test Failed:', err.message);
    process.exit(1);
  }
}

function testEvidenceEngine() {
  console.log('Testing Evidence Engine...');
  const engine = new EvidenceEngine(TEST_WORKSPACE, join(TEST_WORKSPACE, '.jarvis_state'));
  
  // Test rejecting PASS without evidence
  const obs1 = engine.createObservation({ command: 'test' });
  const eval1 = engine.evaluate(obs1, { type: 'command' });
  assert.strictEqual(eval1.verdict, VERDICT.BLOCKED, 'Expected BLOCKED due to no evidence');

  // Test PASS with evidence
  const obs2 = engine.createObservation({ exitCode: 0, stdout: 'Success' });
  const eval2 = engine.evaluate(obs2, { type: 'command' });
  assert.strictEqual(eval2.verdict, VERDICT.PASS, 'Expected PASS with exit code 0');
}

function testFakeDetector() {
  console.log('Testing Fake Detector...');
  const detector = new FakeDetector(TEST_WORKSPACE);
  
  const realFile = join(TEST_WORKSPACE, 'real.js');
  writeFileSync(realFile, 'function add(a,b) { return a + b; }', 'utf-8');
  
  const fakeFile = join(TEST_WORKSPACE, 'fake.js');
  writeFileSync(fakeFile, 'function fetchUsers() { return [{id: 1, name: "mock"}]; }', 'utf-8');
  
  const realResult = detector.scan(realFile);
  assert.strictEqual(realResult.verdict, FAKE_VERDICT.REAL, 'Expected REAL for normal code');

  const fakeResult = detector.scan(fakeFile);
  assert.ok(fakeResult.verdict === FAKE_VERDICT.MOCK || fakeResult.verdict === FAKE_VERDICT.SUSPICIOUS, 'Expected MOCK/SUSPICIOUS for hardcoded array');
}

function testGitCheckpoint() {
  console.log('Testing Git Checkpoint Safety...');
  
  const testFile = join(TEST_WORKSPACE, 'file.txt');
  writeFileSync(testFile, 'initial content', 'utf-8');
  
  execSync('git add . && git commit -m "initial"', { cwd: TEST_WORKSPACE });
  
  const checkpointHash = createCheckpoint('test checkpoint', TEST_WORKSPACE);
  assert.ok(checkpointHash, 'Expected a checkpoint hash');

  writeFileSync(testFile, 'destructive change', 'utf-8');
  
  const rolledBack = rollbackToCheckpoint(checkpointHash, TEST_WORKSPACE);
  assert.ok(rolledBack, 'Expected rollback to succeed');
  
  const content = readFileSync(testFile, 'utf-8');
  assert.strictEqual(content, 'initial content', 'Expected file to be restored');
}

function testBackendAdapter() {
  console.log('Testing Backend Adapter (Sync)...');
  const backendDir = join(TEST_WORKSPACE, 'backend');
  mkdirSync(backendDir, { recursive: true });
  
  const serverCode = `
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('{"success":true}');
});
server.listen(4000, () => console.log('listening on 4000'));
  `;
  writeFileSync(join(backendDir, 'server.js'), serverCode, 'utf-8');
  
  const adapter = new BackendAdapter(backendDir);
  const result = adapter.runVerification('node server.js', 'http://localhost:4000', '/');
  
  assert.strictEqual(result.ok, true, 'Expected backend test to pass');
  assert.strictEqual(result.status, 200, 'Expected status 200');
  assert.ok(result.data.includes('success'), 'Expected success payload');
}

function testWebAdapter() {
  console.log('Testing Web Adapter (Sync)...');
  const webDir = join(TEST_WORKSPACE, 'web');
  mkdirSync(webDir, { recursive: true });
  
  const serverCode = `
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<html><body><h1>Web Works</h1></body></html>');
});
server.listen(4001, () => console.log('listening on 4001'));
  `;
  writeFileSync(join(webDir, 'server.js'), serverCode, 'utf-8');
  
  const adapter = new WebAdapter(webDir);
  const isPlaywrightAvailable = adapter.isToolingAvailable();
  
  if (isPlaywrightAvailable) {
    // Wait slightly just in case
    const result = adapter.runVerification('node server.js', 'http://localhost:4001');
    assert.strictEqual(result.ok, true, 'Expected web test to pass');
  } else {
    console.log('Playwright not available. Skipping active web verification.');
  }
}

runTests();
