/**
 * @fileoverview Agent 模式工作流定义
 *
 * 本模块把 review-prd 的四轮流程拆成可被 OpenCode / Claude Code agent
 * 逐步执行的步骤。不包含真实 LLM 调用，只提供：
 * - 每轮应该使用的 prompt（调用 prompts.js）
 * - 期望输出的 JSON schema 说明
 * - 中间结果保存/加载说明
 * - 调用 anomalies.js 与 render 的 CLI 命令
 */

import path from 'path';
import {
  buildRound1Prompt,
  buildRound2Prompt,
  buildRound3Prompt,
  buildRound4Prompt,
} from './prompts.js';

// buildRound3Prompt 当前未在本地规则检测路径使用，但 prompts.js 仍提供统一 API
void buildRound3Prompt;

const SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// 各轮 schema 说明（给 agent 参考，用于校验输出）
// ---------------------------------------------------------------------------

export const SCHEMA_DESCRIPTIONS = {
  Round1_TerminologyExtraction: `{
  "version": "${SCHEMA_VERSION}",
  "round": 1,
  "prd_metadata": { "title": "string", "total_sections": number, "estimated_lines": number },
  "terms": [
    {
      "id": "term-001",
      "term": "EnglishTerm",
      "aliases": ["中文名"],
      "definition": "...",
      "source_location": [
        { "section_title": "...", "paragraph_index": 1, "approximate_line": 10, "quote": "..." }
      ],
      "domain_category": "core|supporting|generic|unknown",
      "first_introduced": true
    }
  ],
  "conflicts": [
    {
      "id": "conflict-001",
      "severity": "high|medium|low",
      "type": "alias_overlap|homonym|inconsistent_definition|external_conflict",
      "term_a_id": "term-001",
      "term_b_id": "term-002",
      "description": "...",
      "suggested_resolution": "..."
    }
  ],
  "summary": { "total_terms": number, "new_terms": number, "conflict_count": number }
}`,

  Round2_EventStormingElements: `{
  "version": "${SCHEMA_VERSION}",
  "round": 2,
  "dependencies": { "round1_term_ids": ["term-001"] },
  "events": [
    {
      "id": "evt-001",
      "name": "DomainEvent",
      "past_tense_verb": "...",
      "aggregate_id": "agg-001",
      "trigger": { "type": "command|policy|external_system|time|event", "source_id": "..." },
      "description": "...",
      "source_location": [...],
      "term_ids": ["term-001"],
      "business_value": "high|medium|low"
    }
  ],
  "commands": [
    { "id": "cmd-001", "name": "DoSomething", "intent": "...", "actor": "...", "target_aggregate_id": "agg-001", "term_ids": ["term-001"] }
  ],
  "aggregates": [
    { "id": "agg-001", "name": "AggregateName", "responsibilities": [...], "invariants": [...], "boundary_indicators": [...], "term_ids": ["term-001"] }
  ],
  "policies": [],
  "read_models": [
    { "id": "rm-001", "name": "ReadModelName", "consumer": "...", "data_source": "...", "events_subscribed": ["evt-001"] }
  ],
  "external_systems": [],
  "hot_spots": []
}`,

  Round3_ConsistencyCheck: `{
  "version": "${SCHEMA_VERSION}",
  "round": 3,
  "dependencies": { "round1_term_ids": [...], "round2_event_ids": [...], ... },
  "checks": {
    "orphan_events": [...],
    "missing_commands": [...],
    "term_conflicts": [...],
    "boundary_ambiguities": [...],
    "circular_dependencies": [],
    "hot_spot_reviews": [...],
    "saga_candidates": [...],
    "missing_compensations": [...],
    "performance_risks": [...]
  },
  "metrics": { "event_command_ratio": number, "aggregate_count": number, "external_system_count": number, "policy_density": number }
}`,

  Round4_ReportGeneration: `{
  "version": "${SCHEMA_VERSION}",
  "round": 4,
  "dependencies": { "round1_summary": {...}, "round2_elements": {...}, "round3_issues": [...] },
  "mermaid_sequence_diagram": "sequenceDiagram\\n...",
  "mermaid_boundary_diagram": "graph TB\\n...",
  "term_heatmap_data": { "chapters": [...], "global_average": number, "most_inconsistent_terms": [...] },
  "review_summary": {
    "executive_summary": "...",
    "key_findings": ["..."],
    "recommendations": [{ "priority": "immediate|before_implementation|ongoing", "action": "...", "related_issue_ids": [...] }],
    "risk_assessment": { "overall_risk": "low|medium|high|critical", "rationale": "..." }
  },
  "report_metadata": { "generated_at": "ISO-8601", "prd_title": "...", "total_issues": number, "blocker_count": number, "high_count": number, "medium_count": number, "low_count": number }
}`,
};

