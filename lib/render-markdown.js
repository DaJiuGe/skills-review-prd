/**
 * @fileoverview 将 Round1~Round4 数据渲染为 Markdown 报告字符串
 *
 * 输出结构遵循 SKILL.md §3.2。
 */

/** @typedef {import('./anomalies.js').Issue} Issue */

/**
 * @typedef {Object} ReportData
 * @property {string} prdPath
 * @property {string} prdTitle
 * @property {string} generatedAt
 * @property {string} overallRisk
 * @property {Object} summary
 * @property {Object} round1
 * @property {Object} round2
 * @property {Issue[]} issues
 * @property {Object[]} [sagaCandidates]
 * @property {Object[]} [missingCompensations]
 * @property {Object[]} [performanceRisks]
 * @property {string} sequenceDiagram
 * @property {string} boundaryDiagram
 * @property {Object} heatmap
 * @property {Object} metadata
 */

/**
 * 转义 Markdown 表格单元格中的管道符。
 * @param {string} text
 * @returns {string}
 */
function escapePipe(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * 渲染术语表章节。
 * @param {Object} round1
 * @returns {string}
 */
function renderTerminology(round1) {
  const terms = round1?.terms || [];
  if (terms.length === 0) return '（无术语）\n';

  const lines = [
    '| ID | 术语 | 别名 | 分类 | 定义 | 来源 |',
    '|----|------|------|------|------|------|',
  ];

  for (const term of terms) {
    const loc = term.source_location?.[0];
    const source = loc ? `${loc.section_title} (L${loc.approximate_line})` : '';
    lines.push(
      `| ${term.id} | ${escapePipe(term.term)} | ${escapePipe((term.aliases || []).join(', '))} | ${term.domain_category || 'unknown'} | ${escapePipe(term.definition)} | ${escapePipe(source)} |`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * 渲染 EventStorming 元素清单。
 * @param {Object} round2
 * @returns {string}
 */
function renderElements(round2) {
  let md = '';

  md += '### 4.1 聚合\n\n';
  const aggregates = round2?.aggregates || [];
  if (aggregates.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const agg of aggregates) {
      md += `- **${agg.id}: ${agg.name}**\n`;
      md += `  - 职责: ${(agg.responsibilities || []).join('、') || '—'}\n`;
      md += `  - 不变量: ${(agg.invariants || []).join('、') || '—'}\n`;
      md += `  - 边界线索: ${(agg.boundary_indicators || []).join('、') || '—'}\n\n`;
    }
  }

  md += '### 4.2 命令\n\n';
  const commands = round2?.commands || [];
  if (commands.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const cmd of commands) {
      md += `- **${cmd.id}: ${cmd.name}** — 执行者: ${cmd.actor || '—'}, 目标聚合: ${cmd.target_aggregate_id || '—'}\n`;
      if (cmd.description) md += `  - ${cmd.description}\n`;
    }
    md += '\n';
  }

  md += '### 4.3 事件\n\n';
  const events = round2?.events || [];
  if (events.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const evt of events) {
      const trigger = evt.trigger ? `${evt.trigger.type}(${evt.trigger.source_id})` : '—';
      md += `- **${evt.id}: ${evt.name}** — 聚合: ${evt.aggregate_id || '—'}, 触发源: ${trigger}, 业务价值: ${evt.business_value || '—'}\n`;
      if (evt.description) md += `  - ${evt.description}\n`;
    }
    md += '\n';
  }

  md += '### 4.4 策略\n\n';
  const policies = round2?.policies || [];
  if (policies.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const pol of policies) {
      md += `- **${pol.id}: ${pol.name}** — 触发事件: ${pol.trigger_event_id || '—'}\n`;
      if (pol.decision) md += `  - 决策: ${pol.decision}\n`;
    }
    md += '\n';
  }

  md += '### 4.5 读模型\n\n';
  const readModels = round2?.read_models || [];
  if (readModels.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const rm of readModels) {
      md += `- **${rm.id}: ${rm.name}** — 消费方: ${rm.consumer || '—'}, 数据源: ${rm.data_source || '—'}\n`;
    }
    md += '\n';
  }

  md += '### 4.6 外部系统\n\n';
  const externals = round2?.external_systems || [];
  if (externals.length === 0) {
    md += '（无）\n\n';
  } else {
    for (const ext of externals) {
      md += `- **${ext.id}: ${ext.name}** — 集成方式: ${ext.integration_type || 'unknown'}\n`;
      if (ext.description) md += `  - ${ext.description}\n`;
    }
    md += '\n';
  }

  return md;
}

