import os from 'os';
import path from 'path';
import { ensureDir, pathExists, readText, writeText } from '../utils/fs.js';
import { detectMonorepoChain, hasMonorepoParent } from './monorepo.js';

export type InitScope = 'global' | 'project';

export type InitOptions = {
  scope: InitScope;
  projectRoot?: string;
  homeDir?: string;
};

export type InitResult = {
  agentsRoot: string;
  created: string[];
  skipped: string[];
  isMonorepo: boolean;
};

const AGENTS_MD_TEMPLATE = `# AGENTS.md

This file provides instructions and context for AI coding assistants.

## Project Overview

<!-- Describe your project here -->

## Code Style

<!-- Document your coding conventions -->

## Architecture

<!-- Explain the project structure and key patterns -->

## Common Tasks

<!-- List frequent development tasks and how to accomplish them -->

## Testing

<!-- Describe testing approach and how to run tests -->

## Notes

<!-- Any additional context for AI assistants -->
`;

const CONFIG_YAML_TEMPLATE = `# Monorepo configuration for .agents
# This file controls how this package inherits from parent .agents folders

# Set to true to inherit all resources from parent
# Set to false to use only local resources
# Or configure per-resource below
extends: true

# Per-resource configuration (optional)
# extends:
#   AGENTS.md: inherit   # inherit | extend | override
#   commands: inherit
#   skills: inherit
#   hooks: inherit
#   default: inherit

# Exclude patterns (optional)
# exclude:
#   - "**/*.test.md"
`;

export function resolveAgentsRoot(opts: InitOptions): string {
  const homeDir = opts.homeDir || os.homedir();
  const projectRoot = path.resolve(opts.projectRoot || process.cwd());

  if (opts.scope === 'global') {
    return path.join(homeDir, '.agents');
  }
  return path.join(projectRoot, '.agents');
}

export async function checkExistingFiles(agentsRoot: string): Promise<{
  agentsMd: boolean;
  commandsDir: boolean;
  hooksDir: boolean;
  skillsDir: boolean;
  configYaml: boolean;
}> {
  const [agentsMd, commandsDir, hooksDir, skillsDir, configYaml] = await Promise.all([
    pathExists(path.join(agentsRoot, 'AGENTS.md')),
    pathExists(path.join(agentsRoot, 'commands')),
    pathExists(path.join(agentsRoot, 'hooks')),
    pathExists(path.join(agentsRoot, 'skills')),
    pathExists(path.join(agentsRoot, 'config.yaml')),
  ]);

  return { agentsMd, commandsDir, hooksDir, skillsDir, configYaml };
}

export async function initAgentsFolder(opts: InitOptions & { createConfig?: boolean }): Promise<InitResult> {
  const agentsRoot = resolveAgentsRoot(opts);
  const created: string[] = [];
  const skipped: string[] = [];

  const existing = await checkExistingFiles(agentsRoot);

  // Ensure the .agents directory exists
  await ensureDir(agentsRoot);

  // Create AGENTS.md
  const agentsMdPath = path.join(agentsRoot, 'AGENTS.md');
  if (existing.agentsMd) {
    skipped.push('AGENTS.md');
  } else {
    await writeText(agentsMdPath, AGENTS_MD_TEMPLATE);
    created.push('AGENTS.md');
  }

  // Create commands/ directory
  const commandsPath = path.join(agentsRoot, 'commands');
  if (existing.commandsDir) {
    skipped.push('commands/');
  } else {
    await ensureDir(commandsPath);
    created.push('commands/');
  }

  // Create hooks/ directory
  const hooksPath = path.join(agentsRoot, 'hooks');
  if (existing.hooksDir) {
    skipped.push('hooks/');
  } else {
    await ensureDir(hooksPath);
    created.push('hooks/');
  }

  // Create skills/ directory
  const skillsPath = path.join(agentsRoot, 'skills');
  if (existing.skillsDir) {
    skipped.push('skills/');
  } else {
    await ensureDir(skillsPath);
    created.push('skills/');
  }

  // Create config.yaml if requested (monorepo context)
  if (opts.createConfig) {
    const configPath = path.join(agentsRoot, 'config.yaml');
    if (existing.configYaml) {
      skipped.push('config.yaml');
    } else {
      await writeText(configPath, CONFIG_YAML_TEMPLATE);
      created.push('config.yaml');
    }
  }

  // Detect if we're in a monorepo context
  const chain = await detectMonorepoChain({
    startDir: opts.scope === 'project' ? opts.projectRoot : undefined,
    homeDir: opts.homeDir,
  });
  const isMonorepo = opts.scope === 'project' && hasMonorepoParent(chain);

  return {
    agentsRoot,
    created,
    skipped,
    isMonorepo,
  };
}

export async function detectMonorepoContext(opts: { projectRoot?: string; homeDir?: string } = {}): Promise<boolean> {
  const chain = await detectMonorepoChain({
    startDir: opts.projectRoot,
    homeDir: opts.homeDir,
  });
  return hasMonorepoParent(chain);
}

export type PostinstallResult = {
  added: boolean;
  reason: 'added' | 'already-exists' | 'no-package-json' | 'parse-error';
};

export async function addPostinstallHook(projectRoot?: string): Promise<PostinstallResult> {
  const root = path.resolve(projectRoot || process.cwd());
  const packageJsonPath = path.join(root, 'package.json');

  if (!(await pathExists(packageJsonPath))) {
    return { added: false, reason: 'no-package-json' };
  }

  try {
    const content = await readText(packageJsonPath);
    const pkg = JSON.parse(content);

    if (!pkg.scripts) {
      pkg.scripts = {};
    }

    const existingPostinstall = pkg.scripts.postinstall || '';
    if (existingPostinstall.includes('agentlinker repair')) {
      return { added: false, reason: 'already-exists' };
    }

    if (existingPostinstall) {
      pkg.scripts.postinstall = `${existingPostinstall} && agentlinker repair`;
    } else {
      pkg.scripts.postinstall = 'agentlinker repair';
    }

    await writeText(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    return { added: true, reason: 'added' };
  } catch {
    return { added: false, reason: 'parse-error' };
  }
}
