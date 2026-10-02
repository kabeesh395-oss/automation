/**
 * JARVIS AI Provider Interface & Factory
 */

import { GeminiAIProvider } from './gemini-provider.js';
import { MockAIProvider } from './mock-provider.js';
export { BaseAIProvider, AICredentialsMissingError, AIProviderError } from './base-provider.js';

let activeProviderInstance = null;

/**
 * Factory to get or instantiate the active AI Provider
 */
export function getAIProvider(options = {}) {
  const providerType = options.provider || process.env.JARVIS_AI_PROVIDER || 'gemini';

  if (providerType === 'mock') {
    return new MockAIProvider(options);
  }

  if (!activeProviderInstance || options.forceNew) {
    activeProviderInstance = new GeminiAIProvider(options);
  }

  return activeProviderInstance;
}

export function setAIProvider(provider) {
  activeProviderInstance = provider;
}
