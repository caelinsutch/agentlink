import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  cleanMergedDir,
  getMergedDir,
  mergeAgentsMd,
  mergeDirectory,
  mergeDirectoryChain,
  mergeMarkdownChain,
  mergeMarkdownFiles,
} from '../src/core/merge.js';
import { makeTempDir, writeFile } from './helpers.js';

const SEPARATOR = '\n\n---\n\n';

describe('getMergedDir', () => {
  test('returns merged subdirectory path', () => {
    const agentsRoot = '/path/to/.agents';
    const mergedDir = getMergedDir(agentsRoot);

    expect(mergedDir).toBe('/path/to/.agents/merged');
  });
});

describe('mergeMarkdownFiles', () => {
  test('returns empty string when both files do not exist', async () => {
    const tmpDir = await makeTempDir('merge-md-');
    const parent = path.join(tmpDir, 'parent.md');
    const child = path.join(tmpDir, 'child.md');

    const result = await mergeMarkdownFiles(parent, child);

    expect(result).toBe('');
  });

  test('returns child content when parent does not exist', async () => {
    const tmpDir = await makeTempDir('merge-md-');
    const parent = path.join(tmpDir, 'parent.md');
    const child = path.join(tmpDir, 'child.md');
    await writeFile(child, '# Child Content');

    const result = await mergeMarkdownFiles(parent, child);

    expect(result).toBe('# Child Content');
  });

  test('returns parent content when child does not exist', async () => {
    const tmpDir = await makeTempDir('merge-md-');
    const parent = path.join(tmpDir, 'parent.md');
    const child = path.join(tmpDir, 'child.md');
    await writeFile(parent, '# Parent Content');

    const result = await mergeMarkdownFiles(parent, child);

    expect(result).toBe('# Parent Content');
  });

  test('merges parent and child with separator', async () => {
    const tmpDir = await makeTempDir('merge-md-');
    const parent = path.join(tmpDir, 'parent.md');
    const child = path.join(tmpDir, 'child.md');
    await writeFile(parent, '# Parent\n\nParent content');
    await writeFile(child, '# Child\n\nChild content');

    const result = await mergeMarkdownFiles(parent, child);

    expect(result).toBe(`# Parent\n\nParent content${SEPARATOR}# Child\n\nChild content`);
  });

  test('trims whitespace around separator', async () => {
    const tmpDir = await makeTempDir('merge-md-');
    const parent = path.join(tmpDir, 'parent.md');
    const child = path.join(tmpDir, 'child.md');
    await writeFile(parent, '# Parent\n\n\n\n');
    await writeFile(child, '\n\n\n# Child');

    const result = await mergeMarkdownFiles(parent, child);

    expect(result).toBe(`# Parent${SEPARATOR}# Child`);
  });
});

describe('mergeMarkdownChain', () => {
  test('returns empty string for empty chain', async () => {
    const result = await mergeMarkdownChain([]);

    expect(result).toBe('');
  });

  test('returns single file content for chain of one', async () => {
    const tmpDir = await makeTempDir('merge-chain-');
    const file = path.join(tmpDir, 'file.md');
    await writeFile(file, '# Single File');

    const result = await mergeMarkdownChain([file]);

    expect(result).toBe('# Single File');
  });

  test('skips non-existent files', async () => {
    const tmpDir = await makeTempDir('merge-chain-');
    const file1 = path.join(tmpDir, 'file1.md');
    const file2 = path.join(tmpDir, 'file2.md');
    const file3 = path.join(tmpDir, 'file3.md');
    await writeFile(file1, '# File 1');
    await writeFile(file3, '# File 3');
    // file2 does not exist

    const result = await mergeMarkdownChain([file1, file2, file3]);

    expect(result).toBe(`# File 1${SEPARATOR}# File 3`);
  });

  test('skips empty files', async () => {
    const tmpDir = await makeTempDir('merge-chain-');
    const file1 = path.join(tmpDir, 'file1.md');
    const file2 = path.join(tmpDir, 'file2.md');
    const file3 = path.join(tmpDir, 'file3.md');
    await writeFile(file1, '# File 1');
    await writeFile(file2, '   \n\n   ');
    await writeFile(file3, '# File 3');

    const result = await mergeMarkdownChain([file1, file2, file3]);

    expect(result).toBe(`# File 1${SEPARATOR}# File 3`);
  });

  test('merges multiple files in order', async () => {
    const tmpDir = await makeTempDir('merge-chain-');
    const files = [path.join(tmpDir, 'a.md'), path.join(tmpDir, 'b.md'), path.join(tmpDir, 'c.md')];
    await writeFile(files[0]!, '# A');
    await writeFile(files[1]!, '# B');
    await writeFile(files[2]!, '# C');

    const result = await mergeMarkdownChain(files);

    expect(result).toBe(`# A${SEPARATOR}# B${SEPARATOR}# C`);
  });

  test('returns empty string when all files are missing', async () => {
    const tmpDir = await makeTempDir('merge-chain-');
    const files = [path.join(tmpDir, 'missing1.md'), path.join(tmpDir, 'missing2.md')];

    const result = await mergeMarkdownChain(files);

    expect(result).toBe('');
  });
});

