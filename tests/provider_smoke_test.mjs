/**
 * Provider Smoke Test
 * 
 * Exercises the EXACT AI provider path used by core/autonomous-repair.js:
 * 1. Imports getAIProvider from core/ai/provider.js
 * 2. Checks provider, model, and configured status
 * 3. Calls generateStructured() with schema
 * 4. Reports API success/failure and active model used
 * 
 * NEVER prints API keys.
 */

import { getAIProvider } from '../core/ai/provider.js';

async function runSmokeTest() {
  console.log('--- JARVIS PROVIDER SMOKE TEST ---');

  const provider = getAIProvider({ forceNew: true });
  const providerName = provider.constructor.name;
  const configured = provider.isConfigured();
  const configuredModel = provider.model;
  const fallbackModels = provider.fallbackModels || [];

  console.log(`Provider: ${providerName}`);
  console.log(`Configured: ${configured}`);
  console.log(`Configured Model: ${configuredModel}`);
  console.log(`Fallback Models: ${JSON.stringify(fallbackModels)}`);

  if (!configured) {
    console.error('FAILED: Provider is not configured (API key missing).');
    process.exit(1);
  }

  const start = Date.now();
  try {
    const result = await provider.generateStructured({
      systemPrompt: 'You are an autonomous software engineering assistant. Always respond with valid JSON.',
      userPrompt: 'Generate a JSON object confirming provider health with fields: status (string "ok"), timestamp (ISO string), model (string).',
      context: { stage: 'smoke_test' }
    });

    const duration = Date.now() - start;
    console.log(`API Result: SUCCESS (${duration}ms)`);
    console.log(`Active Model Used: ${provider.activeModel || configuredModel}`);
    console.log(`Output:`, JSON.stringify(result));

    if (result && result.status === 'ok') {
      console.log('✓ Smoke test PASSED: Real generateStructured call succeeded.');
      return;
    } else {
      console.error('FAILED: Output did not contain expected status "ok".');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`API Result: FAILURE (${Date.now() - start}ms)`);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

runSmokeTest();
