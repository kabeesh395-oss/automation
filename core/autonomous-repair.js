/**
 * JARVIS Autonomous Audit & Repair Engine
 * 
 * Reusable software-engineering autonomy engine:
 * 1. Independently discovers project target from filesystem artifacts.
 * 2. Executes baseline runtime workflows via real platform adapters (Android ADB, Playwright, HTTP).
 * 3. Detects runtime defects based on live observations (UI state, console errors, HTTP status).
 * 4. Passes runtime failure evidence and discovered source code to JARVIS's AI reasoning pipeline.
 * 5. Applies AI-synthesized repair proposals strictly through the Safe File Patch Protocol.
 * 6. Enforces Git checkpointing, fake detection, workspace containment, and post-repair re-verification.
 * 7. Records complete provenance for auditability.
 * 
 * If AI credentials are unconfigured, strictly reports BLOCKED with honest provenance.
 * Never uses pre-canned repair templates or hardcoded defect signatures.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { AndroidAdapter } from './adapters/android-adapter.js';
import { WebAdapter } from './adapters/web-adapter.js';
import { BackendAdapter } from './adapters/backend-adapter.js';
import { applyFileChanges } from './file-patcher.js';
import { createCheckpoint, rollbackToCheckpoint, isGitRepo, initRepo } from './git-ops.js';
import { FakeDetector } from './fake-detector.js';
import { getAIProvider, AICredentialsMissingError } from './ai/provider.js';
import { verifyRepairEngineIntegrity } from './integrity-guard.js';
import * as logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);

export async function autonomousAuditAndRepair(workspaceDir, highLevelRequirement, options = {}) {
  const normWorkspace = resolve(workspaceDir);

  // 1. Mandatory Architecture Integrity Verification
  verifyRepairEngineIntegrity(__filename);

  const auditRecord = {
    workspace: normWorkspace,
    requirement: highLevelRequirement,
    timestamp: new Date().toISOString(),
    discovered: {},
    tasks: [],
    filesSelected: [],
    commandsExecuted: [],
    runtimeObservations: [],
    failureDetected: null,
    diagnosis: null,
    repair: null,
    evidence: {},
    provenance: null,
    humanIntervention: false,
    verdict: 'BLOCKED'
  };

  logger.logInit(`[JARVIS AUTONOMY] Auditing Project at: ${normWorkspace}`);
  logger.logInit(`[JARVIS AUTONOMY] Requirement: "${highLevelRequirement}"`);

  // Ensure git repo initialized for checkpoint safety
  if (!isGitRepo(normWorkspace)) {
    initRepo(normWorkspace);
  }

  // 2. Independent Target Discovery
  auditRecord.tasks.push('Task 1: Independent Project & Target Discovery');
  const target = discoverTarget(normWorkspace);
  auditRecord.discovered.target = target;
  logger.logPhase('DISCOVERY', `Discovered Project Target: ${target}`);

  if (target === 'android') {
    return await executeAndroidAutonomy(normWorkspace, highLevelRequirement, auditRecord, options);
  } else if (target === 'web') {
    return await executeWebAutonomy(normWorkspace, highLevelRequirement, auditRecord, options);
  } else if (target === 'backend') {
    return await executeBackendAutonomy(normWorkspace, highLevelRequirement, auditRecord, options);
  } else {
    auditRecord.verdict = 'FAILED';
    auditRecord.failureDetected = 'Unable to identify project target platform';
    return auditRecord;
  }
}

/**
 * Discovers project target platform dynamically without hints.
 */
function discoverTarget(workspaceDir) {
  if (existsSync(join(workspaceDir, 'app', 'src', 'main', 'AndroidManifest.xml')) ||
      existsSync(join(workspaceDir, 'build.gradle')) ||
      existsSync(join(workspaceDir, 'build.gradle.kts'))) {
    return 'android';
  }

  const pkgJsonPath = join(workspaceDir, 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['playwright'] || deps['react'] || deps['vue'] || existsSync(join(workspaceDir, 'index.html'))) {
        return 'web';
      }
    } catch {}
  }

  const serverPath = join(workspaceDir, 'server.js');
  if (existsSync(serverPath)) {
    const code = readFileSync(serverPath, 'utf-8');
    if (code.includes('text/html') || code.includes('<html') || code.includes('<!DOCTYPE')) {
      return 'web';
    }
    return 'backend';
  }

  return 'unknown';
}