describe('mergeDirectory', () => {
  test('copies child only when behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(parentDir, { recursive: true });
    await fs.promises.mkdir(childDir, { recursive: true });
    await writeFile(path.join(parentDir, 'parent.txt'), 'parent');
    await writeFile(path.join(childDir, 'child.txt'), 'child');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'override',
    });

    expect(fs.existsSync(path.join(outputDir, 'child.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'parent.txt'))).toBe(false);
  });

  test('copies parent only when behavior is inherit', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(parentDir, { recursive: true });
    await fs.promises.mkdir(childDir, { recursive: true });
    await writeFile(path.join(parentDir, 'parent.txt'), 'parent');
    await writeFile(path.join(childDir, 'child.txt'), 'child');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'inherit',
    });

    expect(fs.existsSync(path.join(outputDir, 'parent.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'child.txt'))).toBe(false);
  });

  test('merges both directories when behavior is extend', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(parentDir, { recursive: true });
    await fs.promises.mkdir(childDir, { recursive: true });
    await writeFile(path.join(parentDir, 'parent.txt'), 'parent');
    await writeFile(path.join(childDir, 'child.txt'), 'child');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'extend',
    });

    expect(fs.existsSync(path.join(outputDir, 'parent.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'child.txt'))).toBe(true);
  });

  test('child overwrites parent files with same name on extend', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(parentDir, { recursive: true });
    await fs.promises.mkdir(childDir, { recursive: true });
    await writeFile(path.join(parentDir, 'shared.txt'), 'parent version');
    await writeFile(path.join(childDir, 'shared.txt'), 'child version');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'extend',
    });

    const content = await fs.promises.readFile(path.join(outputDir, 'shared.txt'), 'utf8');
    expect(content).toBe('child version');
  });

  test('handles nested directories on extend', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await writeFile(path.join(parentDir, 'sub', 'parent-nested.txt'), 'parent');
    await writeFile(path.join(childDir, 'sub', 'child-nested.txt'), 'child');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'extend',
    });

    expect(fs.existsSync(path.join(outputDir, 'sub', 'parent-nested.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'sub', 'child-nested.txt'))).toBe(true);
  });

  test('handles missing parent directory on extend', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'missing-parent');
    const childDir = path.join(tmpDir, 'child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(childDir, { recursive: true });
    await writeFile(path.join(childDir, 'child.txt'), 'child');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'extend',
    });

    expect(fs.existsSync(path.join(outputDir, 'child.txt'))).toBe(true);
  });

  test('handles missing child directory on extend', async () => {
    const tmpDir = await makeTempDir('merge-dir-');
    const parentDir = path.join(tmpDir, 'parent');
    const childDir = path.join(tmpDir, 'missing-child');
    const outputDir = path.join(tmpDir, 'output');

    await fs.promises.mkdir(parentDir, { recursive: true });
    await writeFile(path.join(parentDir, 'parent.txt'), 'parent');

    await mergeDirectory({
      parentDir,
      childDir,
      outputDir,
      behavior: 'extend',
    });

    expect(fs.existsSync(path.join(outputDir, 'parent.txt'))).toBe(true);
  });
});

