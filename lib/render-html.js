/**
 * @fileoverview 将 Round1~Round4 数据渲染为单文件 HTML 字符串
 *
 * - Tailwind CSS 与 Mermaid 11 内嵌到 assets/，报告通过相对路径引用
 * - 工具感 / 文档仪表盘式排版，紧凑、统一、低装饰
 * - 保留：issue 严重度筛选、Mermaid 源码复制、热力图 SVG 导出、边界图 issue 高亮
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
 * HTML 转义。
 * @param {string} text
 * @returns {string}
 */
function htmlEscape(text) {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 严重度对应颜色类名。
 * @param {string} severity
 * @returns {string}
 */
function severityClass(severity) {
  switch (severity) {
    case 'blocker':
      return 'severity-blocker';
    case 'high':
      return 'severity-high';
    case 'medium':
      return 'severity-medium';
    case 'low':
      return 'severity-low';
    default:
      return 'severity-low';
  }
}

/**
 * 从 boundary_ambiguity issue 中提取需要高亮的节点标识。
 * 同时接受聚合 ID（如 agg-001）和聚合 name（如 Booking）。
 * @param {Issue[]} issues
 * @param {Object} round2
 * @returns {string[]}
 */
function extractBoundaryIssueIds(issues, round2) {
  const aggregates = round2?.aggregates || [];
  const idToName = new Map();
  const nameToId = new Map();
  for (const agg of aggregates) {
    if (agg.id && agg.name) {
      idToName.set(agg.id, agg.name);
      nameToId.set(agg.name, agg.id);
    }
  }

  const ids = new Set();
  for (const issue of issues || []) {
    if (issue.category !== 'boundary_ambiguity') continue;
    for (const id of issue.related_element_ids || []) {
      ids.add(id);
      const name = idToName.get(id);
      if (name) ids.add(name);
      const aggId = nameToId.get(id);
      if (aggId) ids.add(aggId);
    }
  }
  return [...ids];
}

/**
 * 在 Mermaid graph 文本中注入 issue 高亮 classDef 与 class 声明。
 * @param {string} diagram
 * @param {string[]} issueRelatedIds
 * @returns {string}
 */
function injectIssueHighlights(diagram, issueRelatedIds) {
  if (!diagram || !issueRelatedIds?.length) return diagram;

  const lines = diagram.split('\n');
  const first = lines[0]?.trim() || '';
  if (!first.startsWith('graph')) return diagram;

  const nodeIds = new Set();
  const nodeDefRegex =
    /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\[\/[^\]]*\/\]|\[\\[^\]]*\\\]|\[\([^\]]*\)\])/;
  for (const line of lines) {
    const match = line.match(nodeDefRegex);
    if (match) nodeIds.add(match[1]);
  }

  const highlighted = new Set();
  for (const id of issueRelatedIds) {
    if (nodeIds.has(id)) highlighted.add(id);
  }
  if (highlighted.size === 0) return diagram;

  const classDef = '    classDef issue fill:#fee2e2,stroke:#991b1b,stroke-width:2px';
  const classLines = [...highlighted].map((id) => `    ${id}:::issue`);

  return [lines[0], classDef, ...lines.slice(1), ...classLines].join('\n');
}

/**
 * 渲染术语表。
 * @param {Object} round1
 * @returns {string}
 */