/**
 * -------------------------------------------------------------
 * ANDROID AUTONOMOUS AUDIT & REPAIR
 * -------------------------------------------------------------
 */
async function executeAndroidAutonomy(workspaceDir, requirement, auditRecord, options) {
  const adapter = new AndroidAdapter(workspaceDir);

  const devices = adapter.getConnectedDevices();
  auditRecord.discovered.devices = devices;
  if (!devices || devices.length === 0) {
    auditRecord.verdict = 'NOT_CONFIGURED';
    auditRecord.failureDetected = 'No physical Android device attached';
    return auditRecord;
  }
  adapter.wakeAndUnlock();

  auditRecord.tasks.push('Task 2: Gradle Build Discovery & Execution');
  const gradleBin = findGradleExecutable(workspaceDir);
  auditRecord.discovered.gradleBin = gradleBin;
  const buildCmd = `"${gradleBin}" assembleDebug`;
  auditRecord.commandsExecuted.push(buildCmd);
  
  logger.logPhase('BUILD', `Executing build: ${buildCmd}`);
  execSync(buildCmd, { cwd: workspaceDir, encoding: 'utf-8' });

  const apkPath = adapter.findApk(workspaceDir);
  auditRecord.discovered.apkPath = apkPath;
  const apkInfo = adapter.getApkInfo(apkPath);
  auditRecord.discovered.packageName = apkInfo.packageName;
  auditRecord.discovered.launcherActivity = apkInfo.launcherActivity;

  auditRecord.tasks.push('Task 3: Device Deployment & Baseline Runtime Observation');
  adapter.installApk(apkPath);
  adapter.stopApp(apkInfo.packageName);
  adapter.clearLogcat();
  adapter.launchApp(apkInfo.packageName, apkInfo.launcherActivity);
  await sleep(3000);

  const initialDump = adapter.dumpUI();
  const initialScreenshot = join(workspaceDir, 'autonomy_android_initial.png');
  adapter.captureScreenshot(initialScreenshot);

  const button = adapter.findNodeBounds(initialDump.uiState, { className: 'android.widget.Button' });
  if (!button) {
    auditRecord.verdict = 'FAILED';
    auditRecord.failureDetected = 'No interactable control located in UI hierarchy';
    return auditRecord;
  }
  auditRecord.discovered.interactiveElement = button;

  adapter.tap(button.x, button.y);
  await sleep(2000);

  const postDump = adapter.dumpUI();
  const postScreenshot = join(workspaceDir, 'autonomy_android_post_click.png');
  adapter.captureScreenshot(postScreenshot);

  const stateChanged = initialDump.uiState !== postDump.uiState;
  auditRecord.runtimeObservations.push({
    stage: 'pre-repair',
    stateChanged,
    buttonClicked: button.text || button.className,
    uiDumpLength: postDump.uiState?.length
  });

  if (!stateChanged) {
    const failureMsg = 'User interaction executed but UI state remained completely unchanged';
    auditRecord.failureDetected = failureMsg;
    logger.logError(`[AUTONOMY DETECTED FAILURE]: ${failureMsg}`);

    const runtimeEvidence = {
      platform: 'android',
      interactedElement: button,
      initialUiStateSnippet: initialDump.uiState?.slice(0, 1000),
      postClickUiStateSnippet: postDump.uiState?.slice(0, 1000),
      stateChanged: false,
      initialScreenshot,
      postScreenshot
    };

    const repairResult = await runAutonomousRepairWithAI({
      workspaceDir,
      target: 'android',
      requirement,
      failureDescription: failureMsg,
      runtimeEvidence,
      candidateExtensions: ['.java', '.kt', '.xml'],
      auditRecord,
      options,
      reverifyFn: async () => {
        execSync(buildCmd, { cwd: workspaceDir, encoding: 'utf-8' });
        adapter.installApk(apkPath);
        adapter.stopApp(apkInfo.packageName);
        await sleep(1000);
        adapter.launchApp(apkInfo.packageName, apkInfo.launcherActivity);
        await sleep(3000);

        const repInitDump = adapter.dumpUI();
        const repButton = adapter.findNodeBounds(repInitDump.uiState, { className: 'android.widget.Button' });
        if (repButton) {
          adapter.tap(repButton.x, repButton.y);
          await sleep(2000);
        }
        const repPostDump = adapter.dumpUI();
        const repScreenshot = join(workspaceDir, 'autonomy_android_repaired.png');
        adapter.captureScreenshot(repScreenshot);

        const confirmed = repInitDump.uiState !== repPostDump.uiState;
        return {
          ok: confirmed,
          evidence: {
            initialScreenshot,
            postScreenshot,
            repairedScreenshot: repScreenshot,
            stateChangeConfirmed: confirmed
          }
        };
      }
    });

    return repairResult;
  }

  auditRecord.verdict = 'VERIFIED';
  auditRecord.evidence = { stateChangeConfirmed: true };
  return auditRecord;
}

