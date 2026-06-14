/**
 * @fileoverview 交互模式支持库
 *
 * 提供：
 * - printRoundSummary(roundName, data): 打印当前轮次摘要
 * - confirmContinue(roundName, data, options?): 暂停并询问用户是否继续
 * - closeInteractive(): 关闭共享 readline 接口
 *
 * 行为：
 * - 使用 Node.js readline，兼容管道输入与 TTY
 * - y / 回车 → 继续；n → 停止
 * - Ctrl+C 优雅退出
 * - 复用单个 readline 接口并自行缓冲行，避免管道输入时行丢失
 */

import readline from 'readline';
import { stdin as input, stdout as output } from 'process';

class LineReader {
  constructor() {
    /** @type {string[]} */
    this.buffer = [];
    /** @type {((line: string) => void)|null} */
    this.pending = null;
    /** @type {boolean} */
    this.closed = false;

    this.rl = readline.createInterface({ input });
    this.rl.on('line', (line) => this._push(line));
    this.rl.on('close', () => this._close());

    process.on('SIGINT', () => this._cleanup());
  }

  /**
   * @param {string} line
   */
  _push(line) {
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve(line);
    } else {
      this.buffer.push(line);
    }
  }

  _close() {
    this.closed = true;
    if (this.pending) {
      this.pending('');
      this.pending = null;
    }
  }

  _cleanup() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    console.log('\n[interactive] 用户取消，退出');
    process.exit(0);
  }

  /**
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async question(prompt) {
    output.write(prompt);
    if (this.buffer.length > 0) {
      return this.buffer.shift();
    }
    if (this.closed) {
      return '';
    }
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  close() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

/** @type {LineReader|null} */
let lineReader = null;

function getReader() {
  if (!lineReader) {
    lineReader = new LineReader();
  }
  return lineReader;
}

/**
 * 关闭共享 readline 接口，释放 stdin。
 */
export function closeInteractive() {
  if (lineReader) {
    lineReader.close();
    lineReader = null;
  }
}

/**
 * 生成各轮次可读摘要。
 * @param {string} roundName
 * @param {any} data
 * @returns {Record<string, string|number>}
 */
function buildRoundSummary(roundName, data) {
  switch (roundName) {
    case 'Round1':
      return {
        术语总数: data?.terms?.length ?? 0,
        新增术语: data?.summary?.new_terms ?? 0,
        冲突数: data?.summary?.conflict_count ?? data?.conflicts?.length ?? 0,
      };
    case 'Round2':
      return {
        事件数: data?.events?.length ?? 0,
        命令数: data?.commands?.length ?? 0,
        聚合数: data?.aggregates?.length ?? 0,
        策略数: data?.policies?.length ?? 0,
        外部系统数: data?.external_systems?.length ?? 0,
        热点数: data?.hot_spots?.length ?? 0,
      };
    case 'Round3': {
      const issues = data?.issues || [];
      const counts = { blocker: 0, high: 0, medium: 0, low: 0 };
      for (const issue of issues) {
        if (counts[issue.severity] !== undefined) counts[issue.severity]++;
      }
      return {
        问题总数: issues.length,
        blocker: counts.blocker,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
      };
    }
    case 'Round4':
      return {
        整体风险: data?.review_summary?.risk_assessment?.overall_risk ?? 'unknown',
        关键发现数: data?.review_summary?.key_findings?.length ?? 0,
        建议数: data?.review_summary?.recommendations?.length ?? 0,
      };
    default:
      return { 状态: '完成' };
  }
}

/**
 * 打印当前轮次摘要。
 * @param {string} roundName
 * @param {any} data
 */
export function printRoundSummary(roundName, data) {
  const summary = buildRoundSummary(roundName, data);
  console.log(`\n┌── ${roundName} 摘要 ──────────`);
  for (const [label, value] of Object.entries(summary)) {
    console.log(`│ ${label}: ${value}`);
  }
  console.log('└─────────────────────────');
}

/**
 * 暂停并询问用户是否继续。
 *
 * @param {string} roundName 当前轮次名称，如 Round1 / Round2 / Round3 / Round4
 * @param {any} data 当前轮次输出数据
 * @param {Object} [options]
 * @param {string} [options.prompt] 自定义提示语
 * @returns {Promise<boolean>} true=继续，false=停止
 */
export async function confirmContinue(roundName, data, options = {}) {
  printRoundSummary(roundName, data);

  const promptText = options.prompt || `是否继续? [Y/n] `;
  const reader = getReader();
  const answer = await reader.question(promptText);
  const normalized = answer.trim().toLowerCase();
  return normalized === '' || normalized === 'y' || normalized === 'yes';
}
