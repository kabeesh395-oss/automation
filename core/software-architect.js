/**
 * JARVIS Software Architect Stage (Phase 4 AI-Driven)
 * 
 * Synthesizes product requirements into a technical architecture contract (architecture.json)
 * using AI-driven technology selection and component modeling.
 */

import { validateArchitecture } from './protocol/validator.js';
import { getAIProvider } from './ai/provider.js';
import { buildArchitecturePrompt } from './ai/prompt-builder.js';
import * as logger from './logger.js';

export async function designArchitecture(requirements, options = {}) {
  logger.logPlan(`[Software Architect] Designing architecture for target: ${requirements.target_platform}`);

  const provider = options.aiProvider || getAIProvider(options);
  const { systemPrompt, userPrompt } = buildArchitecturePrompt(requirements);

  const architecture = await provider.generateStructured({
    systemPrompt,
    userPrompt,
    schemaValidator: validateArchitecture,
    context: { stage: 'architecture', requirements }
  });

  architecture.created_at = architecture.created_at || new Date().toISOString();

  // Normalize build commands if missing
  if (!architecture.build_configuration) {
    architecture.build_configuration = {
      tool: architecture.platform === 'android' ? 'gradle' : 'npm',
      target_version: architecture.platform === 'android' ? '34' : 'node-20',
      build_command: architecture.platform === 'android' ? (process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug') : 'npm run build',
      test_command: architecture.platform === 'android' ? (process.platform === 'win32' ? '.\\gradlew.bat testDebugUnitTest' : './gradlew testDebugUnitTest') : 'npm test'
    };
  }

  // Validate architecture schema
  const validation = validateArchitecture(architecture);
  if (!validation.valid) {
    throw new Error(`Architecture contract validation failed: ${validation.errors.join('; ')}`);
  }

  return architecture;
}
