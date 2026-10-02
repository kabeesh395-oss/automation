/**
 * Test candidate models directly against Google Gemini v1beta endpoint.
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

async function verifyModels() {
  const apiKey = resolveKey();
  if (!apiKey) {
    console.error('No API key found.');
    process.exit(1);
  }

  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash'
  ];

  console.log('Testing candidate models for generateContent support...');

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ role: 'user', parts: [{ text: 'Return JSON: {"status": "ok"}' }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const elapsed = Date.now() - start;

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`[PASS] ${model} - HTTP ${res.status} (${elapsed}ms) - Output: ${text.trim()}`);
      } else {
        const err = await res.text();
        const msg = JSON.parse(err).error?.message || err.slice(0, 100);
        console.log(`[FAIL] ${model} - HTTP ${res.status} (${elapsed}ms) - ${msg.slice(0, 80)}`);
      }
    } catch (e) {
      console.log(`[ERROR] ${model} - ${e.message}`);
    }
  }
}

verifyModels();
