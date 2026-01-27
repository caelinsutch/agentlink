import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { discoverCommands, discoverHooks, discoverParentResources, discoverSkills } from '../src/core/discover.js';
import type { InheritanceChain } from '../src/core/types.js';
import { makeTempDir, writeFile } from './helpers.js';

describe('discoverCommands', () => {
  test('returns empty array when no commands exist', async () => {
    const tmpDir = await makeTempDir('discover-');
    const chain: InheritanceChain = {
      current: path.join(tmpDir, 'current', '.agents'),
      ancestors: [],
      global: null,
    };

    await fs.promises.mkdir(chain.current!, { recursive: true });

    const commands = await discoverCommands({ chain });

    expect(commands).toEqual([]);
  });

  test('discovers commands from current .agents', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'build.md'), '# Build');
    await writeFile(path.join(currentRoot, 'commands', 'test.md'), '# Test');

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [],
      global: null,
    };

    const commands = await discoverCommands({ chain });

    expect(commands).toHaveLength(2);
    expect(commands.map((c) => c.name).sort()).toEqual(['build.md', 'test.md']);
    expect(commands[0]?.source).toBe(currentRoot);
    expect(commands[0]?.type).toBe('command');
  });

  test('discovers commands from parent .agents', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'shared.md'), '# Shared');

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [parentRoot],
      global: null,
    };

    const commands = await discoverCommands({ chain });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.name).toBe('shared.md');
    expect(commands[0]?.source).toBe(parentRoot);
  });

  test('current commands take precedence over parent commands with same name', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'build.md'), '# Current Build');
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Parent Build');
    await writeFile(path.join(parentRoot, 'commands', 'deploy.md'), '# Parent Deploy');

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [parentRoot],
      global: null,
    };

    const commands = await discoverCommands({ chain });

    expect(commands).toHaveLength(2);
    const buildCmd = commands.find((c) => c.name === 'build.md');
    expect(buildCmd?.source).toBe(currentRoot);
  });

  test('excludes current when excludeCurrent is true', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'local.md'), '# Local');
    await writeFile(path.join(parentRoot, 'commands', 'shared.md'), '# Shared');

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [parentRoot],
      global: null,
    };

    const commands = await discoverCommands({ chain, excludeCurrent: true });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.name).toBe('shared.md');
    expect(commands[0]?.source).toBe(parentRoot);
  });
});

describe('discoverSkills', () => {
  test('returns empty array when no skills exist', async () => {
    const tmpDir = await makeTempDir('discover-');
    const chain: InheritanceChain = {
      current: path.join(tmpDir, 'current', '.agents'),
      ancestors: [],
      global: null,
    };

    await fs.promises.mkdir(chain.current!, { recursive: true });

    const skills = await discoverSkills({ chain });

    expect(skills).toEqual([]);
  });

  test('discovers skill directories', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');

    await fs.promises.mkdir(path.join(currentRoot, 'skills', 'skill-a'), { recursive: true });
    await fs.promises.mkdir(path.join(currentRoot, 'skills', 'skill-b'), { recursive: true });

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [],
      global: null,
    };

    const skills = await discoverSkills({ chain });

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['skill-a/', 'skill-b/']);
    expect(skills[0]?.type).toBe('skill');
  });

  test('excludes current when excludeCurrent is true', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(path.join(currentRoot, 'skills', 'local-skill'), { recursive: true });
    await fs.promises.mkdir(path.join(parentRoot, 'skills', 'shared-skill'), { recursive: true });

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [parentRoot],
      global: null,
    };

    const skills = await discoverSkills({ chain, excludeCurrent: true });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('shared-skill/');
  });
});

describe('discoverHooks', () => {
  test('returns empty array when no hooks exist', async () => {
    const tmpDir = await makeTempDir('discover-');
    const chain: InheritanceChain = {
      current: path.join(tmpDir, 'current', '.agents'),
      ancestors: [],
      global: null,
    };

    await fs.promises.mkdir(chain.current!, { recursive: true });

    const hooks = await discoverHooks({ chain });

    expect(hooks).toEqual([]);
  });

  test('discovers hook directories', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');

    await fs.promises.mkdir(path.join(currentRoot, 'hooks', 'pre-commit'), { recursive: true });
    await fs.promises.mkdir(path.join(currentRoot, 'hooks', 'pre-push'), { recursive: true });

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [],
      global: null,
    };

    const hooks = await discoverHooks({ chain });

    expect(hooks).toHaveLength(2);
    expect(hooks.map((h) => h.name).sort()).toEqual(['pre-commit/', 'pre-push/']);
    expect(hooks[0]?.type).toBe('hook');
  });
});

describe('discoverParentResources', () => {
  test('discovers all resource types from parents', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    // Current has some resources
    await writeFile(path.join(currentRoot, 'commands', 'local.md'), '# Local');

    // Parent has various resources
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Build');
    await writeFile(path.join(parentRoot, 'commands', 'test.md'), '# Test');
    await fs.promises.mkdir(path.join(parentRoot, 'skills', 'shared-skill'), { recursive: true });
    await fs.promises.mkdir(path.join(parentRoot, 'hooks', 'pre-commit'), { recursive: true });

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [parentRoot],
      global: null,
    };

    const result = await discoverParentResources(chain);

    // Should only include parent resources (excludeCurrent is true internally)
    expect(result.commands).toHaveLength(2);
    expect(result.commands.map((c) => c.name).sort()).toEqual(['build.md', 'test.md']);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.name).toBe('shared-skill/');
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0]?.name).toBe('pre-commit/');
  });

  test('returns empty arrays when no parent resources exist', async () => {
    const tmpDir = await makeTempDir('discover-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });

    const chain: InheritanceChain = {
      current: currentRoot,
      ancestors: [],
      global: null,
    };

    const result = await discoverParentResources(chain);

    expect(result.commands).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.hooks).toEqual([]);
  });
});