// ---------------------------------------------------------------------------
// Schema 校验（轻量，仅保证核心字段存在且类型正确）
// ---------------------------------------------------------------------------

/**
 * 校验 Round1 输出，返回 { ok, errors, data }。
 * @param {any} data
 * @returns {{ok:boolean, errors:string[], data:any}}
 */
export function validateRound1(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Round1 输出不是对象');
    data = {};
  }
  if (!Array.isArray(data.terms)) errors.push('Round1 缺少 terms 数组');
  if (!data.prd_metadata?.title) errors.push('Round1 缺少 prd_metadata.title');
  if (!data.summary || typeof data.summary !== 'object') {
    data.summary = {};
  }
  return { ok: errors.length === 0, errors, data };
}

/**
 * 校验 Round2 输出。
 * @param {any} data
 * @returns {{ok:boolean, errors:string[], data:any}}
 */
export function validateRound2(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Round2 输出不是对象');
    data = {};
  }
  if (!Array.isArray(data.events)) errors.push('Round2 缺少 events 数组');
  if (!Array.isArray(data.commands)) errors.push('Round2 缺少 commands 数组');
  if (!Array.isArray(data.aggregates)) errors.push('Round2 缺少 aggregates 数组');
  return { ok: errors.length === 0, errors, data };
}

/**
 * 校验 Round3 输出。
 * @param {any} data
 * @returns {{ok:boolean, errors:string[], data:any}}
 */
export function validateRound3(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Round3 输出不是对象');
    data = {};
  }
  if (!data.checks || typeof data.checks !== 'object') {
    data.checks = {};
  }
  return { ok: errors.length === 0, errors, data };
}

/**
 * 校验 Round4 输出。
 * @param {any} data
 * @returns {{ok:boolean, errors:string[], data:any}}
 */
export function validateRound4(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Round4 输出不是对象');
    data = {};
  }
  if (typeof data.mermaid_sequence_diagram !== 'string') {
    errors.push('Round4 缺少 mermaid_sequence_diagram');
  }
  if (typeof data.mermaid_boundary_diagram !== 'string') {
    errors.push('Round4 缺少 mermaid_boundary_diagram');
  }
  if (!data.review_summary || typeof data.review_summary !== 'object') {
    errors.push('Round4 缺少 review_summary');
  }
  return { ok: errors.length === 0, errors, data };
}

// ---------------------------------------------------------------------------
// Agent 步骤定义
// ---------------------------------------------------------------------------

export const AGENT_STEPS = [
  {
    name: 'Round1',
    description: '提取领域术语表',
    type: 'llm',
    promptBuilder: 'buildRound1Prompt',
    schema: 'Round1_TerminologyExtraction',
    outputFile: 'round-1.json',
    validator: validateRound1,
  },
  {
    name: 'Round2',
    description: '提取 EventStorming 元素',
    type: 'llm',
    promptBuilder: 'buildRound2Prompt',
    schema: 'Round2_EventStormingElements',
    outputFile: 'round-2.json',
    validator: validateRound2,
  },
  {
    name: 'Round3',
    description: '调用 anomalies.js 检测异常',
    type: 'cli',
    cli: 'node lib/cli-detect-anomalies.js <round-1.json> <round-2.json> [out-dir]',
    outputs: ['round-3.json', 'issues.json'],
  },
  {
    name: 'Round4',
    description: '生成最终报告 JSON',
    type: 'llm',
    promptBuilder: 'buildRound4Prompt',
    schema: 'Round4_ReportGeneration',
    outputFile: 'round-4.json',
    validator: validateRound4,
  },
  {
    name: 'Render',
    description: '生成 Markdown / HTML 报告',
    type: 'cli',
    cli: 'node lib/cli-build-report-data.js <round-1.json> <round-2.json> <round-3.json> <issues.json> <round-4.json> <report-data.json>',
    next: 'node lib/cli-render-report.js <report-data.json> <output.md> <output.html>',
    outputs: ['prd-review-report.md', 'index.html'],
  },
];

