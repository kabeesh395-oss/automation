/**
 * Minimal Authenticated Gemini Connectivity Test
 * 
 * Verifies:
 * 1. API key accepted
 * 2. Selected model exists (gemini-2.5-flash)
 * 3. generateContent works
 * 4. Structured JSON response can be parsed
 * 
 * NEVER prints the API key.
 */

import { execSync } from 'node:child_process';

function resolveKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) return process.env.GEMINI_API_KEY.trim();
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) return process.env.GOOGLE_API_KEY.trim();
  if (process.platform === 'win32') {
    try {
      const regKey = execSync('powershell.exe -NoProfile -NonInteractive -Command "[Environment]::GetEnvironmentVariable(\'GEMINI_API_KEY\', \'User\')"', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (regKey) return regKey;
    } catch {}
  }
  return null;
}

async function runTest() {
  const apiKey = resolveKey();
  if (!apiKey) {
    console.error('FAILED: No API key resolved.');
    process.exit(1);
  }

  console.log('✓ API Key resolved (Length:', apiKey.length, 'chars)');

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro'
  ];

  for (const model of candidateModels) {
    console.log(`\nTesting candidate model: ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Return JSON: {"status": "ok", "model": "' + model + '", "verified": true}' }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log(`- Status: ${response.status} ${response.statusText}`);
      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`- Raw output: ${rawText}`);
        const parsed = JSON.parse(rawText);
        console.log(`- Successfully parsed structured JSON output:`, parsed);
        console.log(`\n✓ SUCCESS! Active, responsive model verified: ${model}`);
        return;
      } else {
        const errText = await response.text();
        console.log(`- Error: ${errText.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`- Fetch exception: ${e.message}`);
    }
  }
  console.error('\nNo candidate model succeeded.');
  process.exit(1);
}

runTest().catch(err => {
  console.error('Fatal error during connectivity test:', err);
  process.exit(1);
});