/**
 * 渲染问题列表。
 * @param {Issue[]} issues
 * @returns {string}
 */
function renderIssues(issues) {
  if (!issues || issues.length === 0) return '（无异常）\n';

  const lines = [
    '| ID | 严重度 | 类别 | 标题 | 建议行动 |',
    '|----|--------|------|------|----------|',
  ];

  for (const issue of issues) {
    lines.push(
      `| ${issue.id} | ${issue.severity} | ${issue.category} | ${escapePipe(issue.title)} | ${escapePipe(issue.suggested_action)} |`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * 渲染术语一致性热力图（Markdown 表格）。
 * @param {Object} heatmap
 * @param {Object} round1
 * @returns {string}
 */
function renderHeatmap(heatmap, round1) {
  const chapters = heatmap?.chapters || [];
  if (chapters.length === 0) return '（无热力图数据）\n';

  const termMap = new Map((round1?.terms || []).map((t) => [t.id, t.term]));
  const termIds = [
    ...new Set(chapters.flatMap((c) => (c.term_scores || []).map((s) => s.term_id))),
  ];

  const header = ['章节', ...termIds.map((id) => termMap.get(id) || id), '平均分'];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '----').join('|')}|`];

  for (const chapter of chapters) {
    const scoreMap = new Map((chapter.term_scores || []).map((s) => [s.term_id, s]));
    const cells = termIds.map((id) => {
      const s = scoreMap.get(id);
      return s ? `${s.consistency_score.toFixed(2)} (${s.variant_used})` : '—';
    });
    const avg =
      chapter.term_scores?.length > 0
        ? (
            chapter.term_scores.reduce((sum, s) => sum + (s.consistency_score || 0), 0) /
            chapter.term_scores.length
          ).toFixed(2)
        : '—';
    lines.push(`| ${chapter.chapter_title} | ${cells.join(' | ')} | ${avg} |`);
  }

  lines.push('', `全局平均分: ${heatmap?.global_average?.toFixed(2) || '—'}`);
  const inconsistent = heatmap?.most_inconsistent_terms || [];
  if (inconsistent.length > 0) {
    const names = inconsistent.map((id) => termMap.get(id) || id).join(', ');
    lines.push(`最不一致术语: ${names}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * 渲染建议行动。
 * @param {Object} summary
 * @returns {string}
 */
function renderRecommendations(summary) {
  const recommendations = summary?.recommendations || [];
  if (recommendations.length === 0) return '（无建议）\n';

  const groups = {
    immediate: [],
    before_implementation: [],
    ongoing: [],
  };
  for (const rec of recommendations) {
    const key = rec.priority || 'ongoing';
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }

  const labels = {
    immediate: '立即执行',
    before_implementation: '实施前完成',
    ongoing: '持续跟进',
  };

  let md = '';
  for (const [key, recs] of Object.entries(groups)) {
    if (recs.length === 0) continue;
    md += `### ${labels[key] || key}\n\n`;
    for (const rec of recs) {
      md += `- ${rec.action}${rec.related_issue_ids?.length ? ` （关联: ${rec.related_issue_ids.join(', ')})` : ''}\n`;
    }
    md += '\n';
  }

  return md || '（无建议）\n';
}

/**
 * 渲染 Saga 流程章节。
 * @param {Object} round2
 * @param {Object[]} sagaCandidates
 * @param {Object[]} missingCompensations
 * @returns {string}
 */
function renderSagaCandidates(round2, sagaCandidates, missingCompensations) {
  if (!sagaCandidates || sagaCandidates.length === 0) return '（无 Saga 流程候选）\n';

  const eventMap = new Map((round2?.events || []).map((e) => [e.id, e]));
  const aggMap = new Map((round2?.aggregates || []).map((a) => [a.id, a.name]));
  const extMap = new Map((round2?.external_systems || []).map((e) => [e.id, e.name]));
  const missingEventIds = new Set((missingCompensations || []).map((m) => m.event_id));

  let md = '';
  for (const saga of sagaCandidates) {
    md += `#### ${saga.name}\n\n`;
    md += `- 事件链: ${saga.event_chain.map((id) => eventMap.get(id)?.name || id).join(' → ')}\n`;
    md += `- 涉及聚合: ${saga.involved_aggregates.map((id) => aggMap.get(id) || id).join('、')}\n`;
    if (saga.involved_external_systems?.length) {
      md += `- 涉及外部系统: ${saga.involved_external_systems.map((id) => extMap.get(id) || id).join('、')}\n`;
    }
    md += `- 建议 Saga 名: ${saga.suggested_saga_name}\n\n`;

    let diagram = 'graph LR\n';
    saga.event_chain.forEach((id, idx) => {
      const name = eventMap.get(id)?.name || id;
      const nodeId = `S${saga.id.replace(/\D/g, '')}E${idx}`;
      diagram += `    ${nodeId}[${escapePipe(name)}]\n`;
      if (idx > 0) {
        const prevId = `S${saga.id.replace(/\D/g, '')}E${idx - 1}`;
        diagram += `    ${prevId} --> ${nodeId}\n`;
      }
      if (missingEventIds.has(id)) {
        diagram += `    classDef missing fill:#ffcccc,stroke:#cc0000,stroke-width:2px\n`;
        diagram += `    ${nodeId}:::missing\n`;
      }
    });

    md += '```mermaid\n';
    md += diagram;
    md += '```\n\n';
  }

  return md;
}

/**
 * 渲染性能风险章节。
 * @param {Object[]} performanceRisks
 * @returns {string}
 */
function renderPerformanceRisks(performanceRisks) {
  if (!performanceRisks || performanceRisks.length === 0) return '（无性能风险）\n';

  const lines = [
    '| ID | 类别 | 严重度 | 描述 | 建议行动 | 关联元素 |',
    '|----|------|--------|------|----------|----------|',
  ];

  for (const risk of performanceRisks) {
    lines.push(
      `| ${risk.id} | ${risk.category} | ${risk.severity} | ${escapePipe(risk.description)} | ${escapePipe(risk.suggested_action)} | ${escapePipe((risk.related_element_ids || []).join(', '))} |`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * 渲染完整 Markdown 报告。
 * @param {ReportData} data
 * @returns {string}
 */
export function renderMarkdown(data) {
  const {
    prdPath,
    prdTitle,
    generatedAt,
    overallRisk,
    summary,
    round1,
    round2,
    issues,
    sequenceDiagram,
    boundaryDiagram,
    heatmap,
  } = data;

  const keyFindings = summary?.key_findings || [];

  const lines = [
    `# PRD EventStorming 评审报告 — ${prdTitle}`,
    '',
    `- 生成时间: ${generatedAt}`,
    `- PRD 路径: ${prdPath}`,
    `- 整体风险: ${overallRisk}`,
    '',
    '## 1. 执行摘要',
    '',
    summary?.executive_summary || '（无）',
    '',
    '## 2. 关键发现',
    '',
  ];

  if (keyFindings.length === 0) {
    lines.push('（无）');
  } else {
    keyFindings.forEach((finding, idx) => {
      lines.push(`${idx + 1}. ${finding}`);
    });
  }

  lines.push('', '## 3. 术语表', '', renderTerminology(round1));
  lines.push('## 4. EventStorming 元素清单', '', renderElements(round2));
  lines.push('', '## 5. 异常与问题', '');
  lines.push('### 5.1 问题列表', '', renderIssues(issues));
  lines.push(
    '### 5.2 Saga 流程',
    '',
    renderSagaCandidates(round2, data.sagaCandidates, data.missingCompensations)
  );
  lines.push('### 5.3 性能风险', '', renderPerformanceRisks(data.performanceRisks));

  lines.push(
    '## 6. 可视化',
    '',
    '### 6.1 事件流时序图',
    '',
    '```mermaid',
    sequenceDiagram || 'sequenceDiagram\n    Note over Review: 暂无数据',
    '```',
    '',
    '### 6.2 聚合边界图',
    '',
    '```mermaid',
    boundaryDiagram || 'graph TB\n    Note[暂无数据]',
    '```',
    '',
    '### 6.3 术语一致性热力图',
    '',
    renderHeatmap(heatmap, round1)
  );

  lines.push('## 7. 建议行动', '', renderRecommendations(summary));

  const timestamp = generatedAt.replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z');
  lines.push(
    '## 8. 附录',
    '',
    `- 原始 LLM 输出路径: \`prd-review-${timestamp}/round-{1..4}.json\``,
    '- Schema 版本: 1.0'
  );

  return lines.join('\n');
}
