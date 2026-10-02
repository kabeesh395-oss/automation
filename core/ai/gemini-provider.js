/**
 * JARVIS Gemini AI Provider
 * 
 * Interacts with Google Gemini REST API.
 * Reads API key from GEMINI_API_KEY or GOOGLE_API_KEY environment variables (with Windows User-env fallback).
 * Enforces structured schema validation, key redaction, bounded retries, and verified model fallback.
 * 
 * Configurable via GEMINI_MODEL and GEMINI_FALLBACK_MODELS.
 * Defaults only to verified active models:
 *   Primary:  gemini-3.5-flash
 *   Fallback: gemini-3.5-flash-lite, gemini-3.8-flash
 */

import { execSync } from 'node:child_process';
import { BaseAIProvider, AICredentialsMissingError, AIProviderError } from './base-provider.js';
import { parseStructuredResponse } from './response-parser.js';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function resolveApiKey(explicitKey) {
  if (explicitKey !== undefined && explicitKey !== null) {
    return explicitKey.trim().length > 0 ? explicitKey.trim() : null;
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim().length > 0) {
    return process.env.GOOGLE_API_KEY.trim();
  }
  if (process.platform === 'win32') {
    try {
      const regKey = execSync('powershell.exe -NoProfile -NonInteractive -Command "[Environment]::GetEnvironmentVariable(\'GEMINI_API_KEY\', \'User\')"', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (regKey && regKey.length > 0) return regKey;
    } catch {}
  }
  return null;
}

function redactKey(text, key) {
  if (!text || !key) return text;
  return text.split(key).join('[REDACTED_API_KEY]');
}

export class GeminiAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super(options);
    this.apiKey = resolveApiKey(options.apiKey);
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    this.fallbackModels = options.fallbackModels || (
      process.env.GEMINI_FALLBACK_MODELS
        ? process.env.GEMINI_FALLBACK_MODELS.split(',').map(s => s.trim()).filter(Boolean)
        : ['gemini-3.5-flash-lite', 'gemini-3.8-flash']
    );
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = options.timeoutMs || 60000;
    this.activeModel = this.model;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async _executeWithRetryAndFallback(payloadBuilder) {
    if (!this.isConfigured()) {
      throw new AICredentialsMissingError('gemini');
    }

    const modelsToTry = [this.model, ...this.fallbackModels.filter(m => m !== this.model)];
    let lastError = null;

    for (const currentModel of modelsToTry) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const url = `${this.baseUrl}/models/${currentModel}:generateContent?key=${this.apiKey}`;
        const payload = payloadBuilder(currentModel);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(this.timeoutMs)
          });

          if (response.ok) {
            const data = await response.json();
            this.activeModel = currentModel;
            return { data, modelUsed: currentModel };
          }

          const errBody = await response.text();
          const safeErr = redactKey(errBody, this.apiKey);
          lastError = new AIProviderError(`Gemini API error for model ${currentModel} (HTTP ${response.status}): ${safeErr}`);

          // Retry on transient status codes
          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
            const delayMs = Math.min(1000 * Math.pow(2, attempt), 3000) + Math.floor(Math.random() * 300);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          }

          // If non-retryable or retries exhausted for this model, move to next fallback model
          break;
        } catch (fetchErr) {
          if (fetchErr instanceof AICredentialsMissingError) throw fetchErr;
          const safeMsg = redactKey(fetchErr.message, this.apiKey);
          lastError = new AIProviderError(`Gemini request failed for model ${currentModel}: ${safeMsg}`, fetchErr);

          if (attempt < this.maxRetries) {
            const delayMs = Math.min(1000 * Math.pow(2, attempt), 2000);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          }
          break;
        }
      }
    }

    throw lastError || new AIProviderError('All configured Gemini models and retries failed.');
  }

  async generateStructured({ systemPrompt, userPrompt, schema = null, schemaValidator = null, context = {} }) {
    const { data, modelUsed } = await this._executeWithRetryAndFallback(() => ({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        responseMimeType: 'application/json'
      }
    }));

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new AIProviderError(`Gemini API (${modelUsed}) returned empty candidate content`, data);
    }

    return parseStructuredResponse(rawText, schemaValidator);
  }

  async generateText({ systemPrompt, userPrompt, context = {} }) {
    const { data, modelUsed } = await this._executeWithRetryAndFallback(() => ({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.95
      }
    }));

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new AIProviderError(`Gemini API (${modelUsed}) returned empty candidate text`);
    }

    return rawText.trim();
  }
}
