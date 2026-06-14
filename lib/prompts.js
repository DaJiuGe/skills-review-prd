/**
 * @fileoverview Prompt 构建函数
 *
 * 每轮调用 LLM 前，通过对应函数生成结构化 prompt。
 * 输入包括 PRD 分块、已有术语、前几轮输出等。
 */

/**
 * @typedef {Object} PrdChunk
 * @property {string} section_title
 * @property {number} approximate_line
 * @property {string} content
 */

/**
 * @typedef {Object} SourceLocation
 * @property {string} section_title
 * @property {number} paragraph_index
 * @property {number} approximate_line
 * @property {string} quote
 */

/**
 * @typedef {Object} TermEntry
 * @property {string} id
 * @property {string} term
 * @property {string[]} aliases
 * @property {string} [definition]
 * @property {SourceLocation[]} source_location
 * @property {string} [domain_category]
 */

/**
 * @typedef {Object} ExistingTerm
 * @property {string} source
 * @property {string} name
 * @property {string} [definition]
 */

/**
 * 格式化 PRD 分块为 prompt 文本。
 * @param {PrdChunk[]} chunks
 * @returns {string}
 */
function formatChunks(chunks) {
  if (!chunks || chunks.length === 0) return '（无分块）';
  return chunks
    .map(
      (c, idx) =>
        `--- 分块 ${idx + 1} ---\n标题: ${c.section_title}\n起始行: ${c.approximate_line}\n\n${c.content}`
    )
    .join('\n\n');
}

/**
 * 格式化已有术语库。
 * @param {ExistingTerm[]} existingTerms
 * @returns {string}
 */
function formatExistingTerms(existingTerms) {
  if (!existingTerms || existingTerms.length === 0) return '（空）';
  return existingTerms
    .map((t) => `- [${t.source}] ${t.name}${t.definition ? `: ${t.definition}` : ''}`)
    .join('\n');
}

/**
 * 构建 Round 1 prompt：领域术语表提取。
 *
 * @param {Object} params
 * @param {string} params.prdTitle
 * @param {PrdChunk[]} params.prdChunks
 * @param {ExistingTerm[]} params.existingTerms
 * @returns {string}
 */
export function buildRound1Prompt({ prdTitle, prdChunks, existingTerms }) {
  return `[Round 1] 领域术语表提取

你是一名资深领域驱动设计（DDD）架构师，擅长从 PRD 中提取并规范化领域术语。

任务：阅读以下 Markdown PRD，提取所有领域术语，输出符合 Round1_TerminologyExtraction schema 的 JSON。

输入：
- PRD 标题: ${prdTitle}
- PRD 内容（按章节分块）:
${formatChunks(prdChunks)}

已有术语库（可能为空）:
${formatExistingTerms(existingTerms)}

要求：
1. term 使用单数、首字母大写的英文名词；中文 PRD 可同时给出中文标准名与英文别名。
2. aliases 收录 PRD 中出现的同义词、缩写、大小写变体。
3. 每个术语必须附带至少一个 source_location，包含 section_title、paragraph_index、approximate_line、quote。
4. domain_category 仅允许 core / supporting / generic / unknown。
5. 标记术语冲突：alias_overlap（别名重叠）、homonym（一词多义）、inconsistent_definition（定义不一致）、external_conflict（与已有术语库冲突）。
6. 输出必须是合法 JSON，不要 Markdown 代码块，不要解释。

输出 schema: Round1_TerminologyExtraction（见 schema-design.md §3）。

示例片段：
{
  "version": "1.0",
  "round": 1,
  "prd_metadata": { "title": "...", "total_sections": 5, "estimated_lines": 320 },
  "terms": [...],
  "conflicts": [...],
  "summary": { "total_terms": 24, "new_terms": 18, "conflict_count": 2 }
}`;
}

/**
 * 构建 Round 2 prompt：EventStorming 元素提取。
 *
 * @param {Object} params
 * @param {string} params.prdContent
 * @param {TermEntry[]} params.round1Terms
 * @returns {string}
 */
