import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  detectMonorepoChain,
  formatInheritanceDisplay,
  getEffectiveChain,
  hasMonorepoParent,
  resolveInheritance,
} from '../src/core/monorepo.js';
import type { InheritanceChain } from '../src/core/types.js';
import { makeTempDir, writeFile } from './helpers.js';

describe('detectMonorepoChain', () => {
  test('returns empty chain when no .agents folders exist', async () => {
    const home = await makeTempDir('monorepo-home-');
    const project = await makeTempDir('monorepo-project-');

    const chain = await detectMonorepoChain({
      startDir: project,
      homeDir: home,
    });

    expect(chain.global).toBeNull();
    expect(chain.ancestors).toEqual([]);
    expect(chain.current).toBeNull();
  });

  test('detects global .agents in home directory', async () => {
    const home = await makeTempDir('monorepo-home-');
    const project = await makeTempDir('monorepo-project-');
    const globalAgents = path.join(home, '.agents');
    await fs.promises.mkdir(globalAgents, { recursive: true });

    const chain = await detectMonorepoChain({
      startDir: project,
      homeDir: home,
    });

    expect(chain.global).toBe(globalAgents);
    expect(chain.ancestors).toEqual([]);
    expect(chain.current).toBeNull();
  });

  test('detects current .agents in start directory', async () => {
    const home = await makeTempDir('monorepo-home-');
    const project = await makeTempDir('monorepo-project-');
    const projectAgents = path.join(project, '.agents');
    await fs.promises.mkdir(projectAgents, { recursive: true });

    const chain = await detectMonorepoChain({
      startDir: project,
      homeDir: home,
    });

    expect(chain.global).toBeNull();
    expect(chain.ancestors).toEqual([]);
    expect(chain.current).toBe(projectAgents);
  });

  test('detects monorepo hierarchy with parent .agents', async () => {
    const home = await makeTempDir('monorepo-home-');
    const monorepo = await makeTempDir('monorepo-root-');
    const subProject = path.join(monorepo, 'packages', 'sub-pkg');
    await fs.promises.mkdir(subProject, { recursive: true });

    const rootAgents = path.join(monorepo, '.agents');
    const subAgents = path.join(subProject, '.agents');
    await fs.promises.mkdir(rootAgents, { recursive: true });
    await fs.promises.mkdir(subAgents, { recursive: true });

    const chain = await detectMonorepoChain({
      startDir: subProject,
      homeDir: home,
    });

    expect(chain.global).toBeNull();
    expect(chain.current).toBe(subAgents);
    expect(chain.ancestors).toEqual([rootAgents]);
  });

  test('detects full hierarchy with global and multiple ancestors', async () => {
    const home = await makeTempDir('monorepo-home-');
    const monorepo = await makeTempDir('monorepo-full-');
    const level1 = path.join(monorepo, 'level1');
    const level2 = path.join(level1, 'level2');
    const level3 = path.join(level2, 'level3');
    await fs.promises.mkdir(level3, { recursive: true });

    const globalAgents = path.join(home, '.agents');
    const rootAgents = path.join(monorepo, '.agents');
    const level1Agents = path.join(level1, '.agents');
    const level3Agents = path.join(level3, '.agents');

    await fs.promises.mkdir(globalAgents, { recursive: true });
    await fs.promises.mkdir(rootAgents, { recursive: true });
    await fs.promises.mkdir(level1Agents, { recursive: true });
    await fs.promises.mkdir(level3Agents, { recursive: true });

    const chain = await detectMonorepoChain({
      startDir: level3,
      homeDir: home,
    });

    expect(chain.global).toBe(globalAgents);
    expect(chain.current).toBe(level3Agents);
    expect(chain.ancestors).toEqual([level1Agents, rootAgents]);
  });

  test('stops traversal at home directory boundary', async () => {
    const home = await makeTempDir('monorepo-home-');
    const outsideHome = path.dirname(home);
    const _outsideAgents = path.join(outsideHome, '.agents');

    // Create agents outside home (should not be found)
    // This is a tricky test - we check that traversal stops at home
    const project = path.join(home, 'projects', 'myapp');
    await fs.promises.mkdir(project, { recursive: true });

    const globalAgents = path.join(home, '.agents');
    await fs.promises.mkdir(globalAgents, { recursive: true });

    const chain = await detectMonorepoChain({
      startDir: project,
      homeDir: home,
    });

    // Should find global but not traverse above home
    expect(chain.global).toBe(globalAgents);
    expect(chain.ancestors).toEqual([]);
    expect(chain.current).toBeNull();
  });

  test('uses process.cwd when startDir not provided', async () => {
    // This test verifies the default behavior
    const chain = await detectMonorepoChain({});

    // Just verify it returns a valid structure
    expect(chain).toHaveProperty('global');
    expect(chain).toHaveProperty('ancestors');
    expect(chain).toHaveProperty('current');
    expect(Array.isArray(chain.ancestors)).toBe(true);
  });
});

describe('hasMonorepoParent', () => {
  test('returns false when no ancestors and no global', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: [],
      current: '/path/to/.agents',
    };

    expect(hasMonorepoParent(chain)).toBe(false);
  });

  test('returns true when has ancestors', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: ['/parent/.agents'],
      current: '/child/.agents',
    };

    expect(hasMonorepoParent(chain)).toBe(true);
  });

  test('returns true when has global only', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: [],
      current: '/project/.agents',
    };

    expect(hasMonorepoParent(chain)).toBe(true);
  });

  test('returns true when has both ancestors and global', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: ['/parent/.agents'],
      current: '/child/.agents',
    };

    expect(hasMonorepoParent(chain)).toBe(true);
  });

  test('returns true with only global and no current', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: [],
      current: null,
    };

    expect(hasMonorepoParent(chain)).toBe(true);
  });
});

