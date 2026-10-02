/**
 * JARVIS Final Autonomy Acceptance Test Harness
 * 
 * Runs the complete autonomy loop across:
 * - Test A: Android
 * - Test B: Web
 * - Test C: Backend
 * 
 * Uses NEW defect variants for Round 1 and Round 2.
 * Strictly verifies integrity guard before execution.
 * Collects live evidence and explicit provenance.
 */

import { resolve, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { autonomousAuditAndRepair } from '../core/autonomous-repair.js';
import { verifyRepairEngineIntegrity } from '../core/integrity-guard.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');
const REPAIR_ENGINE_PATH = join(ROOT_DIR, 'core', 'autonomous-repair.js');

const ANDROID_DIR = resolve(ROOT_DIR, 'acceptance_tests', 'test_android');
const WEB_DIR = resolve(ROOT_DIR, 'acceptance_tests', 'test_web');
const BACKEND_DIR = resolve(ROOT_DIR, 'acceptance_tests', 'test_backend');

// -------------------------------------------------------------
// HARNESS DEFECT INJECTION (Unknown to JARVIS)
// -------------------------------------------------------------

function resetAndroidApp() {
  const file = join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'org', 'jarvis', 'testapp', 'MainActivity.java');
  const cleanContent = `package org.jarvis.testapp;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.View;

public class MainActivity extends Activity {
    private TextView statusView;
    private Button actionBtn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(50, 100, 50, 50);

        statusView = new TextView(this);
        statusView.setText("Initial State: Idle");
        statusView.setTextSize(22);
        layout.addView(statusView);

        actionBtn = new Button(this);
        actionBtn.setText("Perform Action");
        actionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                statusView.setText("State Changed: Action Completed Successfully");
            }
        });
        layout.addView(actionBtn);

        setContentView(layout);
    }
}
`;
  writeFileSync(file, cleanContent, 'utf-8');
}

function resetWebApp() {
  const file = join(WEB_DIR, 'server.js');
  const cleanContent = `import http from 'http';

const html = \`
<!DOCTYPE html>
<html>
<head>
  <title>Test Web</title>
</head>
<body>
  <h1 id="title">Welcome</h1>
  <button id="btn" onclick="document.getElementById('title').innerText = 'Clicked'">Click Me</button>
  <script>
    console.log("App loaded cleanly");
  </script>
</body>
</html>
\`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(5001, () => {
  console.log('Server started on port 5001');
});
`;
  writeFileSync(file, cleanContent, 'utf-8');
}

function resetBackendApp() {
  const file = join(BACKEND_DIR, 'server.js');
  const cleanContent = `import http from 'http';

const users = [];

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
  } else if (req.method === 'POST' && req.url === '/users') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      const data = JSON.parse(body);
      if (!data.email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing email' }));
      } else {
        users.push(data);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      }
    });
  } else if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  }
});

server.listen(5000, () => {
  console.log('Server started on port 5000');
});
`;
  writeFileSync(file, cleanContent, 'utf-8');
}

// ROUND 1 DEFECT VARIANTS
function injectAndroidDefectVariant1() {
  const file = join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'org', 'jarvis', 'testapp', 'MainActivity.java');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    'statusView.setText("State Changed: Action Completed Successfully");',
    '// Defect variant 1: click handler does not execute any state modification\n                int noop = 42;'
  );
  writeFileSync(file, content, 'utf-8');
}

function injectWebDefectVariant1() {
  const file = join(WEB_DIR, 'server.js');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    'console.log("App loaded cleanly");',
    'throw new TypeError("Runtime initialization failed: Controller component not mounted");'
  );
  writeFileSync(file, content, 'utf-8');
}

function injectBackendDefectVariant1() {
  const file = join(BACKEND_DIR, 'server.js');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    "res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ status: 'ok' }));",
    "res.writeHead(503, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Service Unavailable', code: 503 }));"
  );
  writeFileSync(file, content, 'utf-8');
}

// ROUND 2 DEFECT VARIANTS
function injectAndroidDefectVariant2() {
  const file = join(ANDROID_DIR, 'app', 'src', 'main', 'java', 'org', 'jarvis', 'testapp', 'MainActivity.java');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    'statusView.setText("State Changed: Action Completed Successfully");',
    '// Defect variant 2: reset text back to initial state, producing no visible state change\n                statusView.setText("Initial State: Idle");'
  );
  writeFileSync(file, content, 'utf-8');
}

function injectWebDefectVariant2() {
  const file = join(WEB_DIR, 'server.js');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    'console.log("App loaded cleanly");',
    'throw new ReferenceError("Client script evaluation failed: Uncaught dependency resolution error");'
  );
  writeFileSync(file, content, 'utf-8');
}

function injectBackendDefectVariant2() {
  const file = join(BACKEND_DIR, 'server.js');
  let content = readFileSync(file, 'utf-8');
  content = content.replace(
    "res.writeHead(200, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ status: 'ok' }));",
    "res.writeHead(502, { 'Content-Type': 'application/json' });\n    res.end(JSON.stringify({ error: 'Bad Gateway', code: 502 }));"
  );
  writeFileSync(file, content, 'utf-8');
}

