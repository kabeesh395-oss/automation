/**
 * JARVIS Product Analyst Stage (Phase 4 AI-Driven)
 * 
 * Transforms natural-language app ideas into structured requirements (requirements.json)
 * and detailed human-readable product specifications (product_spec.md) using AI.
 */

import { validateRequirements } from './protocol/validator.js';
import { getAIProvider } from './ai/provider.js';
import { buildProductAnalysisPrompt } from './ai/prompt-builder.js';
import * as logger from './logger.js';

export async function analyzeProduct(userRequest, options = {}) {
  logger.logPlan(`[Product Analyst] Analyzing idea: "${userRequest}"`);

  const provider = options.aiProvider || getAIProvider(options);
  const { systemPrompt, userPrompt } = buildProductAnalysisPrompt(userRequest);

  const requirements = await provider.generateStructured({
    systemPrompt,
    userPrompt,
    schemaValidator: validateRequirements,
    context: { stage: 'analysis', userRequest }
  });

  // Ensure mandatory fields exist and are normalized
  requirements.app_name = (requirements.app_name || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
  requirements.created_at = requirements.created_at || new Date().toISOString();

  // Validate structured contract
  const validation = validateRequirements(requirements);
  if (!validation.valid) {
    throw new Error(`Requirements contract validation failed: ${validation.errors.join('; ')}`);
  }

  // Generate markdown specification (product_spec.md)
  const productSpecMd = generateProductSpecMarkdown(requirements);

  return { requirements, productSpecMd };
}

export function generateProductSpecMarkdown(req) {
  return `# Product Specification: ${req.app_name}

**Target Platform:** ${(req.target_platform || 'android').toUpperCase()}  
**Generated At:** ${req.created_at || new Date().toISOString()}  

---

## 1. Problem Statement & Objective
${req.problem_statement || 'No problem statement provided.'}

## 2. Target Users
${(req.target_users || []).map(u => `- ${u}`).join('\n') || '- General users'}

## 3. Core Features
${(req.core_features || []).map(f => `### ${f.name} (\`${f.id}\`)
- **Type:** ${f.source || 'explicit'} (${(f.priority || 'must').toUpperCase()})
- **Description:** ${f.description || ''}
- **Acceptance Criteria:**
${(f.acceptance_criteria || []).map(ac => `  - ${ac}`).join('\n')}
`).join('\n')}

## 4. Non-Functional Requirements
${(req.non_functional_requirements || []).map(nf => `- **${nf.name}:** ${nf.description}`).join('\n')}

## 5. Data & Persistence Strategy
- **Persistence Model:** ${req.data_requirements?.persistence || 'in_memory'}
- **Entities:** ${(req.data_requirements?.entities || []).join(', ') || 'None'}

## 6. Authentication & Security
- **Authentication Required:** ${req.auth_requirements?.required ? 'Yes' : 'No'} (${req.auth_requirements?.strategy || 'none'})
- **Constraints:** ${(req.constraints || []).join('; ') || 'Standard toolchain constraints'}

## 7. Assumptions & Unresolved Questions
- **Assumptions:** ${(req.assumptions || []).join('; ') || 'None'}
- **Unresolved Questions:** ${(req.unresolved_questions || []).join('; ') || 'None'}

## 8. Acceptance & Verification Criteria
${(req.acceptance_criteria || []).map(ac => `- [ ] ${ac}`).join('\n')}
`;
}
