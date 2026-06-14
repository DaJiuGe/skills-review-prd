/**
 * @fileoverview PRD EventStorming 评审核心 runner
 *
 * responsibilities:
 * - 解析 CLI 参数
 * - 读取 PRD、CONTEXT.md、ADR 目录
 * - 接收外部 Agent 提供的四轮数据（runner 自身不调用 LLM）
 * - schema 校验与异常检测
 * - 生成 Markdown / HTML 报告并落盘
 * - 终端输出摘要
 */

import { promises as fs } from 'fs';
import path from 'path';
import { renderMarkdown } from './render-markdown.js';
import { renderHtml } from './render-html.js';
import { detectAnomalies } from './anomalies.js';
import { closeInteractive, confirmContinue } from './interactive.js';
import {
  validateRound1,
  validateRound2,
  validateRound3,
  validateRound4,
  getStepInstructions,
} from './agent-mode.js';

const DEFAULT_OUTPUT_DIR = 'docs/reviews';

/** @typedef {import('./anomalies.js').Issue} Issue */

/**
 * 打印 Agent 模式指引。当 CLI 没有提供 --mock 且没有外部 round 数据时调用。
 */
export function printAgentInstructions() {
  const lines = [
    '',
    '============================================================',
    'review-prd 是 Agent 驱动的 Skill，本身不直接调用 LLM。',
    '请按以下步骤由调用 Agent 生成 round-1.json ~ round-4.json：',
    '',
    '0. （可选）加载已有术语：',
    '   const existingTerms = await loadExistingTerms({ context, adrDir })',
    '   这会读取 CONTEXT.md 与 docs/adr/ 中的候选术语。',
    '',
    '1. 获取 Round1 指令：',
    '   runAgentStep("Round1", { prdTitle, prdChunks, existingTerms })',
    '   用 LLM 输出 Round1_TerminologyExtraction JSON，保存为 round-1.json',
    '',
    '2. 获取 Round2 指令：',
    '   runAgentStep("Round2", { prdContent, round1 })',
    '   用 LLM 输出 Round2_EventStormingElements JSON，保存为 round-2.json',
    '',
    '3. 本地运行 Round3 异常检测：',
    '   node lib/cli-detect-anomalies.js round-1.json round-2.json ./',
    '   生成 round-3.json 与 issues.json',
    '',
    '4. 获取 Round4 指令：',
    '   runAgentStep("Round4", { round1, round2, issues })',
    '   用 LLM 输出 Round4_ReportGeneration JSON，保存为 round-4.json',
    '',
    '5. 生成报告：',
    '   调用 run(options, { round1, round2, round3, round4 })',
    '   或运行 cli-build-report-data.js + cli-render-report.js',
    '',
    '本地快速演示（使用内置 mock 数据，不调用 LLM）：',
    '   node ./index.js --mock --no-save [prd-path]',
    '',
    '完整说明见 SKILL.md 与 REFERENCE.md。',
    '============================================================',
  ];
  console.log(lines.join('\n'));
}

/**
 * @typedef {Object} RunnerOptions
 * @property {string} [prdPath]
 * @property {boolean} [interactive]
 * @property {boolean} [noSave]
 * @property {boolean} [mock]
 * @property {string} [context]
 * @property {string} [adrDir]
 * @property {string} [cwd]
 */

/**
 * @typedef {Object} RunnerResult
 * @property {string} prdPath
 * @property {string} prdTitle
 * @property {string} generatedAt
 * @property {string} overallRisk
 * @property {Object} stats
 * @property {string[]} outputFiles
 * @property {Object} roundOutputs
 */

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

/**
 * 解析命令行参数。
 * @param {string[]} argv
 * @returns {RunnerOptions}
 */