export function buildRound2Prompt({ prdContent, round1Terms }) {
  const termsText =
    round1Terms && round1Terms.length > 0
      ? round1Terms.map((t) => `- ${t.id}: ${t.term} (${t.aliases.join(', ')})`).join('\n')
      : '（无）';

  return `[Round 2] EventStorming 元素提取

你是一名 EventStorming facilitator 和 DDD 架构师。

任务：基于以下 PRD 和 Round 1 术语表，提取事件、命令、聚合、策略、读模型、外部系统、热点风险。

输入：
- PRD 内容:
${prdContent}

- Round 1 术语表:
${termsText}

要求：
1. 事件名必须是“过去时 + 名词”，如 OrderPlaced、PaymentConfirmed。
2. 命令名必须是动词开头，如 PlaceOrder、ConfirmPayment。
3. 聚合只描述高层次职责与不变量，不要展开字段/方法。
4. 每个元素通过 term_ids 引用 Round 1 的术语 ID。
5. trigger / outcome 必须显式建立事件-命令-策略因果链。
6. HotSpot 标记 PRD 中模糊、缺失、冲突或技术风险点。
7. 输出合法 JSON，不要解释。

输出 schema: Round2_EventStormingElements（见 schema-design.md §4）。`;
}

/**
 * 构建 Round 3 prompt：一致性检查与异常检测。
 *
 * @param {Object} params
 * @param {TermEntry[]} params.round1Terms
 * @param {Object} params.round2Elements
 * @returns {string}
 */
export function buildRound3Prompt({ round1Terms, round2Elements }) {
  return `[Round 3] 一致性检查与异常检测

你是一名软件架构评审师。

任务：基于 Round 1 术语表和 Round 2 EventStorming 元素，运行一致性检查，识别异常并输出统一问题列表。

输入：
- Round 1 术语:
${JSON.stringify(round1Terms, null, 2)}

- Round 2 元素:
${JSON.stringify(round2Elements, null, 2)}

检查项：
1. 孤儿事件：没有明确触发源（command/policy/external_system/time/event）的事件。
2. 缺失命令：PRD 描述用户/系统可操作行为，但未提取到对应命令。
3. 术语冲突：别名重叠、一词多义、定义不一致。
4. 聚合边界模糊：职责/数据/生命周期/团队归属重叠。
5. 循环依赖：事件-策略-命令-事件形成闭环。
6. Saga / 长流程编排：事件链长度 >= 3 且跨聚合或跨外部系统的长事务候选，检查关键事件是否缺失补偿事件。
7. 性能风险：高频事件聚合、同步外部 API 调用、热读模型、过大聚合。

输出要求：
- 计算 metrics: event_command_ratio、aggregate_count、external_system_count、policy_density。
- checks 必须包含 saga_candidates、missing_compensations、performance_risks 字段。
- 每个问题使用统一 Issue 结构（id, severity, category, title, description, related_element_ids, suggested_action）。
- 复核 Round 2 的 HotSpot，给出 confirmed / mitigated / false_positive。
- 输出合法 JSON，不要解释。

输出 schema: Round3_ConsistencyCheck（见 schema-design.md §5）。`;
}

/**
 * 构建 Round 4 prompt：报告生成。
 *
 * @param {Object} params
 * @param {Object} params.round1Summary
 * @param {Object} params.round2Elements
 * @param {import('./anomalies.js').Issue[]} params.round3Issues
 * @returns {string}
 */
export function buildRound4Prompt({ round1Summary, round2Elements, round3Issues }) {
  return `[Round 4] 报告生成

你是一名技术负责人，需要把 EventStorming 评审结果整理为面向架构师的报告输入。

任务：基于前三轮输出，生成终端摘要、Mermaid 图、术语热力图数据和执行摘要。

输入：
- Round 1 summary: ${JSON.stringify(round1Summary, null, 2)}
- Round 2 元素: ${JSON.stringify(round2Elements, null, 2)}
- Round 3 问题列表: ${JSON.stringify(round3Issues, null, 2)}

输出要求：
1. mermaid_sequence_diagram: 使用 sequenceDiagram 语法，优先展示高 business_value 事件，低价值事件可折叠注释。
2. mermaid_boundary_diagram: 使用 graph TB 语法，按 core / supporting / generic / external 分组子图。
3. term_heatmap_data: 以章节为行、术语为列，给出 consistency_score（0.0~1.0）和 variant_used。
4. review_summary: 3 句话执行摘要、≤5 条关键发现、按优先级分组的建议行动、overall_risk（low/medium/high/critical）。
5. report_metadata: generated_at（ISO 8601）、prd_title、total_issues、各严重度计数。
6. 输出合法 JSON，不要解释。

  输出 schema: Round4_ReportGeneration（见 schema-design.md §6）。`;
}
