---
name: gemini-integration
description: >-
  Use when a project requires Gemini AI features. Handles API setup,
  prompt engineering, response parsing, evaluation, and cost management.
---

# Gemini Integration Skill

## Steps

1. **API setup** — configure Gemini API key via environment variable.
2. **Model selection** — choose model based on task (flash for speed, pro for quality).
3. **Prompt engineering** — design prompts with clear instructions, examples, and output format.
4. **Response parsing** — structured output extraction, error handling for malformed responses.
5. **Evaluation** — test prompts with diverse inputs, measure quality.
6. **Cost management** — token counting, caching, batching where possible.
7. **Fallback** — graceful degradation if API is unavailable.

## Output
- Gemini integration code
- Prompt templates
- Evaluation results
- Cost estimates

## Never
- Hardcode API keys.
- Send sensitive user data without consent.
- Trust Gemini output without validation.
- Skip rate limiting.
