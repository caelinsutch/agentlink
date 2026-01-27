import fs from 'fs';
import path from 'path';
import { ensureDir, listDirs, listFiles, pathExists, readText, writeText } from '../utils/fs.js';
import type { ExtendBehavior } from './types.js';

const MERGED_DIR = 'merged';
const SEPARATOR = '\n\n---\n\n';

export function getMergedDir(agentsRoot: string): string {
  return path.join(agentsRoot, MERGED_DIR);
}

export async function mergeMarkdownFiles(parentPath: string, childPath: string): Promise<string> {
  const parentContent = (await pathExists(parentPath)) ? await readText(parentPath) : '';
  const childContent = (await pathExists(childPath)) ? await readText(childPath) : '';

  if (!parentContent && !childContent) {
    return '';
  }

  if (!parentContent) {
    return childContent;
  }

  if (!childContent) {
    return parentContent;
  }

  return `${parentContent.trimEnd()}${SEPARATOR}${childContent.trimStart()}`;
}

export async function mergeMarkdownChain(filePaths: string[]): Promise<string> {
  let result = '';

  for (const filePath of filePaths) {
    if (!(await pathExists(filePath))) {
      continue;
    }

    const content = await readText(filePath);
    if (!content.trim()) {
      continue;
    }

    if (!result) {
      result = content;
    } else {
      result = `${result.trimEnd()}${SEPARATOR}${content.trimStart()}`;
    }
  }

  return result;
}

export type MergeDirectoryOptions = {
  parentDir: string;
  childDir: string;
  outputDir: string;
  behavior: ExtendBehavior;
};

export async function mergeDirectory(opts: MergeDirectoryOptions): Promise<void> {
  const { parentDir, childDir, outputDir, behavior } = opts;

  if (behavior === 'override') {
    if (await pathExists(childDir)) {
      await copyDirectoryContents(childDir, outputDir);
    }
    return;
  }

  if (behavior === 'inherit') {
    if (await pathExists(parentDir)) {
      await copyDirectoryContents(parentDir, outputDir);
    }
    return;
  }

  await ensureDir(outputDir);

  if (await pathExists(parentDir)) {
    await copyDirectoryContents(parentDir, outputDir);
  }

  if (await pathExists(childDir)) {
    await copyDirectoryContents(childDir, outputDir);
  }
}

async function copyDirectoryContents(srcDir: string, destDir: string): Promise<void> {
  await ensureDir(destDir);

  const files = await listFiles(srcDir);
  for (const file of files) {
    const fileName = path.basename(file);
    const destFile = path.join(destDir, fileName);
    await fs.promises.copyFile(file, destFile);
  }

  const dirs = await listDirs(srcDir);
  for (const dir of dirs) {
    const dirName = path.basename(dir);
    const destSubDir = path.join(destDir, dirName);
    await copyDirectoryContents(dir, destSubDir);
  }
}

export type MergeChainOptions = {
  agentsPaths: string[];
  currentRoot: string;
  resource: string;
  behavior: ExtendBehavior;
  includeList?: string[] | null; // Only used when behavior is 'compose'
};

export async function mergeDirectoryChain(opts: MergeChainOptions): Promise<string | null> {
  const { agentsPaths, currentRoot, resource, behavior, includeList } = opts;

  if (behavior === 'override') {
    const currentDir = path.join(currentRoot, resource);
    return (await pathExists(currentDir)) ? currentDir : null;
  }

  if (behavior === 'inherit') {
    for (const agentsPath of agentsPaths) {
      const resourceDir = path.join(agentsPath, resource);
      if (await pathExists(resourceDir)) {
        return resourceDir;
      }
    }
    return null;
  }

  if (behavior === 'compose') {
    // Compose: cherry-pick specific items from parents + all from current
    return await mergeCompose({
      agentsPaths,
      currentRoot,
      resource,
      includeList: includeList || [],
    });
  }

  // behavior === 'extend': merge all directories
  const dirsWithContent: string[] = [];
  for (const agentsPath of agentsPaths) {
    const resourceDir = path.join(agentsPath, resource);
    if (await pathExists(resourceDir)) {
      dirsWithContent.push(resourceDir);
    }
  }

  if (dirsWithContent.length === 0) {
    return null;
  }

  if (dirsWithContent.length === 1) {
    return dirsWithContent[0] ?? null;
  }

  const mergedDir = path.join(currentRoot, MERGED_DIR, resource);
  await ensureDir(mergedDir);

  for (const dir of dirsWithContent.reverse()) {
    await copyDirectoryContents(dir, mergedDir);
  }

  return mergedDir;
}

