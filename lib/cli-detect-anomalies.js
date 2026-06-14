#!/usr/bin/env node
/**
 * @fileoverview 辅助 CLI：读取 round1/round2 JSON，调用 anomalies.js 生成 round3 + issues
 *
 * 用法:
 *   node lib/cli-detect-anomalies.js <round1.json> <round2.json> [out-dir]
 *
 * 输出:
 *   - {out-dir}/round-3.json
 *   - {out-dir}/issues.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { detectAnomalies } from './anomalies.js';

async function main() {
  const args = process.argv.slice(2);
  const [round1Path, round2Path, outDirArg] = args;

  if (!round1Path || !round2Path) {
    console.error('用法: node cli-detect-anomalies.js <round1.json> <round2.json> [out-dir]');
    process.exit(1);
  }

  const outDir = outDirArg ? path.resolve(outDirArg) : path.resolve('.');

  const round1 = JSON.parse(await fs.readFile(path.resolve(round1Path), 'utf-8'));
  const round2 = JSON.parse(await fs.readFile(path.resolve(round2Path), 'utf-8'));

  const { round3, issues } = detectAnomalies(round1, round2);

  await fs.mkdir(outDir, { recursive: true });

  const round3Path = path.join(outDir, 'round-3.json');
  const issuesPath = path.join(outDir, 'issues.json');

  await fs.writeFile(round3Path, JSON.stringify(round3, null, 2), 'utf-8');
  await fs.writeFile(issuesPath, JSON.stringify(issues, null, 2), 'utf-8');

  console.log(`[cli-detect-anomalies] 输出:`);
  console.log(`  ${round3Path}`);
  console.log(`  ${issuesPath}`);
  console.log(`  发现 ${issues.length} 个问题`);
}

main().catch((err) => {
  console.error(`[cli-detect-anomalies] 错误: ${err.message}`);
  process.exit(1);
});