export function parseArgs(argv) {
  const options = {
    interactive: false,
    noSave: false,
    mock: false,
    context: './CONTEXT.md',
    adrDir: './docs/adr',
    cwd: process.cwd(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--interactive') {
      options.interactive = true;
    } else if (arg === '--no-save') {
      options.noSave = true;
    } else if (arg === '--mock') {
      options.mock = true;
    } else if (arg === '--context') {
      options.context = argv[++i];
    } else if (arg === '--adr-dir') {
      options.adrDir = argv[++i];
    } else if (!arg.startsWith('--')) {
      options.prdPath = arg;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// PRD / 上下文 / ADR 读取
// ---------------------------------------------------------------------------

/**
 * 定位 PRD 文件。未指定时查找当前目录唯一 .md。
 * @param {RunnerOptions} options
 * @returns {Promise<string>}
 */
async function locatePrd(options) {
  if (options.prdPath) {
    const absolute = path.isAbsolute(options.prdPath)
      ? options.prdPath
      : path.resolve(options.cwd, options.prdPath);
    try {
      await fs.access(absolute);
      return absolute;
    } catch {
      throw new Error(`PRD 文件未找到: ${options.prdPath}`);
    }
  }

  const entries = await fs.readdir(options.cwd);
  const mdFiles = entries.filter((e) => e.endsWith('.md') && !e.startsWith('.'));
  if (mdFiles.length === 0) {
    throw new Error('PRD 文件未找到: 当前目录无 Markdown 文件');
  }
  if (mdFiles.length > 1) {
    throw new Error(
      `找到多个 Markdown 文件，请指定 PRD 路径:\n${mdFiles.map((f) => `  - ${f}`).join('\n')}`
    );
  }
  return path.resolve(options.cwd, mdFiles[0]);
}

/**
 * 按 Markdown 二级标题分块，保留近似行号。
 * @param {string} content
 * @returns {{title:string, estimatedLines:number, chunks:{section_title:string, approximate_line:number, content:string}[]}}
 */
export function chunkPrdByH2(content) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  let current = { section_title: '（前言）', approximate_line: 1, content: '' };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (current.content.trim()) {
        chunks.push(current);
      }
      current = {
        section_title: match[1].trim(),
        approximate_line: i + 1,
        content: line + '\n',
      };
    } else {
      current.content += line + '\n';
    }
  }
  if (current.content.trim()) {
    chunks.push(current);
  }

  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s*/, '').trim() : '未命名 PRD';

  return {
    title,
    estimatedLines: lines.length,
    chunks,
  };
}

/**
 * 读取 CONTEXT.md（不存在则返回空）。
 * @param {RunnerOptions} options
 * @returns {Promise<{source:string, name:string, definition?:string}[]>}
 */
async function readContext(options) {
  const contextPath = path.isAbsolute(options.context)
    ? options.context
    : path.resolve(options.cwd, options.context);
  try {
    const text = await fs.readFile(contextPath, 'utf-8');
    return extractCandidateTerms(text, 'CONTEXT.md');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.warn(`[warning] 读取 CONTEXT.md 失败: ${err.message}`);
    return [];
  }
}

/**
 * 递归读取 ADR 目录下的 .md 文件。
 * @param {RunnerOptions} options
 * @returns {Promise<{source:string, name:string, definition?:string}[]>}
 */
async function readAdrDir(options) {
  const adrPath = path.isAbsolute(options.adrDir)
    ? options.adrDir
    : path.resolve(options.cwd, options.adrDir);

  /** @type {{source:string, name:string, definition?:string}[]} */
  const terms = [];
  try {
    await fs.access(adrPath);
  } catch {
    return terms;
  }

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[warning] 读取 ADR 目录失败: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const text = await fs.readFile(full, 'utf-8');
          const rel = path.relative(options.cwd, full);
          terms.push(...extractCandidateTerms(text, rel));
        } catch (err) {
          console.warn(`[warning] 读取 ADR 文件失败 ${full}: ${err.message}`);
        }
      }
    }
  }

  await walk(adrPath);
  return terms;
}

