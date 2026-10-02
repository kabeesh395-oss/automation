/**
 * JARVIS UX/UI Architect Stage (Phase 4 AI-Driven)
 * 
 * Generates dynamic UX specifications (ux_plan.json) for UI applications
 * or system interaction contracts for headless APIs using AI.
 */

import { validateUxPlan } from './protocol/validator.js';
import { getAIProvider } from './ai/provider.js';
import { buildUxPlanPrompt } from './ai/prompt-builder.js';
import * as logger from './logger.js';

export async function designUxPlan(requirements, architecture, options = {}) {
  logger.logPlan(`[UX Architect] Designing UX flow for ${requirements.app_name} (${architecture.platform})`);

  const provider = options.aiProvider || getAIProvider(options);
  const { systemPrompt, userPrompt } = buildUxPlanPrompt(requirements, architecture);

  const uxPlan = await provider.generateStructured({
    systemPrompt,
    userPrompt,
    schemaValidator: validateUxPlan,
    context: { stage: 'ux_plan', requirements, architecture }
  });

  uxPlan.created_at = uxPlan.created_at || new Date().toISOString();

  // Validate UX schema
  const validation = validateUxPlan(uxPlan);
  if (!validation.valid) {
    throw new Error(`UX Plan validation failed: ${validation.errors.join('; ')}`);
  }

  return uxPlan;
}