function renderTerminology(round1) {
  const terms = round1?.terms || [];
  if (terms.length === 0) return '<p class="text-[#737373] italic">（无术语）</p>';

  const rows = terms
    .map((term) => {
      const loc = term.source_location?.[0];
      const source = loc ? `${loc.section_title} (L${loc.approximate_line})` : '';
      return `
        <tr class="border-b border-[#e8e8e6] last:border-0">
          <td class="py-2 px-3 align-top font-mono text-xs text-[#737373]">${htmlEscape(term.id)}</td>
          <td class="py-2 px-3 align-top font-medium text-[#171717]">${htmlEscape(term.term)}</td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape((term.aliases || []).join(', '))}</td>
          <td class="py-2 px-3 align-top"><span class="inline-flex items-center rounded-md bg-[#f5f5f5] px-2 py-0.5 text-xs font-medium text-[#525252]">${htmlEscape(term.domain_category || 'unknown')}</span></td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape(term.definition)}</td>
          <td class="py-2 px-3 align-top text-xs text-[#737373]">${htmlEscape(source)}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="overflow-x-auto -mx-4 px-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[#e8e8e6] text-left text-xs uppercase tracking-wider text-[#737373]">
            <th class="py-2 px-3 font-medium">ID</th>
            <th class="py-2 px-3 font-medium">术语</th>
            <th class="py-2 px-3 font-medium">别名</th>
            <th class="py-2 px-3 font-medium">分类</th>
            <th class="py-2 px-3 font-medium">定义</th>
            <th class="py-2 px-3 font-medium">来源</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * 渲染 EventStorming 元素。
 * @param {Object} round2
 * @returns {string}
 */
function renderElements(round2) {
  const sections = [
    {
      key: 'aggregates',
      title: '聚合',
      fields: ['responsibilities', 'invariants', 'boundary_indicators'],
    },
    { key: 'commands', title: '命令', fields: ['actor', 'target_aggregate_id', 'description'] },
    {
      key: 'events',
      title: '事件',
      fields: ['aggregate_id', 'trigger', 'business_value', 'description'],
    },
    { key: 'policies', title: '策略', fields: ['trigger_event_id', 'decision', 'outcome'] },
    { key: 'read_models', title: '读模型', fields: ['consumer', 'data_source'] },
    { key: 'external_systems', title: '外部系统', fields: ['integration_type', 'description'] },
  ];

  let html = '<div class="space-y-4">';
  for (const section of sections) {
    const items = round2?.[section.key] || [];
    html += `<div class="border-t border-[#e8e8e6] pt-4">`;
    html += `<h3 class="text-base font-semibold text-[#171717] mb-2">${htmlEscape(section.title)}</h3>`;

    if (items.length === 0) {
      html += '<p class="text-[#737373] italic">（无）</p>';
    } else {
      html += '<ul class="grid gap-3">';
      for (const item of items) {
        html += `<li class="rounded-lg border border-[#e8e8e6] bg-[#fafafa] p-3">
          <strong class="text-[#171717]">${htmlEscape(item.id)}: ${htmlEscape(item.name)}</strong>`;
        for (const field of section.fields) {
          const value = item[field];
          if (value === undefined || value === null) continue;
          let display = value;
          if (Array.isArray(value)) display = value.join('、') || '—';
          else if (typeof value === 'object') display = JSON.stringify(value);
          html += `<div class="mt-0.5 text-sm text-[#525252]">
            <span class="text-xs uppercase tracking-wider text-[#737373]">${htmlEscape(field)}</span>
            <span class="ml-1">${htmlEscape(display)}</span>
          </div>`;
        }
        html += '</li>';
      }
      html += '</ul>';
    }

    html += '</div>';
  }
  html += '</div>';

  return html;
}

/**
 * 渲染问题列表（含严重度筛选）。
 * @param {Issue[]} issues
 * @returns {string}
 */
function renderIssues(issues) {
  if (!issues || issues.length === 0) return '<p class="text-[#737373] italic">（无异常）</p>';

  const rows = issues
    .map((issue) => {
      return `
        <tr class="${severityClass(issue.severity)} border-b border-[#e8e8e6] last:border-0" data-severity="${htmlEscape(issue.severity)}">
          <td class="py-2 px-3 align-top font-mono text-xs text-[#737373]">${htmlEscape(issue.id)}</td>
          <td class="py-2 px-3 align-top"><span class="severity-badge ${severityClass(issue.severity)}">${htmlEscape(issue.severity)}</span></td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape(issue.category)}</td>
          <td class="py-2 px-3 align-top font-medium text-[#171717]">${htmlEscape(issue.title)}</td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape(issue.description)}</td>
          <td class="py-2 px-3 align-top text-sm text-[#525252]">${htmlEscape(issue.suggested_action)}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <label for="severity-filter" class="text-sm font-medium text-[#525252]">按严重度筛选</label>
      <select id="severity-filter" class="rounded-lg border border-[#e8e8e6] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]">
        <option value="all">全部</option>
        <option value="blocker">blocker</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>
      <span id="issue-count" class="text-sm text-[#737373]">${issues.length} 个问题</span>
    </div>
    <div class="overflow-x-auto -mx-4 px-4">
      <table id="issues-table" class="w-full text-sm">
        <thead>
          <tr class="border-b border-[#e8e8e6] text-left text-xs uppercase tracking-wider text-[#737373]">
            <th class="py-2 px-3 font-medium">ID</th>
            <th class="py-2 px-3 font-medium">严重度</th>
            <th class="py-2 px-3 font-medium">类别</th>
            <th class="py-2 px-3 font-medium">标题</th>
            <th class="py-2 px-3 font-medium">描述</th>
            <th class="py-2 px-3 font-medium">建议行动</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * 渲染术语热力图（CSS Grid）。
 * @param {Object} heatmap
 * @param {Object} round1
 * @returns {string}
 */
function renderHeatmap(heatmap, round1) {
  const chapters = heatmap?.chapters || [];
  if (chapters.length === 0) return '<p class="text-[#737373] italic">（无热力图数据）</p>';

  const termMap = new Map((round1?.terms || []).map((t) => [t.id, t.term]));
  const termIds = [
    ...new Set(chapters.flatMap((c) => (c.term_scores || []).map((s) => s.term_id))),
  ];

  let html = '<div class="heatmap">';

  html += '<div class="heatmap-row heatmap-header">';
  html += '<div class="heatmap-cell">章节</div>';
  for (const id of termIds) {
    html += `<div class="heatmap-cell">${htmlEscape(termMap.get(id) || id)}</div>`;
  }
  html += '<div class="heatmap-cell">平均分</div>';
  html += '</div>';

  for (const chapter of chapters) {
    const scoreMap = new Map((chapter.term_scores || []).map((s) => [s.term_id, s]));
    html += '<div class="heatmap-row">';
    html += `<div class="heatmap-cell">${htmlEscape(chapter.chapter_title)}</div>`;
    for (const id of termIds) {
      const s = scoreMap.get(id);
      const score = s ? s.consistency_score : null;
      const style = score !== null ? `style="background: ${scoreToColor(score)}"` : '';
      const text = s
        ? `${(score * 100).toFixed(0)}%<br><small>${htmlEscape(s.variant_used)}</small>`
        : '—';
      html += `<div class="heatmap-cell" ${style}>${text}</div>`;
    }
    const avg =
      chapter.term_scores?.length > 0
        ? chapter.term_scores.reduce((sum, s) => sum + (s.consistency_score || 0), 0) /
          chapter.term_scores.length
        : null;
    html += `<div class="heatmap-cell">${avg !== null ? (avg * 100).toFixed(0) + '%' : '—'}</div>`;
    html += '</div>';
  }

  html += '</div>';

  const inconsistent = heatmap?.most_inconsistent_terms || [];
  if (inconsistent.length > 0) {
    const names = inconsistent.map((id) => htmlEscape(termMap.get(id) || id)).join(', ');
    html += `<p class="mt-2 text-sm text-[#525252]">最不一致术语: <span class="font-medium text-[#991b1b]">${names}</span></p>`;
  }

  return html;
}

/**
 * 分数转颜色（绿到红）。
 * @param {number} score
 * @returns {string}
 */
function scoreToColor(score) {
  const s = Math.max(0, Math.min(1, score));
  const r = Math.round((1 - s) * 220 + 30);
  const g = Math.round(s * 200 + 30);
  return `rgba(${r}, ${g}, 40, 0.22)`;
}

/**
 * 渲染建议行动。
 * @param {Object} summary
 * @returns {string}
 */
function renderRecommendations(summary) {
  const recommendations = summary?.recommendations || [];
  if (recommendations.length === 0) return '<p class="text-[#737373] italic">（无建议）</p>';

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

  const priorityStyles = {
    immediate: 'border-l-2 border-[#991b1b] bg-[#fef2f2]/50',
    before_implementation: 'border-l-2 border-[#d97706] bg-[#fffbeb]/50',
    ongoing: 'border-l-2 border-[#2563eb] bg-[#eff6ff]/50',
  };

  let html = '<div class="space-y-3">';
  for (const [key, recs] of Object.entries(groups)) {
    if (recs.length === 0) continue;
    html += `<div class="${priorityStyles[key] || 'border-l-2 border-[#e8e8e6] bg-[#fafafa]/50'} rounded-r-lg p-3">
      <h3 class="text-base font-semibold text-[#171717] mb-2">${htmlEscape(labels[key] || key)}</h3>
      <ul class="space-y-2">`;
    for (const rec of recs) {
      html += `<li class="flex items-start gap-2 text-[#525252]">
        <span class="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#a3a3a3]"></span>
        <span>${htmlEscape(rec.action)}${rec.related_issue_ids?.length ? ` <span class="text-xs text-[#737373]">(关联: ${rec.related_issue_ids.join(', ')})</span>` : ''}</span>
      </li>`;
    }
    html += '</ul></div>';
  }
  html += '</div>';

  return html;
}

/**
 * 渲染 Saga 流程。
 * @param {Object} round2
 * @param {Object[]} sagaCandidates
 * @param {Object[]} missingCompensations
 * @returns {string}
 */
function renderSagaCandidates(round2, sagaCandidates, missingCompensations) {
  if (!sagaCandidates || sagaCandidates.length === 0)
    return '<p class="text-[#737373] italic">（无 Saga 流程候选）</p>';

  const eventMap = new Map((round2?.events || []).map((e) => [e.id, e]));
  const aggMap = new Map((round2?.aggregates || []).map((a) => [a.id, a.name]));
  const extMap = new Map((round2?.external_systems || []).map((e) => [e.id, e.name]));
  const missingEventIds = new Set((missingCompensations || []).map((m) => m.event_id));

  let html = '<div class="space-y-3">';
  for (const saga of sagaCandidates) {
    html += `<article class="rounded-lg border border-[#e8e8e6] bg-white p-4">
      <h4 class="text-base font-semibold text-[#171717] mb-2">${htmlEscape(saga.name)}</h4>
      <div class="mb-2 space-y-1 text-sm text-[#525252]">
        <p><span class="text-[#737373]">事件链:</span> ${saga.event_chain.map((id) => htmlEscape(eventMap.get(id)?.name || id)).join(' → ')}</p>
        <p><span class="text-[#737373]">涉及聚合:</span> ${saga.involved_aggregates.map((id) => htmlEscape(aggMap.get(id) || id)).join('、')}</p>`;
    if (saga.involved_external_systems?.length) {
      html += `<p><span class="text-[#737373]">涉及外部系统:</span> ${saga.involved_external_systems.map((id) => htmlEscape(extMap.get(id) || id)).join('、')}</p>`;
    }
    html += `<p><span class="text-[#737373]">建议 Saga 名:</span> ${htmlEscape(saga.suggested_saga_name)}</p>
      </div>`;

    let diagram = 'graph LR\n';
    saga.event_chain.forEach((id, idx) => {
      const name = eventMap.get(id)?.name || id;
      const nodeId = `S${saga.id.replace(/\D/g, '')}E${idx}`;
      diagram += `    ${nodeId}[${htmlEscape(name)}]\n`;
      if (idx > 0) {
        const prevId = `S${saga.id.replace(/\D/g, '')}E${idx - 1}`;
        diagram += `    ${prevId} --> ${nodeId}\n`;
      }
      if (missingEventIds.has(id)) {
        diagram += `    classDef missing fill:#fee2e2,stroke:#991b1b,stroke-width:2px\n`;
        diagram += `    ${nodeId}:::missing\n`;
      }
    });

    const diagramId = `mermaid-saga-${htmlEscape(saga.id)}`;
    html += `<div class="mermaid rounded-lg border border-[#e8e8e6] bg-[#f5f5f5] p-4 overflow-x-auto text-sm" id="${diagramId}">${htmlEscape(diagram)}</div>`;
    html += `<div class="mt-2">
      <button class="btn-secondary" onclick="copyMermaid('${diagramId}')">复制 Mermaid 源码</button>
    </div>`;
    html += '</article>';
  }
  html += '</div>';

  return html;
}

/**
 * 渲染性能风险。
 * @param {Object[]} performanceRisks
 * @returns {string}
 */
function renderPerformanceRisks(performanceRisks) {
  if (!performanceRisks || performanceRisks.length === 0)
    return '<p class="text-[#737373] italic">（无性能风险）</p>';

  const rows = performanceRisks
    .map((risk) => {
      return `
        <tr class="${severityClass(risk.severity)} border-b border-[#e8e8e6] last:border-0" data-severity="${htmlEscape(risk.severity)}">
          <td class="py-2 px-3 align-top font-mono text-xs text-[#737373]">${htmlEscape(risk.id)}</td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape(risk.category)}</td>
          <td class="py-2 px-3 align-top"><span class="severity-badge ${severityClass(risk.severity)}">${htmlEscape(risk.severity)}</span></td>
          <td class="py-2 px-3 align-top text-[#525252]">${htmlEscape(risk.description)}</td>
          <td class="py-2 px-3 align-top text-sm text-[#525252]">${htmlEscape(risk.suggested_action)}</td>
          <td class="py-2 px-3 align-top font-mono text-xs text-[#737373]">${htmlEscape((risk.related_element_ids || []).join(', '))}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="overflow-x-auto -mx-4 px-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[#e8e8e6] text-left text-xs uppercase tracking-wider text-[#737373]">
            <th class="py-2 px-3 font-medium">ID</th>
            <th class="py-2 px-3 font-medium">类别</th>
            <th class="py-2 px-3 font-medium">严重度</th>
            <th class="py-2 px-3 font-medium">描述</th>
            <th class="py-2 px-3 font-medium">建议行动</th>
            <th class="py-2 px-3 font-medium">关联元素</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/**
 * 渲染导航。
 * @returns {string}
 */
function renderNav() {
  const links = [
    { href: '#summary', label: '执行摘要' },
    { href: '#findings', label: '关键发现' },
    { href: '#terminology', label: '术语表' },
    { href: '#elements', label: 'EventStorming' },
    { href: '#issues', label: '问题' },
    { href: '#visualization', label: '可视化' },
    { href: '#recommendations', label: '建议' },
    { href: '#metadata', label: '元数据' },
  ];

  return `
    <nav class="sticky top-0 z-40 border-b border-[#e8e8e6] bg-white/95 px-4 py-2 backdrop-blur">
      <div class="flex flex-wrap items-center gap-1">
        <span class="mr-3 text-sm font-semibold text-[#171717]">目录</span>
        ${links.map((l) => `<a href="${l.href}" class="rounded-md px-3 py-1.5 text-sm text-[#525252] transition-colors hover:bg-[#f5f5f5] hover:text-[#171717]">${htmlEscape(l.label)}</a>`).join('')}
      </div>
    </nav>`;
}

/**
 * 渲染风险徽章。
 * @param {string} risk
 * @returns {string}
 */
function renderRiskBadge(risk) {
  const styles = {
    low: 'risk-low',
    medium: 'risk-medium',
    high: 'risk-high',
    critical: 'risk-critical',
    blocker: 'risk-critical',
  };
  return `<span class="risk-badge ${styles[risk] || 'risk-default'}">${htmlEscape(risk)}</span>`;
}

/**
 * 渲染 Mermaid 图表卡片。
 * @param {string} id
 * @param {string} title
 * @param {string} source
 * @returns {string}
 */
function renderMermaidCard(id, title, source) {
  return `
    <div class="rounded-lg border border-[#e8e8e6] bg-white p-4">
      <h3 class="text-base font-semibold text-[#171717] mb-3">${htmlEscape(title)}</h3>
      <div class="mermaid rounded-lg border border-[#e8e8e6] bg-[#f5f5f5] p-4 overflow-x-auto text-sm" id="${id}">
${htmlEscape(source)}
      </div>
      <div class="mt-3">
        <button class="btn-secondary" onclick="copyMermaid('${id}')">复制 Mermaid 源码</button>
      </div>
    </div>`;
}

/**
 * 渲染完整 HTML 报告。
 * @param {ReportData} data
 * @returns {Promise<string>}
 */
export async function renderHtml(data) {
  const {
    prdPath,
    prdTitle,
    generatedAt,
    overallRisk,
    summary,
    round1,
    round2,
    issues,
    sagaCandidates,
    missingCompensations,
    performanceRisks,
    sequenceDiagram,
    boundaryDiagram,
    heatmap,
    metadata,
  } = data;

  const keyFindings = summary?.key_findings || [];

  const boundaryIssueIds = extractBoundaryIssueIds(issues, round2);
  const highlightedBoundaryDiagram = injectIssueHighlights(
    boundaryDiagram || 'graph TB\n    Note[暂无数据]',
    boundaryIssueIds
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PRD EventStorming 评审报告 — ${htmlEscape(prdTitle)}</title>
  <script src="./assets/tailwindcss.js"></script>
  <script src="./assets/mermaid.min.js"></script>
  <script>
    document.querySelectorAll('.mermaid').forEach(function (el) {
      el.dataset.source = el.textContent.trim();
    });
    mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
  </script>
  <style>
    :root {
      --color-bg: #fafafa;
      --color-card: #ffffff;
      --color-border: #e8e8e6;
      --color-text: #171717;
      --color-text-secondary: #525252;
      --color-text-tertiary: #737373;
      --color-accent: #2563eb;
      --color-accent-hover: #1d4ed8;
      --color-blocker: #991b1b;
      --color-high: #9a3412;
      --color-medium: #92400e;
      --color-low: #475569;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Noto Sans Mono SC', monospace;
    }
    html { scroll-behavior: smooth; }
    body { font-family: var(--font-sans); }
    .font-mono { font-family: var(--font-mono); }
    .font-display { font-family: var(--font-sans); }
    .severity-blocker { color: var(--color-blocker); }
    .severity-high { color: var(--color-high); }
    .severity-medium { color: var(--color-medium); }
    .severity-low { color: var(--color-low); }
    .severity-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      line-height: 1rem;
      font-weight: 500;
    }
    .severity-badge.severity-blocker { background-color: #fee2e2; color: var(--color-blocker); }
    .severity-badge.severity-high { background-color: #ffedd5; color: var(--color-high); }
    .severity-badge.severity-medium { background-color: #fef3c7; color: var(--color-medium); }
    .severity-badge.severity-low { background-color: #f1f5f9; color: var(--color-low); }
    .risk-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      line-height: 1rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .risk-badge.risk-low { background-color: #dcfce7; color: #166534; }
    .risk-badge.risk-medium { background-color: #fef3c7; color: #92400e; }
    .risk-badge.risk-high { background-color: #ffedd5; color: #9a3412; }
    .risk-badge.risk-critical { background-color: #fee2e2; color: #991b1b; }
    .risk-badge.risk-default { background-color: #f5f5f5; color: #525252; }
    .btn-primary {
      display: inline-flex;
      align-items: center;
      border-radius: 0.5rem;
      background-color: var(--color-accent);
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: 500;
      color: #ffffff;
      transition: background-color 150ms ease;
    }
    .btn-primary:hover { background-color: var(--color-accent-hover); }
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      border-radius: 0.5rem;
      border: 1px solid var(--color-border);
      background-color: #ffffff;
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: 500;
      color: var(--color-text-secondary);
      transition: background-color 150ms ease, color 150ms ease;
    }
    .btn-secondary:hover { background-color: var(--color-bg); color: var(--color-text); }
    .heatmap { display: grid; gap: 1px; margin: 0.5rem 0; }
    .heatmap-row { display: contents; }
    .heatmap-cell {
      min-width: 4.5rem;
      border-radius: 0;
      border: 1px solid var(--color-border);
      background: var(--color-card);
      padding: 0.375rem 0.375rem;
      text-align: center;
      font-size: 0.8125rem;
      line-height: 1.25rem;
      color: var(--color-text-secondary);
    }
    .heatmap-header .heatmap-cell {
      background: var(--color-bg);
      font-weight: 600;
      color: var(--color-text);
    }
  </style>
</head>
<body class="bg-[#fafafa] text-[#171717] antialiased">
  <main class="mx-auto max-w-5xl px-6 py-8 lg:py-12 space-y-4">
    ${renderNav()}

    <header class="space-y-3 border-b border-[#e8e8e6] pb-4">
      <p class="text-xs font-semibold uppercase tracking-wider text-[#2563eb]">PRD EventStorming Review</p>
      <h1 class="text-3xl font-semibold leading-tight text-[#171717]">PRD EventStorming 评审报告</h1>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#737373]">
        <span class="font-medium text-[#171717]">${htmlEscape(prdTitle)}</span>
        <span>${htmlEscape(prdPath)}</span>
        <span>${htmlEscape(generatedAt)}</span>
        ${renderRiskBadge(overallRisk)}
      </div>
    </header>

    <section id="summary" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">执行摘要</h2>
      <p class="text-base leading-relaxed text-[#525252]">${htmlEscape(summary?.executive_summary || '（无）')}</p>
    </section>

    <section id="findings" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">关键发现</h2>
      ${keyFindings.length === 0 ? '<p class="text-[#737373] italic">（无）</p>' : `<ol class="list-decimal list-inside space-y-2 text-[#525252]">${keyFindings.map((f) => `<li>${htmlEscape(f)}</li>`).join('')}</ol>`}
    </section>

    <section id="terminology" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">术语表</h2>
      ${renderTerminology(round1)}
    </section>

    <section id="elements" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">EventStorming 元素清单</h2>
      ${renderElements(round2)}
    </section>

    <section id="issues" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">异常与问题</h2>
      <div class="space-y-4">
        <div>
          <h3 class="text-base font-semibold text-[#171717] mb-2">问题列表</h3>
          ${renderIssues(issues)}
        </div>
        <div>
          <h3 class="text-base font-semibold text-[#171717] mb-2">Saga 流程</h3>
          ${renderSagaCandidates(round2, sagaCandidates, missingCompensations)}
        </div>
        <div>
          <h3 class="text-base font-semibold text-[#171717] mb-2">性能风险</h3>
          ${renderPerformanceRisks(performanceRisks)}
        </div>
      </div>
    </section>

    <section id="visualization" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">可视化</h2>
      <div class="space-y-4">
        ${renderMermaidCard('mermaid-sequence', '事件流时序图', sequenceDiagram || 'sequenceDiagram\n    Note over Review: 暂无数据')}
        ${renderMermaidCard('mermaid-boundary', '聚合边界图', highlightedBoundaryDiagram)}
        <div class="rounded-lg border border-[#e8e8e6] bg-white p-4">
          <h3 class="text-base font-semibold text-[#171717] mb-2">术语一致性热力图</h3>
          <p class="mb-2 text-sm text-[#737373]">全局平均分: ${heatmap?.global_average !== undefined ? (heatmap.global_average * 100).toFixed(0) + '%' : '—'}</p>
          <div class="overflow-x-auto">
            ${renderHeatmap(heatmap, round1)}
          </div>
          <div class="mt-3">
            <button id="export-heatmap" class="btn-primary">下载热力图 SVG</button>
          </div>
        </div>
      </div>
    </section>

    <section id="recommendations" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">建议行动</h2>
      ${renderRecommendations(summary)}
    </section>

    <section id="metadata" class="rounded-lg border border-[#e8e8e6] bg-white p-4 shadow-sm">
      <h2 class="text-xl font-semibold text-[#171717] mb-3">元数据</h2>
      <ul class="space-y-2 text-sm text-[#525252]">
        <li><span class="text-[#737373]">总问题数:</span> ${metadata?.total_issues ?? '—'}</li>
        <li><span class="text-[#737373]">严重度分布:</span> <span class="severity-blocker font-medium">blocker ${metadata?.blocker_count ?? 0}</span> · <span class="severity-high font-medium">high ${metadata?.high_count ?? 0}</span> · <span class="severity-medium font-medium">medium ${metadata?.medium_count ?? 0}</span> · <span class="severity-low font-medium">low ${metadata?.low_count ?? 0}</span></li>
        <li><span class="text-[#737373]">Schema 版本:</span> 1.0</li>
      </ul>
    </section>
  </main>

  <script>
    function copyMermaid(id) {
      const el = document.getElementById(id);
      if (!el) return;
      const text = (el.dataset.source || el.textContent).trim();
      navigator.clipboard.writeText(text).then(function () {
        alert('Mermaid 源码已复制到剪贴板');
      }).catch(function () {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Mermaid 源码已复制到剪贴板');
      });
    }

    (function () {
      const filter = document.getElementById('severity-filter');
      const table = document.getElementById('issues-table');
      const count = document.getElementById('issue-count');
      if (!filter || !table) return;

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      filter.addEventListener('change', function () {
        const value = filter.value;
        let visible = 0;
        rows.forEach(function (row) {
          const show = value === 'all' || row.dataset.severity === value;
          row.style.display = show ? '' : 'none';
          if (show) visible++;
        });
        if (count) count.textContent = visible + ' 个问题';
      });
    })();

    (function () {
      const btn = document.getElementById('export-heatmap');
      if (!btn) return;
      btn.addEventListener('click', function () {
        const heatmap = document.querySelector('.heatmap');
        if (!heatmap) return;

        const rows = Array.from(heatmap.querySelectorAll('.heatmap-row'));
        if (rows.length === 0) return;

        const colCount = rows[0].querySelectorAll('.heatmap-cell').length;
        const cellW = 120;
        const cellH = 40;
        const width = colCount * cellW;
        const height = rows.length * cellH;

        let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">';
        svg += '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC","PingFang SC","Microsoft YaHei",Arial,sans-serif;font-size:11px;fill:#525252}</style>';
        svg += '<rect width="100%" height="100%" fill="#fafafa"/>';

        rows.forEach(function (row, r) {
          const cells = Array.from(row.querySelectorAll('.heatmap-cell'));
          cells.forEach(function (cell, c) {
            const x = c * cellW;
            const y = r * cellH;
            const bg = cell.style.backgroundColor || (row.classList.contains('heatmap-header') ? '#fafafa' : '#ffffff');
            svg += '<rect x="' + x + '" y="' + y + '" width="' + cellW + '" height="' + cellH + '" fill="' + bg + '" stroke="#e8e8e6"/>';

            const lines = cell.innerHTML.split(/<br */?> */i);
            lines.forEach(function (line, i) {
              const clean = line.replace(/<small>|</small>/gi, '').replace(/<[^>]+>/g, '').trim();
              if (!clean) return;
              const ty = y + cellH / 2 + (i - (lines.length - 1) / 2) * 12;
              svg += '<text x="' + (x + cellW / 2) + '" y="' + ty + '" text-anchor="middle" dominant-baseline="middle">' + clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</text>';
            });
          });
        });

        svg += '</svg>';

        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'term-heatmap.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    })();
  </script>
</body>
</html>`;
}