/**
 * 加载已有术语：合并 CONTEXT.md 与 docs/adr/ 中的候选术语。
 * 供 Agent 在调用 runAgentStep('Round1', ...) 前使用。
 * @param {RunnerOptions} options
 * @returns {Promise<{source:string, name:string, definition?:string}[]>}
 */
export async function loadExistingTerms(options) {
  const contextTerms = await readContext(options);
  const adrTerms = await readAdrDir(options);
  return [...contextTerms, ...adrTerms];
}

/**
 * 启发式提取候选术语：标题 + 粗体词。
 * @param {string} text
 * @param {string} source
 * @returns {{source:string, name:string, definition?:string}[]}
 */
function extractCandidateTerms(text, source) {
  const terms = [];
  const seen = new Set();

  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const name = titleMatch[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      terms.push({ source, name });
    }
  }

  const boldRegex = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = boldRegex.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.length < 2 || name.length > 30) continue;
    if (!seen.has(name)) {
      seen.add(name);
      terms.push({ source, name });
    }
  }

  return terms;
}

// ---------------------------------------------------------------------------
// 报告生成与落盘
// ---------------------------------------------------------------------------

/**
 * 生成 UTC 时间戳字符串 YYYYMMDDTHHmmssZ。
 * @returns {string}
 */
function makeTimestamp() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * 严重度计数。
 * @param {Issue[]} issues
 * @returns {{blocker:number, high:number, medium:number, low:number}}
 */
function countSeverity(issues) {
  const counts = { blocker: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    if (counts[issue.severity] !== undefined) counts[issue.severity]++;
  }
  return counts;
}

/**
 * 写入报告文件，返回实际写入路径。
 * @param {Object} params
 * @param {string} params.baseDir
 * @param {string} params.timestamp
 * @param {string} params.prdPath
 * @param {string} params.prdTitle
 * @param {Object} params.round1
 * @param {Object} params.round2
 * @param {Issue[]} params.issues
 * @param {Object} params.round4
 * @param {Object} params.roundOutputs
 * @param {boolean} noSave
 * @returns {Promise<string[]>}
 */
