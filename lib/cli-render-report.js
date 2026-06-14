#!/usr/bin/env node
/**
 * @fileoverview 辅助 CLI：读取 report-data.json，渲染 Markdown / HTML 报告
 *
 * 用法:
 *   node lib/cli-render-report.js <report-data.json> <output.md> <output.html>
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderMarkdown } from './render-markdown.js';
import { renderHtml } from './render-html.js';

async function main() {
  const args = process.argv.slice(2);
  const [reportDataPath, mdOutPath, htmlOutPath] = args;

  if (!reportDataPath || !mdOutPath || !htmlOutPath) {
    console.error('用法: node cli-render-report.js <report-data.json> <output.md> <output.html>');
    process.exit(1);
  }

  const reportData = JSON.parse(await fs.readFile(path.resolve(reportDataPath), 'utf-8'));

  const mdContent = renderMarkdown(reportData);
  const htmlContent = await renderHtml(reportData);

  const resolvedMd = path.resolve(mdOutPath);
  const resolvedHtml = path.resolve(htmlOutPath);

  await fs.writeFile(resolvedMd, mdContent, 'utf-8');
  await fs.mkdir(path.dirname(resolvedHtml), { recursive: true });
  await fs.writeFile(resolvedHtml, htmlContent, 'utf-8');

  console.log(`[cli-render-report] 输出:`);
  console.log(`  ${resolvedMd}`);
  console.log(`  ${resolvedHtml}`);
}

main().catch((err) => {
  console.error(`[cli-render-report] 错误: ${err.message}`);
  process.exit(1);
});