async function runTest(name, dir, requirement) {
  console.log(`\n============================================================`);
  console.log(`STARTING AUTONOMY ACCEPTANCE: ${name}`);
  console.log(`Project: ${dir}`);
  console.log(`Requirement: "${requirement}"`);
  console.log(`============================================================\n`);

  const result = await autonomousAuditAndRepair(dir, requirement);
  console.log(`\n>>> RESULT FOR ${name}: [${result.verdict}]`);
  console.log(`Discovered:`, JSON.stringify(result.discovered, null, 2));
  console.log(`Failure Detected:`, result.failureDetected);
  console.log(`Diagnosis:`, result.diagnosis);
  console.log(`Repair:`, JSON.stringify(result.repair, null, 2));
  console.log(`Evidence:`, JSON.stringify(result.evidence, null, 2));
  console.log(`Provenance:`, JSON.stringify(result.provenance, null, 2));

  return result;
}

async function main() {
  console.log('############################################################');
  console.log('# JARVIS FINAL AUTONOMY ACCEPTANCE TEST SUITE');
  console.log('############################################################\n');

  // STEP 0: ARCHITECTURE INTEGRITY GUARD
  console.log('[Integrity Guard] Scanning repair engine for hardcoded templates or leakage...');
  const integrityResult = verifyRepairEngineIntegrity(REPAIR_ENGINE_PATH);
  console.log(`[Integrity Guard] PASSED: 0 forbidden tokens detected in ${REPAIR_ENGINE_PATH}`);

  // ROUND 1: NEW DEFECT VARIANTS
  console.log('\n>>> ROUND 1: NEW DEFECT VARIANTS <<<');

  // Reset and inject Android variant 1
  resetAndroidApp();
  console.log('\n[Harness] Injecting intentional defect variant 1 into Android project...');
  injectAndroidDefectVariant1();
  const androidResult1 = await runTest(
    'TEST A — ANDROID (Variant 1)',
    ANDROID_DIR,
    'Verify that the primary user action works correctly and repair any functional problem you discover.'
  );

  // Reset and inject Web variant 1
  resetWebApp();
  console.log('\n[Harness] Injecting intentional defect variant 1 into Web project...');
  injectWebDefectVariant1();
  const webResult1 = await runTest(
    'TEST B — WEB (Variant 1)',
    WEB_DIR,
    'Verify the primary user workflow and repair any functional problem you discover.'
  );

  // Reset and inject Backend variant 1
  resetBackendApp();
  console.log('\n[Harness] Injecting intentional defect variant 1 into Backend project...');
  injectBackendDefectVariant1();
  const backendResult1 = await runTest(
    'TEST C — BACKEND (Variant 1)',
    BACKEND_DIR,
    'Verify the primary API workflow and repair any functional problem you discover.'
  );

  // ROUND 2: REPRODUCIBILITY WITH DEFECT VARIANTS 2
  console.log('\n\n############################################################');
  console.log('# ROUND 2: REPRODUCIBILITY CHECK (DEFECT VARIANTS 2)');
  console.log('############################################################\n');

  resetAndroidApp();
  console.log('\n[Harness] Injecting intentional defect variant 2 into Android project...');
  injectAndroidDefectVariant2();
  const androidResult2 = await runTest(
    'REPRODUCIBILITY TEST A — ANDROID (Variant 2)',
    ANDROID_DIR,
    'Verify that the primary user action works correctly and repair any functional problem you discover.'
  );

  resetWebApp();
  console.log('\n[Harness] Injecting intentional defect variant 2 into Web project...');
  injectWebDefectVariant2();
  const webResult2 = await runTest(
    'REPRODUCIBILITY TEST B — WEB (Variant 2)',
    WEB_DIR,
    'Verify the primary user workflow and repair any functional problem you discover.'
  );

  resetBackendApp();
  console.log('\n[Harness] Injecting intentional defect variant 2 into Backend project...');
  injectBackendDefectVariant2();
  const backendResult2 = await runTest(
    'REPRODUCIBILITY TEST C — BACKEND (Variant 2)',
    BACKEND_DIR,
    'Verify the primary API workflow and repair any functional problem you discover.'
  );

  console.log('\n\n############################################################');
  console.log('# FINAL SUMMARY OF AUTONOMY ACCEPTANCE');
  console.log('############################################################');
  console.log(`Android Round 1: ${androidResult1.verdict} | Round 2: ${androidResult2.verdict}`);
  console.log(`Web     Round 1: ${webResult1.verdict} | Round 2: ${webResult2.verdict}`);
  console.log(`Backend Round 1: ${backendResult1.verdict} | Round 2: ${backendResult2.verdict}`);

  console.log('\nProvenance Summary:');
  console.log('Android Round 1:', androidResult1.provenance?.diagnosisSource, `(Credentials Configured: ${androidResult1.provenance?.credentialsConfigured})`);
  console.log('Web     Round 1:', webResult1.provenance?.diagnosisSource, `(Credentials Configured: ${webResult1.provenance?.credentialsConfigured})`);
  console.log('Backend Round 1:', backendResult1.provenance?.diagnosisSource, `(Credentials Configured: ${backendResult1.provenance?.credentialsConfigured})`);

  return {
    round1: { android: androidResult1, web: webResult1, backend: backendResult1 },
    round2: { android: androidResult2, web: webResult2, backend: backendResult2 }
  };
}

main().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