type ComposeOptions = {
  agentsPaths: string[];
  currentRoot: string;
  resource: string;
  includeList: string[];
};

async function mergeCompose(opts: ComposeOptions): Promise<string | null> {
  const { agentsPaths, currentRoot, resource, includeList } = opts;

  const currentDir = path.join(currentRoot, resource);
  const currentExists = await pathExists(currentDir);
  const parentPaths = agentsPaths.filter((p) => p !== currentRoot);

  // If no include list and no parent resources, just return current
  if (includeList.length === 0 && !currentExists) {
    return null;
  }

  if (includeList.length === 0 && currentExists) {
    return currentDir;
  }

  // Find items to include from parents
  const itemsToInclude: { name: string; sourcePath: string }[] = [];

  for (const itemName of includeList) {
    // Look through parent paths to find the item
    for (const parentPath of parentPaths) {
      const resourceDir = path.join(parentPath, resource);
      if (!(await pathExists(resourceDir))) continue;

      const isDirectory = itemName.endsWith('/');
      const cleanName = isDirectory ? itemName.slice(0, -1) : itemName;
      const itemPath = path.join(resourceDir, cleanName);

      if (await pathExists(itemPath)) {
        itemsToInclude.push({ name: cleanName, sourcePath: itemPath });
        break; // Found in this parent, stop looking
      }
    }
  }

  // If nothing to include from parents and no current, return null
  if (itemsToInclude.length === 0 && !currentExists) {
    return null;
  }

  // If nothing to include from parents but current exists, return current
  if (itemsToInclude.length === 0 && currentExists) {
    return currentDir;
  }

  // Create merged directory
  const mergedDir = path.join(currentRoot, MERGED_DIR, resource);
  await ensureDir(mergedDir);

  // Copy included items from parents first (so child can override)
  for (const item of itemsToInclude) {
    const destPath = path.join(mergedDir, item.name);
    const stat = await fs.promises.lstat(item.sourcePath);

    if (stat.isDirectory()) {
      await copyDirectoryContents(item.sourcePath, destPath);
    } else {
      await fs.promises.copyFile(item.sourcePath, destPath);
    }
  }

  // Copy all items from current (overwriting any same-named items from parents)
  if (currentExists) {
    await copyDirectoryContents(currentDir, mergedDir);
  }

  return mergedDir;
}

export async function mergeAgentsMd(opts: {
  agentsPaths: string[];
  currentRoot: string;
  behavior: ExtendBehavior;
}): Promise<string | null> {
  const { agentsPaths, currentRoot, behavior } = opts;

  if (behavior === 'override') {
    const claudePath = path.join(currentRoot, 'CLAUDE.md');
    if (await pathExists(claudePath)) return claudePath;
    const agentsPath = path.join(currentRoot, 'AGENTS.md');
    if (await pathExists(agentsPath)) return agentsPath;
    return null;
  }

  if (behavior === 'inherit') {
    for (const agentsRoot of agentsPaths) {
      const claudePath = path.join(agentsRoot, 'CLAUDE.md');
      if (await pathExists(claudePath)) return claudePath;
      const agentsPath = path.join(agentsRoot, 'AGENTS.md');
      if (await pathExists(agentsPath)) return agentsPath;
    }
    return null;
  }

  const filesToMerge: string[] = [];
  for (const agentsRoot of agentsPaths) {
    const claudePath = path.join(agentsRoot, 'CLAUDE.md');
    const agentsPath = path.join(agentsRoot, 'AGENTS.md');
    if (await pathExists(claudePath)) {
      filesToMerge.push(claudePath);
    } else if (await pathExists(agentsPath)) {
      filesToMerge.push(agentsPath);
    }
  }

  if (filesToMerge.length === 0) {
    return null;
  }

  if (filesToMerge.length === 1) {
    return filesToMerge[0] ?? null;
  }

  const mergedContent = await mergeMarkdownChain(filesToMerge.reverse());
  const mergedPath = path.join(currentRoot, MERGED_DIR, 'AGENTS.md');
  await ensureDir(path.dirname(mergedPath));
  await writeText(mergedPath, mergedContent);

  return mergedPath;
}

export async function cleanMergedDir(agentsRoot: string): Promise<void> {
  const mergedDir = getMergedDir(agentsRoot);
  if (await pathExists(mergedDir)) {
    await fs.promises.rm(mergedDir, { recursive: true, force: true });
  }
}
