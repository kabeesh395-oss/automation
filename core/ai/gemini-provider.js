/**
 * JARVIS Gemini AI Provider
 * 
 * Interacts with Google Gemini REST API.
 * Reads API key from GEMINI_API_KEY or GOOGLE_API_KEY environment variables.
 * Enforces structured schema validation and non-silent error handling.
 */

import { BaseAIProvider, AICredentialsMissingError, AIProviderError } from './base-provider.js';
import { parseStructuredResponse } from './response-parser.js';

export class GeminiAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super(options);
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    this.model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = options.timeoutMs || 60000;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateStructured({ systemPrompt, userPrompt, schema = null, schemaValidator = null, context = {} }) {
    if (!this.isConfigured()) {
      throw new AICredentialsMissingError('gemini');
    }

    const payload = {
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
    };

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new AIProviderError(`Gemini API error (HTTP ${response.status}): ${errBody}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new AIProviderError('Gemini API returned empty candidate content', data);
      }

      return parseStructuredResponse(rawText, schemaValidator);
    } catch (err) {
      if (err instanceof AICredentialsMissingError) throw err;
      throw new AIProviderError(`Gemini structured generation failed: ${err.message}`, err);
    }
  }

  async generateText({ systemPrompt, userPrompt, context = {} }) {
    if (!this.isConfigured()) {
      throw new AICredentialsMissingError('gemini');
    }

    const payload = {
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
    };

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new AIProviderError(`Gemini API error (HTTP ${response.status}): ${errBody}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new AIProviderError('Gemini API returned empty candidate text');
      }

      return rawText.trim();
    } catch (err) {
      if (err instanceof AICredentialsMissingError) throw err;
      throw new AIProviderError(`Gemini text generation failed: ${err.message}`, err);
    }
  }
}