describe('mergeDirectoryChain', () => {
  test('returns null when no directories exist', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const paths = [path.join(tmpDir, 'a', '.agents'), path.join(tmpDir, 'b', '.agents')];

    const result = await mergeDirectoryChain({
      agentsPaths: paths,
      currentRoot: paths[0]!,
      resource: 'commands',
      behavior: 'extend',
    });

    expect(result).toBeNull();
  });

  test('returns current directory when behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'cmd.md'), '# Current');
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'override',
    });

    expect(result).toBe(path.join(currentRoot, 'commands'));
  });

  test('returns null when current has no resource and behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'override',
    });

    expect(result).toBeNull();
  });

  test('returns first available directory when behavior is inherit', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');
    const globalRoot = path.join(tmpDir, 'global', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    // current has no commands
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent');
    await writeFile(path.join(globalRoot, 'commands', 'cmd.md'), '# Global');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot, globalRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'inherit',
    });

    expect(result).toBe(path.join(parentRoot, 'commands'));
  });

  test('returns single directory without merging when only one exists', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'extend',
    });

    expect(result).toBe(path.join(parentRoot, 'commands'));
  });

  test('creates merged directory when multiple directories exist and behavior is extend', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'local.md'), '# Local');
    await writeFile(path.join(parentRoot, 'commands', 'parent.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'extend',
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'commands'));
    expect(fs.existsSync(path.join(result!, 'local.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'parent.md'))).toBe(true);
  });

  test('child files override parent files with same name on extend', async () => {
    const tmpDir = await makeTempDir('merge-chain-dir-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'cmd.md'), '# Local Override');
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent Original');
    await writeFile(path.join(parentRoot, 'commands', 'other.md'), '# Parent Other');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'extend',
    });

    const cmdContent = await fs.promises.readFile(path.join(result!, 'cmd.md'), 'utf8');
    expect(cmdContent).toBe('# Local Override');
    expect(fs.existsSync(path.join(result!, 'other.md'))).toBe(true);
  });
});

describe('mergeAgentsMd', () => {
  test('returns null when no AGENTS.md or CLAUDE.md exists', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');
    await fs.promises.mkdir(currentRoot, { recursive: true });
    await fs.promises.mkdir(parentRoot, { recursive: true });

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'extend',
    });

    expect(result).toBeNull();
  });

  test('returns CLAUDE.md when it exists and behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'CLAUDE.md'), '# Claude');
    await writeFile(path.join(currentRoot, 'AGENTS.md'), '# Agents');
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent Agents');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'override',
    });

    expect(result).toBe(path.join(currentRoot, 'CLAUDE.md'));
  });

  test('returns AGENTS.md when CLAUDE.md does not exist and behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'AGENTS.md'), '# Agents');
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent Agents');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'override',
    });

    expect(result).toBe(path.join(currentRoot, 'AGENTS.md'));
  });

  test('returns null when current has no file and behavior is override', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');
    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent Agents');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'override',
    });

    expect(result).toBeNull();
  });

  test('returns first found file when behavior is inherit', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');
    const globalRoot = path.join(tmpDir, 'global', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent');
    await writeFile(path.join(globalRoot, 'CLAUDE.md'), '# Global Claude');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot, globalRoot],
      currentRoot,
      behavior: 'inherit',
    });

    expect(result).toBe(path.join(parentRoot, 'AGENTS.md'));
  });

  test('prefers CLAUDE.md over AGENTS.md when both exist in inherit mode', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'CLAUDE.md'), '# Claude');
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Agents');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'inherit',
    });

    expect(result).toBe(path.join(parentRoot, 'CLAUDE.md'));
  });

  test('returns single file without merging when only one exists on extend', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'extend',
    });

    expect(result).toBe(path.join(parentRoot, 'AGENTS.md'));
  });

  test('creates merged AGENTS.md when multiple files exist and behavior is extend', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');
    const globalRoot = path.join(tmpDir, 'global', '.agents');

    await writeFile(path.join(currentRoot, 'AGENTS.md'), '# Current');
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent');
    await writeFile(path.join(globalRoot, 'AGENTS.md'), '# Global');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot, globalRoot],
      currentRoot,
      behavior: 'extend',
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'AGENTS.md'));

    const content = await fs.promises.readFile(result!, 'utf8');
    // Files are reversed (global first, then parent, then current)
    expect(content).toContain('# Global');
    expect(content).toContain('# Parent');
    expect(content).toContain('# Current');
    expect(content).toContain('---');
  });

  test('merges CLAUDE.md and AGENTS.md from different levels', async () => {
    const tmpDir = await makeTempDir('merge-agents-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'CLAUDE.md'), '# Current Claude');
    await writeFile(path.join(parentRoot, 'AGENTS.md'), '# Parent Agents');

    const result = await mergeAgentsMd({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      behavior: 'extend',
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'AGENTS.md'));

    const content = await fs.promises.readFile(result!, 'utf8');
    expect(content).toContain('# Parent Agents');
    expect(content).toContain('# Current Claude');
  });
});