// ---------------------------------------------------------------------------
// 计划 / 指令生成
// ---------------------------------------------------------------------------

/**
 * 根据用户选项构建 agent 执行计划。
 * @param {Object} [options]
 * @param {string} [options.prdPath]
 * @param {string} [options.context]
 * @param {string} [options.adrDir]
 * @param {string} [options.outputDir]
 * @returns {{mode:'agent', input:Object, outputDir:string, steps:Object[]}}
 */
export function buildAgentPlan(options = {}) {
  const {
    prdPath,
    context = './CONTEXT.md',
    adrDir = './docs/adr',
    outputDir = 'docs/reviews',
  } = options;

  return {
    mode: 'agent',
    input: { prdPath, context, adrDir },
    outputDir,
    steps: AGENT_STEPS.map((s, idx) => ({
      number: idx + 1,
      name: s.name,
      description: s.description,
      type: s.type || 'llm',
      outputFile: s.outputFile,
      outputs: s.outputs,
    })),
  };
}

/**
 * 获取某一步骤的完整执行指令（prompt / CLI 命令 / schema / 保存说明）。
 * @param {string} stepName
 * @param {Object} [ctx]
 * @returns {Object}
 */
export function getStepInstructions(stepName, ctx = {}) {
  const step = AGENT_STEPS.find((s) => s.name === stepName);
  if (!step) {
    throw new Error(`Unknown agent step: ${stepName}`);
  }

  switch (stepName) {
    case 'Round1': {
      const prompt = buildRound1Prompt({
        prdTitle: ctx.prdTitle || ctx.prdMetadata?.title || '未命名 PRD',
        prdChunks: ctx.prdChunks || [],
        existingTerms: ctx.existingTerms || [],
      });
      return {
        step: 'Round1',
        description: step.description,
        type: 'llm',
        prompt,
        schemaName: step.schema,
        schema: SCHEMA_DESCRIPTIONS[step.schema],
        outputFile: step.outputFile,
        saveInstructions: `将 LLM 返回的合法 JSON 保存为 ${step.outputFile}，不要包含 Markdown 代码块或解释文本。`,
        validationInstructions:
          '检查 version/round、terms 数组、prd_metadata.title、summary 对象是否存在；使用 validateRound1 校验。',
        validator: step.validator.name,
      };
    }

    case 'Round2': {
      const prompt = buildRound2Prompt({
        prdContent: ctx.prdContent || '',
        round1Terms: ctx.round1?.terms || [],
      });
      return {
        step: 'Round2',
        description: step.description,
        type: 'llm',
        prompt,
        schemaName: step.schema,
        schema: SCHEMA_DESCRIPTIONS[step.schema],
        outputFile: step.outputFile,
        saveInstructions: `将 LLM 返回的合法 JSON 保存为 ${step.outputFile}，不要包含 Markdown 代码块或解释文本。`,
        validationInstructions:
          '检查 events、commands、aggregates 数组是否存在；term_ids 尽量引用 Round1；使用 validateRound2 校验。',
        validator: step.validator.name,
      };
    }

    case 'Round3': {
      const round1Path = ctx.round1Path || 'round-1.json';
      const round2Path = ctx.round2Path || 'round-2.json';
      const outDir = ctx.outputDir || '.';
      return {
        step: 'Round3',
        description: step.description,
        type: 'cli',
        command: `node lib/cli-detect-anomalies.js "${round1Path}" "${round2Path}" "${outDir}"`,
        outputs: ['round-3.json', 'issues.json'],
        note: '此步骤不调用 LLM，直接运行本地规则检测。输出目录会自动创建。',
      };
    }

    case 'Round4': {
      const prompt = buildRound4Prompt({
        round1Summary: ctx.round1?.summary || {},
        round2Elements: {
          events: ctx.round2?.events || [],
          commands: ctx.round2?.commands || [],
          aggregates: ctx.round2?.aggregates || [],
          policies: ctx.round2?.policies || [],
          external_systems: ctx.round2?.external_systems || [],
        },
        round3Issues: ctx.issues || [],
      });
      return {
        step: 'Round4',
        description: step.description,
        type: 'llm',
        prompt,
        schemaName: step.schema,
        schema: SCHEMA_DESCRIPTIONS[step.schema],
        outputFile: step.outputFile,
        saveInstructions: `将 LLM 返回的合法 JSON 保存为 ${step.outputFile}，不要包含 Markdown 代码块或解释文本。`,
        validationInstructions:
          '检查 mermaid_sequence_diagram、mermaid_boundary_diagram、review_summary、report_metadata 是否存在；使用 validateRound4 校验。',
        validator: step.validator.name,
      };
    }

    case 'Render': {
      const round1Path = ctx.round1Path || 'round-1.json';
      const round2Path = ctx.round2Path || 'round-2.json';
      const round3Path = ctx.round3Path || 'round-3.json';
      const issuesPath = ctx.issuesPath || 'issues.json';
      const round4Path = ctx.round4Path || 'round-4.json';
      const reportDataPath = ctx.reportDataPath || 'report-data.json';
      const mdPath = ctx.mdPath || 'prd-review-report.md';
      const htmlPath = ctx.htmlPath || path.join('prd-review-report', 'index.html');
      return {
        step: 'Render',
        description: step.description,
        type: 'cli',
        commands: [
          `node lib/cli-build-report-data.js "${round1Path}" "${round2Path}" "${round3Path}" "${issuesPath}" "${round4Path}" "${reportDataPath}"`,
          `node lib/cli-render-report.js "${reportDataPath}" "${mdPath}" "${htmlPath}"`,
        ],
        outputs: [mdPath, htmlPath],
        note: '先组装 report-data.json，再渲染 Markdown 与 HTML。',
      };
    }

    default:
      throw new Error(`Unknown agent step: ${stepName}`);
  }
}