/**
 * -------------------------------------------------------------
 * WEB AUTONOMOUS AUDIT & REPAIR
 * -------------------------------------------------------------
 */
async function executeWebAutonomy(workspaceDir, requirement, auditRecord, options) {
  const adapter = new WebAdapter(workspaceDir);
  if (!adapter.isToolingAvailable()) {
    auditRecord.verdict = 'NOT_CONFIGURED';
    auditRecord.failureDetected = 'Playwright tooling not available';
    return auditRecord;
  }

  const startCmd = discoverStartCommand(workspaceDir);
  const targetPort = discoverPort(workspaceDir, 5001);
  const targetUrl = `http://localhost:${targetPort}`;
  auditRecord.discovered.startCmd = startCmd;
  auditRecord.discovered.targetUrl = targetUrl;

  auditRecord.tasks.push('Task 2: Initial Web Runtime Exploration & Fault Reproduction');
  const baselineResult = await adapter.runVerification(startCmd, targetUrl);

  auditRecord.runtimeObservations.push({
    stage: 'pre-repair',
    ok: baselineResult.ok,
    errors: baselineResult.result?.errors || [],
    stateChanged: baselineResult.result?.stateChanged
  });

  if (!baselineResult.ok) {
    const errorDetails = baselineResult.result?.errors || baselineResult.stderr || 'Runtime failure';
    const failureMsg = `Web runtime failure: ${JSON.stringify(errorDetails)}`;
    auditRecord.failureDetected = failureMsg;
    logger.logError(`[AUTONOMY DETECTED FAILURE]: ${failureMsg}`);

    const runtimeEvidence = {
      platform: 'web',
      targetUrl,
      startCmd,
      errors: baselineResult.result?.errors || [],
      interaction: baselineResult.result?.interaction,
      stateChanged: baselineResult.result?.stateChanged,
      htmlSnippet: baselineResult.result?.htmlSnippet
    };

    const repairResult = await runAutonomousRepairWithAI({
      workspaceDir,
      target: 'web',
      requirement,
      failureDescription: failureMsg,
      runtimeEvidence,
      candidateExtensions: ['.js', '.cjs', '.html', '.ts'],
      auditRecord,
      options,
      reverifyFn: async () => {
        const repairedResult = await adapter.runVerification(startCmd, targetUrl);
        return {
          ok: repairedResult.ok,
          evidence: {
            screenshotPath: repairedResult.screenshotPath,
            stateChanged: repairedResult.result?.stateChanged,
            errors: repairedResult.result?.errors || []
          }
        };
      }
    });

    return repairResult;
  }

  auditRecord.verdict = 'VERIFIED';
  auditRecord.evidence = { ok: true };
  return auditRecord;
}

