import fs from 'fs';
import path from 'path';
import { pathExists } from '../utils/fs.js';
import { applyLinkPlan } from './apply.js';
import { createBackupSession, finalizeBackup } from './backup.js';
import { getEffectiveChain } from './monorepo.js';
import { resolveMonorepoRoots } from './paths.js';
import { buildMonorepoLinkPlan } from './plan.js';
import type { Client, InheritanceChain } from './types.js';

export type WatchOptions = {
  chain: InheritanceChain;
  clients: Client[];
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
};

type WatchState = {
  watchers: fs.FSWatcher[];
  isProcessing: boolean;
  pendingRebuild: boolean;
  aborted: boolean;
};

const WATCHED_PATTERNS = ['AGENTS.md', 'CLAUDE.md', 'config.yaml', 'commands', 'hooks', 'skills'];

function formatTime(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

function shouldWatch(filename: string): boolean {
  if (!filename) return false;

  for (const pattern of WATCHED_PATTERNS) {
    if (filename === pattern || filename.startsWith(`${pattern}${path.sep}`)) {
      return true;
    }
  }

  return false;
}

async function getWatchablePaths(chain: InheritanceChain): Promise<string[]> {
  const effectiveChain = getEffectiveChain(chain);
  const watchPaths: string[] = [];

  for (const agentsPath of effectiveChain) {
    if (await pathExists(agentsPath)) {
      watchPaths.push(agentsPath);
    }
  }

  return watchPaths;
}

async function regenerateMergedContent(
  chain: InheritanceChain,
  clients: Client[],
  log: (msg: string) => void
): Promise<void> {
  const roots = resolveMonorepoRoots({ scope: 'monorepo', chain });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const plan = await buildMonorepoLinkPlan({ chain, clients });

  if (plan.changes.length === 0) {
    log(`[${formatTime()}] No changes to apply.`);
    return;
  }

  const backup = await createBackupSession({
    canonicalRoot: roots.canonicalRoot,
    scope: 'project',
    operation: 'watch-rebuild',
    timestamp,
  });

  try {
    const result = await applyLinkPlan(plan, { backup, force: true });
    await finalizeBackup(backup);
    log(`[${formatTime()}] Done. Applied ${result.applied} link(s).`);
  } catch (err) {
    log(`[${formatTime()}] Error applying changes: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

function createDebounce(delay: number): (fn: () => void) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (fn: () => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

export async function startWatch(opts: WatchOptions): Promise<() => void> {
  const { chain, clients, onLog, onError } = opts;

  const log = onLog ?? ((msg: string) => console.log(msg));
  const logError = onError ?? ((err: Error) => console.error(err.message));

  const state: WatchState = {
    watchers: [],
    isProcessing: false,
    pendingRebuild: false,
    aborted: false,
  };

  const debounce = createDebounce(100);

  const handleChange = async (agentsPath: string, filename: string | null) => {
    if (state.aborted) return;
    if (!filename || !shouldWatch(filename)) return;

    const relativePath = path.join(path.basename(agentsPath), filename);
    log(`[${formatTime()}] Change detected: ${relativePath}`);
    log(`[${formatTime()}] Regenerating merged content...`);

    if (state.isProcessing) {
      state.pendingRebuild = true;
      return;
    }

    state.isProcessing = true;

    try {
      await regenerateMergedContent(chain, clients, log);
    } catch (err) {
      if (err instanceof Error) {
        logError(err);
      }
    } finally {
      state.isProcessing = false;

      if (state.pendingRebuild && !state.aborted) {
        state.pendingRebuild = false;
        log(`[${formatTime()}] Processing queued changes...`);
        await regenerateMergedContent(chain, clients, log);
      }
    }
  };

  const watchPaths = await getWatchablePaths(chain);

  if (watchPaths.length === 0) {
    throw new Error('No .agents folders found to watch');
  }

  for (const agentsPath of watchPaths) {
    try {
      const watcher = fs.watch(agentsPath, { recursive: true }, (_eventType, filename) => {
        debounce(() => handleChange(agentsPath, filename));
      });

      watcher.on('error', (err) => {
        logError(new Error(`Watch error on ${agentsPath}: ${err.message}`));
      });

      state.watchers.push(watcher);
    } catch (err) {
      logError(new Error(`Failed to watch ${agentsPath}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  log(`Watching for changes... (Ctrl+C to stop)`);
  log(`Monitored folders:`);
  for (const watchPath of watchPaths) {
    log(`  - ${watchPath}`);
  }

  const cleanup = () => {
    state.aborted = true;
    for (const watcher of state.watchers) {
      try {
        watcher.close();
      } catch {
        // Ignore errors during cleanup
      }
    }
    state.watchers = [];
  };

  return cleanup;
}

export function setupGracefulShutdown(cleanup: () => void, onExit?: () => void): void {
  const exitHandler = () => {
    cleanup();
    onExit?.();
    process.exit(0);
  };

  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message);
    cleanup();
    process.exit(1);
  });
}