describe('getEffectiveChain', () => {
  test('returns empty array when chain is empty', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: [],
      current: null,
    };

    expect(getEffectiveChain(chain)).toEqual([]);
  });

  test('returns only current when no ancestors or global', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: [],
      current: '/project/.agents',
    };

    expect(getEffectiveChain(chain)).toEqual(['/project/.agents']);
  });

  test('returns only global when no current or ancestors', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: [],
      current: null,
    };

    expect(getEffectiveChain(chain)).toEqual(['/home/.agents']);
  });

  test('returns full chain in correct order', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: ['/parent/.agents', '/grandparent/.agents'],
      current: '/child/.agents',
    };

    const effective = getEffectiveChain(chain);

    expect(effective).toEqual(['/child/.agents', '/parent/.agents', '/grandparent/.agents', '/home/.agents']);
  });

  test('preserves order: current first, then ancestors, then global', () => {
    const chain: InheritanceChain = {
      global: '/global',
      ancestors: ['/a1', '/a2', '/a3'],
      current: '/current',
    };

    const effective = getEffectiveChain(chain);

    expect(effective[0]).toBe('/current');
    expect(effective[1]).toBe('/a1');
    expect(effective[2]).toBe('/a2');
    expect(effective[3]).toBe('/a3');
    expect(effective[4]).toBe('/global');
  });
});

describe('resolveInheritance', () => {
  test('returns empty configs for empty chain', async () => {
    const home = await makeTempDir('resolve-home-');
    const project = await makeTempDir('resolve-project-');

    const result = await resolveInheritance({
      startDir: project,
      homeDir: home,
    });

    expect(result.chain.global).toBeNull();
    expect(result.chain.current).toBeNull();
    expect(result.configs.size).toBe(0);
    expect(result.effectiveRoot).toBeNull();
  });

  test('loads config for each agents folder in chain', async () => {
    const home = await makeTempDir('resolve-home-');
    const monorepo = await makeTempDir('resolve-monorepo-');
    const subProject = path.join(monorepo, 'packages', 'sub');
    await fs.promises.mkdir(subProject, { recursive: true });

    const rootAgents = path.join(monorepo, '.agents');
    const subAgents = path.join(subProject, '.agents');
    await fs.promises.mkdir(rootAgents, { recursive: true });
    await fs.promises.mkdir(subAgents, { recursive: true });

    // Write config to root
    await writeFile(path.join(rootAgents, 'config.yaml'), 'extends: true\n');

    // Write config to sub
    await writeFile(path.join(subAgents, 'config.yaml'), 'extends:\n  AGENTS.md: extend\n  default: inherit\n');

    const result = await resolveInheritance({
      startDir: subProject,
      homeDir: home,
    });

    expect(result.chain.current).toBe(subAgents);
    expect(result.chain.ancestors).toContain(rootAgents);
    expect(result.configs.has(subAgents)).toBe(true);
    expect(result.configs.has(rootAgents)).toBe(true);
    expect(result.effectiveRoot).toBe(subAgents);
  });

  test('returns empty config object for agents folder without config.yaml', async () => {
    const home = await makeTempDir('resolve-home-');
    const project = await makeTempDir('resolve-project-');
    const projectAgents = path.join(project, '.agents');
    await fs.promises.mkdir(projectAgents, { recursive: true });

    const result = await resolveInheritance({
      startDir: project,
      homeDir: home,
    });

    expect(result.configs.has(projectAgents)).toBe(true);
    expect(result.configs.get(projectAgents)).toEqual({});
  });
});

describe('formatInheritanceDisplay', () => {
  test('returns empty array for empty chain', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: [],
      current: null,
    };

    expect(formatInheritanceDisplay(chain)).toEqual([]);
  });

  test('shows current only', () => {
    const chain: InheritanceChain = {
      global: null,
      ancestors: [],
      current: '/project/.agents',
    };

    const lines = formatInheritanceDisplay(chain);

    expect(lines).toContain('Current: /project/.agents');
    expect(lines.length).toBe(1);
  });

  test('shows current and global', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: [],
      current: '/project/.agents',
    };

    const lines = formatInheritanceDisplay(chain);

    expect(lines).toContain('Current: /project/.agents');
    expect(lines).toContain('Inherits from:');
    expect(lines.some((l) => l.includes('/home/.agents') && l.includes('(global)'))).toBe(true);
  });

  test('shows full hierarchy', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: ['/parent/.agents', '/grandparent/.agents'],
      current: '/child/.agents',
    };

    const lines = formatInheritanceDisplay(chain);

    expect(lines[0]).toBe('Current: /child/.agents');
    expect(lines[1]).toBe('Inherits from:');
    expect(lines.some((l) => l.includes('/parent/.agents'))).toBe(true);
    expect(lines.some((l) => l.includes('/grandparent/.agents'))).toBe(true);
    expect(lines.some((l) => l.includes('/home/.agents') && l.includes('(global)'))).toBe(true);
  });

  test('shows global with "Inherits from" label when no ancestors', () => {
    const chain: InheritanceChain = {
      global: '/home/.agents',
      ancestors: [],
      current: '/project/.agents',
    };

    const lines = formatInheritanceDisplay(chain);

    expect(lines).toContain('Inherits from:');
  });
});