describe('mergeDirectoryChain - compose behavior', () => {
  test('returns null when no includeList and no current directory', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'cmd.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: [],
    });

    expect(result).toBeNull();
  });

  test('returns current directory when includeList is empty but current exists', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'local.md'), '# Local');
    await writeFile(path.join(parentRoot, 'commands', 'parent.md'), '# Parent');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: [],
    });

    expect(result).toBe(path.join(currentRoot, 'commands'));
  });

  test('includes only specified items from parent', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Build');
    await writeFile(path.join(parentRoot, 'commands', 'deploy.md'), '# Deploy');
    await writeFile(path.join(parentRoot, 'commands', 'test.md'), '# Test');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: ['build.md', 'test.md'],
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'commands'));
    expect(fs.existsSync(path.join(result!, 'build.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'test.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'deploy.md'))).toBe(false);
  });

  test('includes selected parent items plus all current items', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'local.md'), '# Local');
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Build');
    await writeFile(path.join(parentRoot, 'commands', 'deploy.md'), '# Deploy');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: ['build.md'],
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'commands'));
    expect(fs.existsSync(path.join(result!, 'build.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'local.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'deploy.md'))).toBe(false);
  });

  test('current items override included parent items with same name', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await writeFile(path.join(currentRoot, 'commands', 'build.md'), '# Local Build');
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Parent Build');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: ['build.md'],
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'commands'));
    const content = await fs.promises.readFile(path.join(result!, 'build.md'), 'utf8');
    expect(content).toBe('# Local Build');
  });

  test('handles skill directories with trailing slash in includeList', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'skills', 'shared-skill', 'SKILL.md'), '# Shared');
    await writeFile(path.join(parentRoot, 'skills', 'deprecated-skill', 'SKILL.md'), '# Deprecated');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'skills',
      behavior: 'compose',
      includeList: ['shared-skill/'],
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'skills'));
    expect(fs.existsSync(path.join(result!, 'shared-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'deprecated-skill'))).toBe(false);
  });

  test('skips items in includeList that do not exist in parents', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await writeFile(path.join(parentRoot, 'commands', 'build.md'), '# Build');

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: ['build.md', 'nonexistent.md'],
    });

    expect(result).toBe(path.join(currentRoot, 'merged', 'commands'));
    expect(fs.existsSync(path.join(result!, 'build.md'))).toBe(true);
    expect(fs.existsSync(path.join(result!, 'nonexistent.md'))).toBe(false);
  });

  test('returns null when includeList has items but none exist in parents', async () => {
    const tmpDir = await makeTempDir('merge-compose-');
    const currentRoot = path.join(tmpDir, 'current', '.agents');
    const parentRoot = path.join(tmpDir, 'parent', '.agents');

    await fs.promises.mkdir(currentRoot, { recursive: true });
    await fs.promises.mkdir(path.join(parentRoot, 'commands'), { recursive: true });

    const result = await mergeDirectoryChain({
      agentsPaths: [currentRoot, parentRoot],
      currentRoot,
      resource: 'commands',
      behavior: 'compose',
      includeList: ['nonexistent.md'],
    });

    expect(result).toBeNull();
  });
});

describe('cleanMergedDir', () => {
  test('removes merged directory if it exists', async () => {
    const tmpDir = await makeTempDir('clean-merged-');
    const agentsRoot = path.join(tmpDir, '.agents');
    const mergedDir = path.join(agentsRoot, 'merged');

    await writeFile(path.join(mergedDir, 'test.md'), 'test');
    expect(fs.existsSync(mergedDir)).toBe(true);

    await cleanMergedDir(agentsRoot);

    expect(fs.existsSync(mergedDir)).toBe(false);
  });

  test('does nothing if merged does not exist', async () => {
    const tmpDir = await makeTempDir('clean-merged-');
    const agentsRoot = path.join(tmpDir, '.agents');
    await fs.promises.mkdir(agentsRoot, { recursive: true });

    // Should not throw
    await cleanMergedDir(agentsRoot);

    expect(fs.existsSync(path.join(agentsRoot, 'merged'))).toBe(false);
  });

  test('removes nested content in merged', async () => {
    const tmpDir = await makeTempDir('clean-merged-');
    const agentsRoot = path.join(tmpDir, '.agents');
    const mergedDir = path.join(agentsRoot, 'merged');

    await writeFile(path.join(mergedDir, 'commands', 'deep', 'cmd.md'), 'test');
    await writeFile(path.join(mergedDir, 'AGENTS.md'), 'agents');

    await cleanMergedDir(agentsRoot);

    expect(fs.existsSync(mergedDir)).toBe(false);
  });
});
