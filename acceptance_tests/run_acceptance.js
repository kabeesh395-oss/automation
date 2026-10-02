import { runVerification } from '../core/orchestrator.js';
import { loadState, createProjectState, saveState, STATE_DIR } from '../core/state-manager.js';
import { BackendAdapter } from '../core/adapters/backend-adapter.js';
import { WebAdapter } from '../core/adapters/web-adapter.js';
import { FakeDetector } from '../core/fake-detector.js';
import { runAllGates } from '../core/gate-runner.js';
import { resolve, join } from 'node:path';

async function testBackend() {
  console.log('--- TEST C: BACKEND ---');
  const workspaceDir = resolve(import.meta.dirname, './test_backend');
  
  // 1. Working Application PASS test
  console.log('Running Backend Verification on working server...');
  const adapter = new BackendAdapter(workspaceDir);
  const result = adapter.runVerification('npm start', 'http://localhost:5000', '/');
  console.log('Result:', result.status === 200 ? 'PASS' : 'FAIL');
  console.log('Evidence:', result.stdout.substring(0, 100));

  // 2. Introduce bug and test FAIL detection
  console.log('\\nIntroducing bug to backend server...');
  const fs = await import('node:fs');
  const serverPath = join(workspaceDir, 'server.js');
  let content = fs.readFileSync(serverPath, 'utf-8');
  content = content.replace("res.writeHead(200", "res.writeHead(500");
  fs.writeFileSync(serverPath, content, 'utf-8');

  console.log('Running Backend Verification on broken server...');
  const brokenResult = adapter.runVerification('npm start', 'http://localhost:5000', '/');
  console.log('Result:', brokenResult.status === 200 ? 'PASS' : 'FAIL', '(Expected FAIL due to 500 status)');
  console.log('Evidence Status Code:', brokenResult.status);
}

async function testWeb() {
  console.log('\\n--- TEST B: WEB ---');
  const workspaceDir = resolve(import.meta.dirname, './test_web');
  
  console.log('Running Web Verification on working app...');
  const adapter = new WebAdapter(workspaceDir);
  
  if (!adapter.isToolingAvailable()) {
    console.log('Playwright tooling not available. Skipping Web test.');
    return;
  }
  
  const result = adapter.runVerification('npm start', 'http://localhost:5001');
  console.log('Result:', result.ok ? 'PASS' : 'FAIL');
  if (result.ok) {
    console.log('Evidence: Screenshot captured at', result.screenshotPath);
    console.log('DOM length:', result.result?.htmlLength);
  }

  // Introduce bug (crash page)
  console.log('\\nIntroducing bug to web app...');
  const fs = await import('node:fs');
  const serverPath = join(workspaceDir, 'server.js');
  let content = fs.readFileSync(serverPath, 'utf-8');
  content = content.replace('console.log("App loaded");', 'throw new Error("UI Crash");');
  fs.writeFileSync(serverPath, content, 'utf-8');

  console.log('Running Web Verification on broken app...');
  const brokenResult = adapter.runVerification('npm start', 'http://localhost:5001');
  console.log('Result:', brokenResult.ok ? 'PASS' : 'FAIL', '(Expected FAIL or errors collected)');
  console.log('Evidence Errors:', brokenResult.result?.errors);
}

async function testFakeDetector() {
  console.log('\\n--- FAKE-FUNCTIONALITY TEST ---');
  const detector = new FakeDetector(resolve(import.meta.dirname, '.'));
  const fs = await import('node:fs');
  const fakeFile = resolve(import.meta.dirname, 'fake_test.js');
  
  // 1. Fake behavior
  fs.writeFileSync(fakeFile, 'function finish() { return "Success"; } // setTimeout(fake, 1000)', 'utf-8');
  let result = detector.scan(fakeFile);
  console.log('Result (Fake file):', result.verdict, result.findings.map(f => f.reason).join(', '));

  // 2. Real behavior
  const realFile = resolve(import.meta.dirname, 'real_test.js');
  fs.writeFileSync(realFile, 'function calc() { return 2 + 2; }', 'utf-8');
  let realResult = detector.scan(realFile);
  console.log('Result (Real file):', realResult.verdict);
  
  fs.unlinkSync(fakeFile);
  fs.unlinkSync(realFile);
}

async function testGitSafety() {
  console.log('\\n--- GIT SAFETY & RECOVERY TEST ---');
  const { createCheckpoint, rollbackToCheckpoint, initRepo } = await import('../core/git-ops.js');
  const fs = await import('node:fs');
  const gitDir = resolve(import.meta.dirname, 'test_git');
  if (!fs.existsSync(gitDir)) fs.mkdirSync(gitDir);
  initRepo(gitDir);
  
  const file1 = join(gitDir, 'app.js');
  fs.writeFileSync(file1, 'console.log("version 1");', 'utf-8');
  
  const execSync = (await import('node:child_process')).execSync;
  execSync('git add . && git commit -m "init"', { cwd: gitDir });
  
  // Unrelated uncommitted user change
  fs.writeFileSync(join(gitDir, 'user_notes.txt'), 'my ideas', 'utf-8');
  
  const checkpoint = createCheckpoint('Before Autonomous Repair', gitDir);
  console.log('Checkpoint created:', checkpoint);
  
  // autonomous repair attempts destructive change
  fs.writeFileSync(file1, 'console.log("version 2 broken");', 'utf-8');
  
  // rollback
  rollbackToCheckpoint(checkpoint, gitDir);
  console.log('Rolled back.');
  
  const restored = fs.readFileSync(file1, 'utf-8');
  console.log('App restored:', restored.includes('version 1'));
}

async function main() {
  await testBackend();
  await testWeb();
  await testFakeDetector();
  await testGitSafety();
}

main();