async function writeReports({
  baseDir,
  timestamp,
  prdPath,
  prdTitle,
  round1,
  round2,
  round3,
  issues,
  round4,
  roundOutputs,
  noSave,
}) {
  if (noSave) return [];

  const outDir = path.resolve(baseDir, `prd-review-${timestamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const mdPath = path.resolve(baseDir, `prd-review-${timestamp}.md`);
  const htmlPath = path.join(outDir, 'index.html');

  const reportData = {
    prdPath,
    prdTitle,
    generatedAt: round4?.report_metadata?.generated_at || new Date().toISOString(),
    overallRisk: round4?.review_summary?.risk_assessment?.overall_risk || 'unknown',
    summary: round4?.review_summary || {},
    round1,
    round2,
    issues,
    sagaCandidates: round3?.checks?.saga_candidates || [],
    missingCompensations: round3?.checks?.missing_compensations || [],
    performanceRisks: round3?.checks?.performance_risks || [],
    sequenceDiagram: round4?.mermaid_sequence_diagram || '',
    boundaryDiagram: round4?.mermaid_boundary_diagram || '',
    heatmap: round4?.term_heatmap_data || {
      chapters: [],
      global_average: 0,
      most_inconsistent_terms: [],
    },
    metadata: round4?.report_metadata || {},
  };

  const mdContent = renderMarkdown(reportData);
  const htmlContent = await renderHtml(reportData);

  await fs.writeFile(mdPath, mdContent, 'utf-8');
  await fs.writeFile(htmlPath, htmlContent, 'utf-8');

  // 保留原始 JSON 输出；无原始输出时将对象格式化写入
  for (let i = 1; i <= 4; i++) {
    const key = `round${i}`;
    const raw = roundOutputs[key]?.raw;
    const data = roundOutputs[key]?.data ?? (key === 'round3' ? round3 : {});
    const text = typeof raw === 'string' ? raw : JSON.stringify(data, null, 2);
    await fs.writeFile(path.join(outDir, `round-${i}.json`), text, 'utf-8');
  }

  return [mdPath, htmlPath];
}

/**
 * 打印终端摘要。
 * @param {Object} params
 */
function printSummary({
  prdPath,
  prdTitle,
  generatedAt,
  overallRisk,
  stats,
  outputFiles,
  interrupted = false,
}) {
  const title = interrupted ? 'PRD EventStorming 评审已中断' : 'PRD EventStorming 评审完成';
  const lines = [
    title,
    '============================',
    `PRD:        ${prdPath}`,
    `标题:       ${prdTitle}`,
    `生成时间:   ${generatedAt}`,
    '',
    '统计:',
    `  术语:     ${stats.totalTerms} 个（新增 ${stats.newTerms} 个，冲突 ${stats.conflicts} 处）`,
    `  事件:     ${stats.events} 个 | 命令: ${stats.commands} 个 | 聚合: ${stats.aggregates} 个 | 策略: ${stats.policies} 个 | 外部系统: ${stats.externalSystems} 个`,
    `  问题:     ${stats.totalIssues} 个（blocker ${stats.blocker} / high ${stats.high} / medium ${stats.medium} / low ${stats.low}）`,
    `  整体风险: ${overallRisk}`,
    '',
    '关键发现:',
  ];

  if (stats.keyFindings.length === 0) {
    lines.push('  （无）');
  } else {
    stats.keyFindings.forEach((finding, idx) => {
      lines.push(`  ${idx + 1}. ${finding}`);
    });
  }

  if (outputFiles.length > 0) {
    lines.push('', '报告:');
    const md = outputFiles.find((f) => f.endsWith('.md'));
    const html = outputFiles.find((f) => f.endsWith('index.html'));
    if (md) lines.push(`  Markdown: ${md}`);
    if (html) lines.push(`  HTML:     ${html}`);
  } else {
    lines.push('', '报告: --no-save 模式，未写入文件');
  }

  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 运行 PRD EventStorming 评审流程。
 *
 * 注意：本 runner 不再调用 LLM。调用方（CLI 的 --mock 模式或外部 Agent）需要
 * 提供完整的 round1~round4 数据；runner 只负责校验、异常检测与报告渲染。
 *
 * @param {RunnerOptions} [options]
 * @param {Object} [roundData]
 * @param {Object} [roundData.round1]
 * @param {Object} [roundData.round2]
 * @param {Object} [roundData.round3]
 * @param {Object} [roundData.round4]
 * @returns {Promise<RunnerResult>}
 */
export async function run(options = {}, roundData = {}) {
  /** @type {RunnerOptions} */
  const opts = {
    interactive: false,
    noSave: false,
    mock: false,
    context: './CONTEXT.md',
    adrDir: './docs/adr',
    cwd: process.cwd(),
    ...options,
  };

  const prdPath = await locatePrd(opts);
  const prdContent = await fs.readFile(prdPath, 'utf-8');
  const { title } = chunkPrdByH2(prdContent);

  // 读取 CONTEXT.md 与 ADR 目录中的候选术语，供后续 Agent 上下文使用
  const existingTerms = await loadExistingTerms(opts);
  opts.existingTerms = existingTerms;

  // 校验外部提供的轮次数据
  const requiredRounds = ['round1', 'round2', 'round3', 'round4'];
  const missingRounds = requiredRounds.filter((key) => !roundData[key]);
  if (missingRounds.length > 0) {
    const hint = opts.mock
      ? '请检查 --mock 是否正确加载了 mock 数据。'
      : '请使用 runAgentStep 生成各轮 prompt 并由 LLM 产出 round-1.json ~ round-4.json，或添加 --mock 使用内置 mock 数据运行。详见 printAgentInstructions() 输出的指引。';
    throw new Error(`缺少必需的轮次数据: ${missingRounds.join(', ')}。${hint}`);
  }

  const r1 = validateRound1(roundData.round1);
  const r2 = validateRound2(roundData.round2);
  const r3 = validateRound3(roundData.round3);
  const r4 = validateRound4(roundData.round4);

  const validationErrors = [
    ...(r1.ok ? [] : r1.errors.map((e) => `[Round1] ${e}`)),
    ...(r2.ok ? [] : r2.errors.map((e) => `[Round2] ${e}`)),
    ...(r3.ok ? [] : r3.errors.map((e) => `[Round3] ${e}`)),
    ...(r4.ok ? [] : r4.errors.map((e) => `[Round4] ${e}`)),
  ];
  if (validationErrors.length > 0) {
    throw new Error(`轮次数据校验失败:\n${validationErrors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const round1 = r1.data;
  const round2 = r2.data;
  const round4 = r4.data;

  // Round3 问题由本地规则检测生成，覆盖输入中的 round3
  const { round3, issues } = detectAnomalies(round1, round2);

  // 交互模式简化为：生成报告前询问一次
  let shouldSave = true;
  if (opts.interactive) {
    const answer = await confirmContinue('Report', { issues }, { prompt: '是否生成报告? [Y/n] ' });
    if (!answer) {
      shouldSave = false;
      console.log('[interactive] 已跳过报告生成');
    }
  }

  closeInteractive();

  const severityCounts = countSeverity(issues || []);
  const timestamp = makeTimestamp();
  const baseDir = path.resolve(opts.cwd, DEFAULT_OUTPUT_DIR);

  const roundOutputs = {
    round1: { data: round1, raw: JSON.stringify(round1, null, 2) },
    round2: { data: round2, raw: JSON.stringify(round2, null, 2) },
    round3: { data: round3, raw: JSON.stringify(round3, null, 2) },
    round4: { data: round4, raw: JSON.stringify(round4, null, 2) },
  };

  const outputFiles = await writeReports({
    baseDir,
    timestamp,
    prdPath,
    prdTitle: title,
    round1,
    round2,
    round3,
    issues: issues || [],
    round4,
    roundOutputs,
    noSave: opts.noSave || !shouldSave,
  });

  const generatedAt = round4?.report_metadata?.generated_at || new Date().toISOString();
  const overallRisk = round4?.review_summary?.risk_assessment?.overall_risk || 'unknown';

  const stats = {
    totalTerms: round1?.summary?.total_terms || (round1?.terms || []).length,
    newTerms: round1?.summary?.new_terms || 0,
    conflicts: round1?.summary?.conflict_count || (round1?.conflicts || []).length,
    events: (round2?.events || []).length,
    commands: (round2?.commands || []).length,
    aggregates: (round2?.aggregates || []).length,
    policies: (round2?.policies || []).length,
    externalSystems: (round2?.external_systems || []).length,
    totalIssues: (issues || []).length,
    ...severityCounts,
    keyFindings: (round4?.review_summary?.key_findings || []).slice(0, 5),
  };

  printSummary({
    prdPath,
    prdTitle: title,
    generatedAt,
    overallRisk,
    stats,
    outputFiles,
    interrupted: false,
  });

  return {
    prdPath,
    prdTitle: title,
    generatedAt,
    overallRisk,
    stats,
    outputFiles,
    roundOutputs,
  };
}

/**
 * Agent 模式入口：返回指定步骤的 prompt / CLI 指令 / schema 说明。
 *
 * @param {string} stepName 'Round1' | 'Round2' | 'Round3' | 'Round4' | 'Render'
 * @param {Object} ctx 当前上下文，包含 prdContent、prdChunks、round1、round2、issues 等
 * @returns {Object}
 */
export function runAgentStep(stepName, ctx = {}) {
  return getStepInstructions(stepName, ctx);
}