/**
 * -------------------------------------------------------------
 * BACKEND AUTONOMOUS AUDIT & REPAIR
 * -------------------------------------------------------------
 */
async function executeBackendAutonomy(workspaceDir, requirement, auditRecord, options) {
  const adapter = new BackendAdapter(workspaceDir);
  const startCmd = discoverStartCommand(workspaceDir);
  const targetPort = discoverPort(workspaceDir, 5000);
  const targetUrl = `http://localhost:${targetPort}`;
  const endpoints = discoverEndpoints(workspaceDir);

  auditRecord.discovered.startCmd = startCmd;
  auditRecord.discovered.targetUrl = targetUrl;
  auditRecord.discovered.endpoints = endpoints;

  auditRecord.tasks.push('Task 2: Initial API Request & Fault Reproduction');
  let failingEndpoint = null;
  let baselineResult = null;

  for (const ep of endpoints) {
    const res = adapter.runVerification(startCmd, targetUrl, ep);
    auditRecord.runtimeObservations.push({
      stage: 'pre-repair',
      endpoint: ep,
      status: res.status,
      ok: res.ok
    });
    if (!res.ok || res.status >= 400) {
      failingEndpoint = ep;
      baselineResult = res;
      break;
    }
  }

  if (failingEndpoint && baselineResult) {
    const failureMsg = `API endpoint ${failingEndpoint} returned error status: ${baselineResult.status}`;
    auditRecord.failureDetected = failureMsg;
    logger.logError(`[AUTONOMY DETECTED FAILURE]: ${failureMsg}`);

    const runtimeEvidence = {
      platform: 'backend',
      targetUrl,
      failingEndpoint,
      status: baselineResult.status,
      responseBody: baselineResult.data,
      stdout: baselineResult.stdout,
      stderr: baselineResult.stderr
    };

    const repairResult = await runAutonomousRepairWithAI({
      workspaceDir,
      target: 'backend',
      requirement,
      failureDescription: failureMsg,
      runtimeEvidence,
      candidateExtensions: ['.js', '.ts', '.cjs'],
      auditRecord,
      options,
      reverifyFn: async () => {
        const repRes = adapter.runVerification(startCmd, targetUrl, failingEndpoint);
        return {
          ok: repRes.ok && repRes.status < 400,
          evidence: {
            endpoint: failingEndpoint,
            status: repRes.status,
            data: repRes.data
          }
        };
      }
    });

    return repairResult;
  }

  auditRecord.verdict = 'VERIFIED';
  auditRecord.evidence = { ok: true, endpointsTested: endpoints };
  return auditRecord;
}

/**
 * -------------------------------------------------------------
 * GENERIC AI-DRIVEN REPAIR PIPELINE (NO HARDCODED TEMPLATES)
 * -------------------------------------------------------------
 */
