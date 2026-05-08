#!/usr/bin/env node
/**
 * Scans all .md files under docs/ for relative Markdown links and
 * verifies that each linked file exists. Exits with code 1 if any
 * broken links are found; exits with code 0 otherwise.
 *
 * Rules:
 *   - Only checks relative links (ignores http/https/anchor-only).
 *   - Strips anchor fragments before checking file existence.
 *   - Ignores links inside fenced code blocks.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');

function findMarkdownFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function stripCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, match => ' '.repeat(match.length));
}

function extractRelativeLinks(content, filePath) {
  const cleaned = stripCodeBlocks(content);
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const links = [];
  let m;
  while ((m = linkRegex.exec(cleaned)) !== null) {
    const target = m[2].trim();
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
      continue;
    }
    const withoutAnchor = target.includes('#') ? target.slice(0, target.indexOf('#')) : target;
    if (!withoutAnchor) continue;
    links.push({ target: withoutAnchor, raw: target });
  }
  return links;
}

const files = findMarkdownFiles(DOCS_DIR);
const broken = [];

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const links = extractRelativeLinks(content, file);
  for (const { target, raw } of links) {
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      broken.push({
        file: file.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
        link: raw,
      });
    }
  }
}

if (broken.length > 0) {
  console.error(`\nBroken document links found (${broken.length}):\n`);
  for (const b of broken) {
    console.error(`  ${b.file}\n    → ${b.link}`);
  }
  console.error('');
  process.exit(1);
} else {
  console.log(`✓ All links valid across ${files.length} document files.`);
}
