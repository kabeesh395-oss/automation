/**
 * JARVIS AI Response Parser
 * 
 * Extracts and validates structured JSON from model responses.
 * Rejects malformed JSON and enforces schema compliance.
 */

export class AIResponseParseError extends Error {
  constructor(message, rawResponse = '') {
    super(message);
    this.name = 'AIResponseParseError';
    this.rawResponse = rawResponse;
  }
}

/**
 * Extract and parse JSON from a raw model text response.
 */
export function parseStructuredResponse(rawText, schemaValidator = null) {
  if (!rawText || typeof rawText !== 'string') {
    throw new AIResponseParseError('Model returned empty or non-string response', rawText);
  }

  const trimmed = rawText.trim();
  let jsonString = trimmed;

  // 1. Check for markdown code fence ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonString = fenceMatch[1].trim();
  } else {
    // Check if JSON object or array is embedded in surrounding text
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let startIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      const lastBrace = trimmed.lastIndexOf('}');
      if (lastBrace !== -1 && lastBrace > startIdx) {
        jsonString = trimmed.slice(startIdx, lastBrace + 1);
      }
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      const lastBracket = trimmed.lastIndexOf(']');
      if (lastBracket !== -1 && lastBracket > startIdx) {
        jsonString = trimmed.slice(startIdx, lastBracket + 1);
      }
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new AIResponseParseError(`Failed to parse JSON from model output: ${err.message}`, rawText);
  }

  if (typeof schemaValidator === 'function') {
    const valResult = schemaValidator(parsed);
    if (valResult && valResult.valid === false) {
      const errorMsg = Array.isArray(valResult.errors) ? valResult.errors.join('; ') : 'Schema validation failed';
      throw new AIResponseParseError(`Model output failed schema validation: ${errorMsg}`, rawText);
    }
  }

  return parsed;
}