async function runAutonomousRepairWithAI({
  workspaceDir,
  target,
  requirement,
  failureDescription,
  runtimeEvidence,
  candidateExtensions,
  auditRecord,
  options,
  reverifyFn
}) {
  const provider = options.aiProvider || getAIProvider(options);

  auditRecord.tasks.push('Task 3: AI-Driven Defect Diagnosis & Solution Synthesis');

  const sourceFiles = findSourceFiles(workspaceDir, candidateExtensions);
  const fileContexts = sourceFiles.map(filePath => {
    const rel = relative(workspaceDir, filePath);
    try {
      const content = readFileSync(filePath, 'utf-8');
      return `--- File: ${rel} ---\n${content}\n`;
    } catch {
      return '';
    }
  }).join('\n');

  // Verify AI credentials
  if (!provider.isConfigured()) {
    auditRecord.verdict = 'BLOCKED';
    auditRecord.failureDetected = `AI Provider credentials unavailable (${provider.constructor.name}) — autonomous diagnosis and code synthesis cannot execute without active model credentials.`;
    auditRecord.provenance = {
      diagnosisSource: 'AI Provider (Unavailable)',
      aiProvider: provider.constructor.name,
      aiModel: provider.model || 'unconfigured',
      credentialsConfigured: false,
      evidenceUsed: runtimeEvidence,
      filesSelected: sourceFiles.map(f => relative(workspaceDir, f)),
      patchGenerated: null,
      verificationResult: 'BLOCKED',
      humanInterventionCount: 0
    };
    logger.logError(`[JARVIS AUTONOMY BLOCKED]: ${auditRecord.failureDetected}`);
    return auditRecord;
  }

  const systemPrompt = `You are JARVIS's Autonomous Software Engineering Repair Engine.
Your task: Analyze live runtime failure observations from real execution on a ${target} target, diagnose the root cause across the provided project source code, and generate a safe, targeted patch to resolve the defect.

Requirements:
1. Explain the probable root cause clearly.
2. Select only the necessary files that require modification.
3. Return complete replacement content for each modified file so the application passes runtime verification.
4. Do not invent mock data or fake functions. Produce genuine, working software logic.
5. Return JSON matching the schema below.

JSON Output Schema:
{
  "diagnosis": "string explaining the defect and rationale for the fix",
  "files_to_modify": ["relative/path/to/file"],
  "changes": [
    {
      "path": "relative/path/to/file",
      "operation": "modify",
      "content": "complete replacement content"
    }
  ]
}`;

  const userPrompt = `Target Platform: ${target}
User Requirement: "${requirement}"
Observed Failure: ${failureDescription}

Runtime Evidence:
${JSON.stringify(runtimeEvidence, null, 2)}

Discovered Workspace Source Files:
${fileContexts}

Produce the structured repair plan in JSON format.`;

  let repairProposal;
  try {
    repairProposal = await provider.generateStructured({
      systemPrompt,
      userPrompt,
      context: { stage: 'autonomous_repair', target, failureDescription }
    });
  } catch (err) {
    auditRecord.verdict = 'BLOCKED';
    auditRecord.failureDetected = err.message;
    auditRecord.provenance = {
      diagnosisSource: `AI Provider (${provider.constructor.name}) [Unavailable/Error]`,
      aiProvider: provider.constructor.name,
      aiModel: provider.activeModel || provider.model || 'unknown',
      credentialsConfigured: provider.isConfigured(),
      evidenceUsed: runtimeEvidence,
      filesSelected: sourceFiles.map(f => relative(workspaceDir, f)),
      patchGenerated: null,
      verificationResult: 'BLOCKED',
      humanInterventionCount: 0
    };
    logger.logError(`[JARVIS AUTONOMY BLOCKED]: ${err.message}`);
    return auditRecord;
  }

  if (!repairProposal || !Array.isArray(repairProposal.changes) || repairProposal.changes.length === 0) {
    auditRecord.verdict = 'FAILED';
    auditRecord.diagnosis = 'AI did not return any actionable file modifications';
    return auditRecord;
  }

  auditRecord.diagnosis = repairProposal.diagnosis || 'AI diagnosis applied';
  auditRecord.filesSelected = (repairProposal.files_to_modify || repairProposal.changes.map(c => c.path));

  // 4. Safe Patch Application with Checkpoint
  auditRecord.tasks.push('Task 4: Safe Patch Protocol Application with Git Checkpoint');
  const checkpoint = createCheckpoint(`JARVIS AI Repair (${target})`, workspaceDir);
  auditRecord.discovered.checkpoint = checkpoint;

  const patchResult = applyFileChanges({ changes: repairProposal.changes }, workspaceDir);
  auditRecord.repair = {
    changes: repairProposal.changes.map(c => ({ path: c.path, operation: c.operation })),
    patchSuccess: patchResult.success
  };

  if (!patchResult.success) {
    if (checkpoint) rollbackToCheckpoint(checkpoint, workspaceDir);
    auditRecord.verdict = 'FAILED';
    auditRecord.failureDetected = `Failed to apply safe file patches: ${patchResult.auditLog.errors.map(e => e.error).join('; ')}`;
    return auditRecord;
  }

  // Check for fake functionality
  const detector = new FakeDetector(workspaceDir);
  for (const changed of repairProposal.changes) {
    const fullP = join(workspaceDir, changed.path);
    const scanRes = detector.scan(fullP);
    if (scanRes.verdict === 'MOCK' || scanRes.verdict === 'SUSPICIOUS') {
      if (checkpoint) rollbackToCheckpoint(checkpoint, workspaceDir);
      auditRecord.verdict = 'FAILED';
      auditRecord.failureDetected = `AI repair introduced fake or mock implementation: ${scanRes.findings.map(f => f.reason).join(', ')}`;
      return auditRecord;
    }
  }

  // 5. Re-verification via real runtime
  auditRecord.tasks.push('Task 5: Post-Repair Live Runtime Verification');
  try {
    const reverifyResult = await reverifyFn();
    auditRecord.evidence = reverifyResult.evidence || {};

    if (reverifyResult.ok) {
      auditRecord.verdict = 'VERIFIED';
    } else {
      auditRecord.verdict = 'FAILED';
      if (checkpoint) rollbackToCheckpoint(checkpoint, workspaceDir);
    }
  } catch (reverifyErr) {
    if (checkpoint) rollbackToCheckpoint(checkpoint, workspaceDir);
    auditRecord.verdict = 'FAILED';
    auditRecord.failureDetected = `Post-repair verification encountered fatal error: ${reverifyErr.message}`;
  }

  auditRecord.provenance = {
    diagnosisSource: `AI Reasoning Pipeline (${provider.constructor.name})`,
    aiProvider: provider.constructor.name,
    aiModel: provider.activeModel || provider.model || 'active',
    credentialsConfigured: true,
    evidenceUsed: runtimeEvidence,
    filesSelected: auditRecord.filesSelected,
    patchGenerated: repairProposal.changes.map(c => ({ path: c.path, operation: c.operation })),
    verificationResult: auditRecord.verdict,
    humanInterventionCount: 0
  };

  return auditRecord;
}

