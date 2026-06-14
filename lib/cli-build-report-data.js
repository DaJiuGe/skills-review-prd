#!/usr/bin/env node
/**
 * @fileoverview 辅助 CLI：读取 round1~round4 + issues，组装 report-data.json
 *
 * 用法:
 *   node lib/cli-build-report-data.js \
 *     <round1.json> <round2.json> <round3.json> <issues.json> <round4.json> <report-data.json>
 */

import { promises as fs } from 'fs';
import path from 'path';
import { buildReportData } from './agent-mode.js';

async function main() {
  const args = process.argv.slice(2);
  const [round1Path, round2Path, round3Path, issuesPath, round4Path, outPath] = args;

  if (!round1Path || !round2Path || !round3Path || !issuesPath || !round4Path || !outPath) {
    console.error(
      '用法: node cli-build-report-data.js <round1.json> <round2.json> <round3.json> <issues.json> <round4.json> <report-data.json>'
    );
    process.exit(1);
  }

  const [round1, round2, round3, issues, round4] = await Promise.all(
    [round1Path, round2Path, round3Path, issuesPath, round4Path].map((p) =>
      fs.readFile(path.resolve(p), 'utf-8').then(JSON.parse)
    )
  );

  const reportData = buildReportData({
    prdPath: process.env.PRD_PATH || '',
    prdTitle: process.env.PRD_TITLE || undefined,
    round1,
    round2,
    round3,
    issues,
    round4,
  });

  const resolvedOut = path.resolve(outPath);
  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, JSON.stringify(reportData, null, 2), 'utf-8');

  console.log(`[cli-build-report-data] 输出: ${resolvedOut}`);
}

main().catch((err) => {
  console.error(`[cli-build-report-data] 错误: ${err.message}`);
  process.exit(1);
});
