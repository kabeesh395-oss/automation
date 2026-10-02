/**
 * JARVIS Git Operations
 * 
 * Safe git operations with preflight checks.
 * Never force-pushes, never touches protected branches directly.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logGit, logError } from './logger.js';

const PROTECTED_BRANCHES = new Set(['main', 'master']);

/** Run a git command and return stdout */
function git(args, cwd) {
  try {
    const result = execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output: result.trim() };
  } catch (err) {
    return { ok: false, output: err.stderr?.trim() || err.message };
  }
}

/** Check if the given directory is a git repo */
export function isGitRepo(cwd) {
  if (cwd && existsSync(join(cwd, '.git'))) return true;
  const result = git('rev-parse --is-inside-work-tree', cwd);
  return result.ok && result.output === 'true';
}

/** Initialize a git repo if not already one */
export function initRepo(cwd) {
  if (isGitRepo(cwd)) {
    logGit('Repository already initialized');
    return true;
  }
  const result = git('init', cwd);
  if (result.ok) {
    logGit('Initialized git repository');
    // Create development branch
    git('checkout -b development', cwd);
    logGit('Created and switched to development branch');
  }
  return result.ok;
}

/** Get current branch name */
export function getCurrentBranch(cwd) {
  const result = git('rev-parse --abbrev-ref HEAD', cwd);
  return result.ok ? result.output : null;
}

/** Check if on a protected branch */
export function isProtectedBranch(cwd) {
  const branch = getCurrentBranch(cwd);
  return branch ? PROTECTED_BRANCHES.has(branch) : false;
}

/** Get git status summary */
export function getStatus(cwd) {
  const status = git('status --porcelain', cwd);
  const branch = getCurrentBranch(cwd);
  const headResult = git('rev-parse --short HEAD', cwd);

  return {
    branch,
    head: headResult.ok ? headResult.output : null,
    dirty: status.ok && status.output.length > 0,
    changes: status.ok ? status.output.split('\n').filter(Boolean) : [],
  };
}

/** Get recent commits */
export function getRecentCommits(cwd, count = 10) {
  const result = git(`log --oneline -n ${count}`, cwd);
  if (!result.ok) return [];
  return result.output.split('\n').filter(Boolean);
}

/** Get diff summary */
export function getDiffSummary(cwd) {
  const staged = git('diff --cached --stat', cwd);
  const unstaged = git('diff --stat', cwd);
  return {
    staged: staged.ok ? staged.output : '',
    unstaged: unstaged.ok ? unstaged.output : '',
  };
}

/** Create and switch to a feature branch */
export function createFeatureBranch(name, cwd) {
  const branchName = `feature/${name}`;
  // Make sure we're on development first
  const current = getCurrentBranch(cwd);
  if (current !== 'development') {
    const checkout = git('checkout development', cwd);
    if (!checkout.ok) {
      // Development might not exist yet, create it
      git('checkout -b development', cwd);
    }
  }
  const result = git(`checkout -b ${branchName}`, cwd);
  if (result.ok) {
    logGit(`Created feature branch: ${branchName}`);
  } else {
    // Branch might already exist
    const switchResult = git(`checkout ${branchName}`, cwd);
    if (switchResult.ok) {
      logGit(`Switched to existing feature branch: ${branchName}`);
    } else {
      logError(`Failed to create/switch to branch ${branchName}: ${result.output}`);
      return false;
    }
  }
  return true;
}

/** Stage and commit changes */
export function commitChanges(message, cwd) {
  // Stage all changes
  const addResult = git('add -A', cwd);
  if (!addResult.ok) {
    logError(`Failed to stage changes: ${addResult.output}`);
    return false;
  }

  // Check if there's anything to commit
  const status = git('status --porcelain', cwd);
  if (!status.output || status.output.trim() === '') {
    logGit('Nothing to commit');
    return true;
  }

  const commitResult = git(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
  if (commitResult.ok) {
    logGit(`Committed: ${message}`);
    return true;
  } else {
    logError(`Commit failed: ${commitResult.output}`);
    return false;
  }
}

/** Full preflight check — returns object with all git context */
export function preflight(cwd) {
  const isRepo = isGitRepo(cwd);
  if (!isRepo) {
    return {
      ok: false,
      isRepo: false,
      reason: 'Not a git repository',
    };
  }

  const status = getStatus(cwd);
  const isProtected = isProtectedBranch(cwd);
  const commits = getRecentCommits(cwd);

  if (isProtected) {
    logGit(`WARNING: On protected branch ${status.branch}. Refusing to operate.`);
    return {
      ok: false,
      isRepo: true,
      reason: `On protected branch: ${status.branch}`,
      status,
    };
  }

  logGit(`Preflight OK — branch: ${status.branch}, dirty: ${status.dirty}, commits: ${commits.length}`);
  return {
    ok: true,
    isRepo: true,
    status,
    commits,
    diff: getDiffSummary(cwd),
  };
}

/** Stash any uncommitted changes to preserve user work */
export function stashUserChanges(cwd) {
  const status = getStatus(cwd);
  if (!status.dirty) return false;
  const result = git('stash push -m "jarvis-autostash"', cwd);
  if (result.ok) {
    logGit('Stashed user changes');
    return true;
  }
  return false;
}

/** Restore stashed changes */
export function popStash(cwd) {
  const result = git('stash pop', cwd);
  if (result.ok) {
    logGit('Restored stashed changes');
  }
  return result.ok;
}

/** Create a checkpoint commit before risky operations */
export function createCheckpoint(message, cwd) {
  // Commit any uncommitted changes first to ensure clean state
  commitChanges(`CHECKPOINT: ${message}`, cwd);
  const headResult = git('rev-parse HEAD', cwd);
  if (headResult.ok) {
    const hash = headResult.output.trim();
    logGit(`Created checkpoint: ${hash}`);
    return hash;
  }
  return null;
}

/** Hard rollback to a specific commit hash */
export function rollbackToCheckpoint(commitHash, cwd) {
  if (!commitHash) return false;
  const result = git(`reset --hard ${commitHash}`, cwd);
  if (result.ok) {
    // Also clean any untracked files generated during the failed attempt
    git('clean -fd', cwd);
    logGit(`Rolled back to checkpoint: ${commitHash}`);
    return true;
  }
  return false;
}
