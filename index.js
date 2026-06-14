#!/usr/bin/env node
/**
 * @fileoverview PRD EventStorming 评审 CLI 入口
 *
 * 用法:
 *   node index.js [prd-path] [options]
 *
 * 选项:
 *   --interactive    所有轮次数据就绪后，生成报告前询问一次
 *   --no-save        不写入文件
 *   --mock           使用内置 mock 数据运行（runner 不调用 LLM）
 *   --context path/to/CONTEXT.md
 *   --adr-dir path/to/docs/adr
 */

import { parseArgs, run, printAgentInstructions } from './lib/runner.js';
import { loadMockRounds } from './fixtures/mock-rounds/index.js';

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  try {
    const roundData = options.mock ? await loadMockRounds() : {};
    if (!options.mock && Object.keys(roundData).length === 0) {
      printAgentInstructions();
      process.exit(1);
    }
    await run(options, roundData);
    process.exit(0);
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
}

main();
