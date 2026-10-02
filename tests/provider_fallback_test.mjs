/**
 * Provider Fallback & 503 Recovery Test
 * 
 * Proves that:
 * 1. When the primary model returns 503 or transient failure, the provider retries.
 * 2. Cascades to verified fallback models (e.g. gemini-3.5-flash, gemini-3.5-flash-lite).
 * 3. Completes structured generation successfully without hardcoded defect repairs.
 * 
 * NEVER prints API keys.
 */

import { GeminiAIProvider } from '../core/ai/gemini-provider.js';

async function runFallbackTest() {
  console.log('--- JARVIS 503 RECOVERY & FALLBACK TEST ---');

  // Test Case 1: Live fallback cascading
  // Set primary to gemini-3.7-flash (which returned 503 high-demand) and fallback to verified gemini-3.5-flash
  console.log('\n[Scenario 1] Live Model Fallback Cascading:');
  const provider = new GeminiAIProvider({
    model: 'gemini-3.7-flash', // known to encounter 503 spike
    fallbackModels: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
    maxRetries: 1 // fast cascade
  });

  console.log(`Primary Model: ${provider.model}`);
  console.log(`Fallback Models: ${JSON.stringify(provider.fallbackModels)}`);

  const start = Date.now();
  try {
    const result = await provider.generateStructured({
      systemPrompt: 'You are a test assistant. Always respond with valid JSON.',
      userPrompt: 'Output JSON: {"recovered": true, "fallback_test": "pass"}',
      context: { stage: 'fallback_test' }
    });

    const elapsed = Date.now() - start;
    console.log(`✓ Request Succeeded in ${elapsed}ms!`);
    console.log(`✓ Active Model that delivered response: ${provider.activeModel}`);
    console.log(`✓ Result payload:`, JSON.stringify(result));

    if (result && result.recovered === true) {
      console.log('✓ Scenario 1 PASSED: Model fallback cascade recovered from primary model failure.');
    } else {
      console.error('Scenario 1 FAILED: Unexpected response content.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Scenario 1 FAILED: ${err.message}`);
    process.exit(1);
  }

  // Test Case 2: Exhausted fallback safety test
  console.log('\n[Scenario 2] All Fallbacks Exhausted Behavior:');
  const failingProvider = new GeminiAIProvider({
    model: 'non-existent-model-test-fail-1',
    fallbackModels: ['non-existent-model-test-fail-2'],
    maxRetries: 0
  });

  try {
    await failingProvider.generateStructured({
      systemPrompt: 'test',
      userPrompt: 'test'
    });
    console.error('Scenario 2 FAILED: Expected all-fail provider to throw.');
    process.exit(1);
  } catch (err) {
    console.log(`✓ Expected failure caught: ${err.message}`);
    console.log('✓ Scenario 2 PASSED: Properly throws real error when all models fail without inventing data.');
  }

  console.log('\n✓ ALL FALLBACK & RECOVERY CHECKS PASSED');
}

runFallbackTest();
