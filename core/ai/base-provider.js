/**
 * JARVIS Base AI Provider & Error Classes
 */

export class AICredentialsMissingError extends Error {
  constructor(providerName = 'gemini') {
    super(`AI provider credentials missing for [${providerName}]. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.`);
    this.name = 'AICredentialsMissingError';
    this.status = 'BLOCKED';
  }
}

export class AIProviderError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'AIProviderError';
    this.originalError = originalError;
  }
}

/**
 * Base AI Provider Abstract Class
 */
export class BaseAIProvider {
  constructor(options = {}) {
    this.options = options;
  }

  isConfigured() {
    return false;
  }

  async generateStructured({ systemPrompt, userPrompt, schema = null, schemaValidator = null, context = {} }) {
    throw new Error('generateStructured() must be implemented by subclass');
  }

  async generateText({ systemPrompt, userPrompt, context = {} }) {
    throw new Error('generateText() must be implemented by subclass');
  }
}