/**
 * Agent 可调用：执行某一步骤并返回指令。
 * @param {string} stepName
 * @param {Object} [ctx]
 * @returns {Object}
 */
export function runAgentStep(stepName, ctx) {
  return getStepInstructions(stepName, ctx);
}

// ---------------------------------------------------------------------------
// 辅助 IO 函数（agent 可用于保存/加载中间 JSON）
// ---------------------------------------------------------------------------

/**
 * 将单轮输出保存为 JSON 文件。
 * @param {string} filePath
 * @param {any} data
 */
export async function saveRoundOutput(filePath, data) {
  const { promises: fs } = await import('fs');
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 读取单轮输出 JSON 文件。
 * @param {string} filePath
 * @returns {Promise<any>}
 */
export async function loadRoundOutput(filePath) {
  const { promises: fs } = await import('fs');
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

/**
 * 组装 render 需要的 report-data 对象。
 * @param {Object} params
 * @param {string} [params.prdPath]
 * @param {string} [params.prdTitle]
 * @param {Object} [params.round1]
 * @param {Object} [params.round2]
 * @param {Object} [params.round3]
 * @param {import('./anomalies.js').Issue[]} [params.issues]
 * @param {Object} [params.round4]
 * @returns {Object}
 */
export function buildReportData({ prdPath, prdTitle, round1, round2, round3, issues, round4 }) {
  return {
    prdPath: prdPath || '',
    prdTitle:
      prdTitle || round1?.prd_metadata?.title || round4?.report_metadata?.prd_title || '未命名 PRD',
    generatedAt: round4?.report_metadata?.generated_at || new Date().toISOString(),
    overallRisk: round4?.review_summary?.risk_assessment?.overall_risk || 'unknown',
    summary: round4?.review_summary || {},
    round1: round1 || {},
    round2: round2 || {},
    issues: issues || [],
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
}