// -------------------------------------------------------------
// HELPER DISCOVERY UTILITIES
// -------------------------------------------------------------

function findGradleExecutable(workspaceDir) {
  const localWrapper = join(workspaceDir, 'gradlew.bat');
  if (existsSync(localWrapper)) return localWrapper;
  const userWrapper = "C:\\Users\\Admin\\.gradle\\wrapper\\dists\\gradle-8.7-bin\\bhs2wmbdwecv87pi65oeuq5iu\\gradle-8.7\\bin\\gradle.bat";
  if (existsSync(userWrapper)) return userWrapper;
  return 'gradle';
}

function discoverStartCommand(workspaceDir) {
  const pkgPath = join(workspaceDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts?.start) return 'npm start';
      if (pkg.main) return `node ${pkg.main}`;
    } catch {}
  }
  if (existsSync(join(workspaceDir, 'server.js'))) return 'node server.js';
  return 'npm start';
}

function discoverPort(workspaceDir, defaultPort) {
  const serverFiles = ['server.js', 'app.js', 'index.js'];
  for (const sf of serverFiles) {
    const full = join(workspaceDir, sf);
    if (existsSync(full)) {
      const content = readFileSync(full, 'utf-8');
      const match = content.match(/\.listen\(\s*(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return defaultPort;
}

function discoverEndpoints(workspaceDir) {
  const endpoints = new Set(['/']);
  const serverPath = join(workspaceDir, 'server.js');
  if (existsSync(serverPath)) {
    const content = readFileSync(serverPath, 'utf-8');
    const matches = content.matchAll(/req\.url\s*===?\s*['"]([^'"]+)['"]/g);
    for (const m of matches) {
      endpoints.add(m[1]);
    }
  }
  return Array.from(endpoints);
}

function findSourceFiles(dir, extensions) {
  const results = [];
  const walk = (d) => {
    try {
      for (const entry of readdirSync(d)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'build' || entry === '.gradle') continue;
        const full = join(d, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (extensions.some(ext => entry.endsWith(ext))) results.push(full);
      }
    } catch {}
  };
  walk(dir);
  return results;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
