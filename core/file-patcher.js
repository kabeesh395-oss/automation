/**
 * JARVIS Safe File Patch Protocol
 * 
 * Safely validates, applies, and audits AI-generated file system changes.
 * Enforces strict boundaries against path traversal and protected file modification.
 */

import { existsSync, writeFileSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, isAbsolute, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as logger from './logger.js';

const PROTECTED_PATTERNS = [
  /^\.git(?:[\\/]|$)/i,
  /\.env(?:[.\w]*)$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /^node_modules[\\/]/i
];

export class FilePatchSecurityError extends Error {
  constructor(message, path = '') {
    super(message);
    this.name = 'FilePatchSecurityError';
    this.targetPath = path;
  }
}

/**
 * Validates whether a file path is safe to modify within the workspace.
 */
export function validateSafePath(targetPath, workspaceDir) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new FilePatchSecurityError('Invalid or empty file path');
  }

  const normalizedWorkspace = resolve(workspaceDir);
  const resolvedTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(workspaceDir, targetPath);

  // Check path traversal outside workspace
  const rel = relative(normalizedWorkspace, resolvedTarget);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new FilePatchSecurityError(`Path traversal rejected: "${targetPath}" is outside workspace "${workspaceDir}"`, targetPath);
  }

  // Check protected patterns
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(rel) || pattern.test(targetPath)) {
      throw new FilePatchSecurityError(`Modification of protected file rejected: "${targetPath}" matches security rule`, targetPath);
    }
  }

  return resolvedTarget;
}

/**
 * Computes SHA-256 hash of a file or content string.
 */
export function computeContentHash(content) {
  return createHash('sha256').update(content || '').digest('hex');
}

/**
 * Safely applies an array of structured changes.
 * 
 * Input shape:
 * {
 *   changes: [
 *     { path: "relative/path/to/file.ext", operation: "create"|"modify"|"delete", content: "..." }
 *   ]
 * }
 */
export function applyFileChanges(changeSet, workspaceDir) {
  if (!changeSet || !Array.isArray(changeSet.changes)) {
    throw new Error('Invalid changeSet: changes must be an array');
  }

  const normalizedWorkspace = resolve(workspaceDir);
  const auditLog = {
    workspace: normalizedWorkspace,
    timestamp: new Date().toISOString(),
    applied: [],
    errors: []
  };

  for (const change of changeSet.changes) {
    const rawPath = change.path;
    const op = (change.operation || 'create').toLowerCase();
    const content = change.content ?? '';

    try {
      const safePath = validateSafePath(rawPath, normalizedWorkspace);
      const relPath = relative(normalizedWorkspace, safePath);

      let beforeHash = null;
      if (existsSync(safePath)) {
        beforeHash = computeContentHash(readFileSync(safePath, 'utf-8'));
      }

      if (op === 'delete') {
        if (existsSync(safePath)) {
          unlinkSync(safePath);
          auditLog.applied.push({
            path: relPath,
            operation: 'delete',
            beforeHash,
            afterHash: null,
            success: true
          });
        }
      } else {
        // create or modify
        const dir = dirname(safePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(safePath, content, 'utf-8');
        const afterHash = computeContentHash(content);

        auditLog.applied.push({
          path: relPath,
          operation: op,
          beforeHash,
          afterHash,
          sizeBytes: Buffer.byteLength(content, 'utf-8'),
          success: true
        });
      }
    } catch (err) {
      auditLog.errors.push({
        path: rawPath,
        operation: op,
        error: err.message
      });
      logger.logError(`File patch error on [${rawPath}]: ${err.message}`);
    }
  }

  const success = auditLog.errors.length === 0 && auditLog.applied.length > 0;
  return { success, auditLog };
}
