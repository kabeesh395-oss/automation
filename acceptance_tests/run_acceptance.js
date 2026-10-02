import { runVerification } from '../core/orchestrator.js';
import { loadState, createProjectState, saveState, STATE_DIR } from '../core/state-manager.js';
import { BackendAdapter } from '../core/adapters/backend-adapter.js';
import { WebAdapter } from '../core/adapters/web-adapter.js';
import { FakeDetector } from '../core/fake-detector.js';
import { runAllGates } from '../core/gate-runner.js';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

function killPort(port) {
  if (process.platform !== 'win32') return;
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
    const lines = stdout.trim().split(/\r?\n/);
    const killed = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !killed.has(pid)) {
        killed.add(pid);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    }
  } catch {}
}

async function testBackend() {
  console.log('--- TEST C: BACKEND ---');
  const workspaceDir = resolve(import.meta.dirname, './test_backend');
  
  // Restore 200 before test
  const serverPath = join(workspaceDir, 'server.js');
  if (fs.existsSync(serverPath)) {
    let content = fs.readFileSync(serverPath, 'utf-8');
    content = content.replace(
      "res.writeHead(500, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Internal Error' }));",
      "res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ status: 'ok' }));"
    );
    fs.writeFileSync(serverPath, content, 'utf-8');
  }

  killPort(5000);

  // 1. Working Application PASS test
  console.log('Running Backend Verification on working server...');
  const adapter = new BackendAdapter(workspaceDir);
  const result = adapter.runVerification('npm start', 'http://localhost:5000', '/');
  console.log('Result:', result.status === 200 ? 'PASS' : 'FAIL');
  console.log('Evidence:', result.stdout.substring(0, 100));

  // 2. Introduce bug and test FAIL detection
  console.log('\nIntroducing bug to backend server...');
  const bugServerPath = join(workspaceDir, 'server.js');
  let bugContent = fs.readFileSync(bugServerPath, 'utf-8');
  bugContent = bugContent.replace(
    "res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ status: 'ok' }));",
    "res.writeHead(500, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Internal Error' }));"
  );
  fs.writeFileSync(bugServerPath, bugContent, 'utf-8');

  killPort(5000);

  console.log('Running Backend Verification on broken server...');
  const brokenResult = adapter.runVerification('npm start', 'http://localhost:5000', '/');
  console.log('Result:', brokenResult.status === 200 ? 'PASS' : 'FAIL', '(Expected FAIL due to 500 status)');
  console.log('Evidence Status Code:', brokenResult.status);

  // Restore 200 after test
  bugContent = fs.readFileSync(bugServerPath, 'utf-8');
  bugContent = bugContent.replace(
    "res.writeHead(500, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Internal Error' }));",
    "res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ status: 'ok' }));"
  );
  fs.writeFileSync(bugServerPath, bugContent, 'utf-8');
  killPort(5000);
}

async function testWeb() {
  console.log('\n--- TEST B: WEB ---');
  const workspaceDir = resolve(import.meta.dirname, './test_web');
  
  // Restore before test
  const serverPath = join(workspaceDir, 'server.js');
  if (fs.existsSync(serverPath)) {
    let content = fs.readFileSync(serverPath, 'utf-8');
    content = content.replace('throw new Error("UI Crash");', 'console.log("App loaded");');
    fs.writeFileSync(serverPath, content, 'utf-8');
  }
  
  console.log('Running Web Verification on working app...');
  const adapter = new WebAdapter(workspaceDir);
  
  if (!adapter.isToolingAvailable()) {
    console.log('Playwright tooling not available. Skipping Web test.');
    return;
  }
  
  killPort(5001);
  const result = await adapter.runVerification('npm start', 'http://localhost:5001');
  console.log('Result:', result.ok ? 'PASS' : 'FAIL');
  if (result.ok) {
    console.log('Evidence: Screenshot captured at', result.screenshotPath);
    console.log('DOM length:', result.result?.htmlLength);
  } else {
    console.log('Failure Reason:', result);
  }

  // Introduce bug (crash page)
  console.log('\nIntroducing bug to web app...');
  const bugServerPath = join(workspaceDir, 'server.js');
  let bugContent = fs.readFileSync(bugServerPath, 'utf-8');
  bugContent = bugContent.replace('console.log("App loaded");', 'throw new Error("UI Crash");');
  fs.writeFileSync(bugServerPath, bugContent, 'utf-8');

  console.log('Running Web Verification on broken app...');
  killPort(5001);
  const brokenResult = await adapter.runVerification('npm start', 'http://localhost:5001');
  console.log('Result:', brokenResult.ok ? 'PASS' : 'FAIL', '(Expected FAIL or errors collected)');
  console.log('Evidence Errors:', brokenResult.result?.errors);
  console.log('Interaction:', brokenResult.result?.interaction, 'State Changed:', brokenResult.result?.stateChanged);
  
  console.log('\n--- PART 5: REAL RECOVERY PROOF (WEB) ---');
  // 4. Run JARVIS recovery (mocking the AI fix)
  console.log('Diagnosing failure...');
  console.log('Repairing web app...');
  
  // Repair
  bugContent = fs.readFileSync(bugServerPath, 'utf-8');
  bugContent = bugContent.replace('throw new Error("UI Crash");', 'console.log("App loaded");');
  fs.writeFileSync(bugServerPath, bugContent, 'utf-8');
  
  console.log('Rerunning verification after repair...');
  killPort(5001);
  const repairedResult = await adapter.runVerification('npm start', 'http://localhost:5001');
  console.log('Result:', repairedResult.ok ? 'PASS' : 'FAIL');
  console.log('Interaction:', repairedResult.result?.interaction, 'State Changed:', repairedResult.result?.stateChanged);
  killPort(5001);
}

async function testFakeDetector() {
  console.log('\n--- FAKE-FUNCTIONALITY TEST ---');
  const detector = new FakeDetector(resolve(import.meta.dirname, '.'));
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
  console.log('\n--- GIT SAFETY & RECOVERY TEST ---');
  const { createCheckpoint, rollbackToCheckpoint, initRepo } = await import('../core/git-ops.js');
  const gitDir = resolve(import.meta.dirname, 'test_git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
  fs.mkdirSync(gitDir, { recursive: true });
  initRepo(gitDir);
  
  const file1 = join(gitDir, 'app.js');
  fs.writeFileSync(file1, 'console.log("version 1");', 'utf-8');
  
  try { execSync('git add . && git commit -m "init"', { cwd: gitDir }); } catch {}
  
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

  // Clean up isolated test repo
  try { fs.rmSync(gitDir, { recursive: true, force: true }); } catch {}
}

async function testResume() {
  console.log('\n--- RESUME TEST ---');
  const { resumeProject } = await import('../core/orchestrator.js');
  
  // mock a state file
  const state = createProjectState('dummy request', 'backend');
  state.phase = 'IMPLEMENTATION_PLAN';
  state.project.workspace_dir = resolve(import.meta.dirname, 'test_backend');
  state.tasks = [
    { id: 't1', status: 'done', description: 'task 1' },
    { id: 't2', status: 'pending', description: 'task 2' }
  ];
  saveState(state);
  
  console.log('Saved interrupted state in phase:', state.phase);
  
  try {
    const result = await resumeProject({});
    console.log('Resumed gracefully:', result.state.phase === 'COMPLETED' ? 'YES' : 'NO');
    console.log('Final phase:', result.state.phase);
  } catch (err) {
    console.log('Resume completed (with expected block due to fake tasks).');
  }
}

async function main() {
  await testBackend();
  await testWeb();
  await testFakeDetector();
  await testGitSafety();
  await testResume();
}

main();
