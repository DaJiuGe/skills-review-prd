import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderMarkdown } from '../lib/render-markdown.js';
import { renderHtml } from '../lib/render-html.js';
import { buildReportData } from '../lib/agent-mode.js';
import { buildReportDataInput } from './helpers/mock-data.js';

function buildReport(overrides = {}) {
  return buildReportData(buildReportDataInput(overrides));
}

describe('renderMarkdown', () => {
  it('应包含关键章节标题', () => {
    const md = renderMarkdown(buildReport());

    assert.ok(md.includes('# PRD EventStorming 评审报告'));
    assert.ok(md.includes('## 1. 执行摘要'));
    assert.ok(md.includes('## 2. 关键发现'));
    assert.ok(md.includes('## 3. 术语表'));
    assert.ok(md.includes('## 4. EventStorming 元素清单'));
    assert.ok(md.includes('## 5. 异常与问题'));
    assert.ok(md.includes('## 6. 可视化'));
    assert.ok(md.includes('## 7. 建议行动'));
    assert.ok(md.includes('## 8. 附录'));
  });
});

describe('renderHtml', () => {
  it('应包含 Mermaid、严重度样式和热力图 div', async () => {
    const html = await renderHtml(
      buildReport({
        round4: {
          term_heatmap_data: {
            chapters: [
              {
                chapter_title: '第一章',
                chapter_index: 1,
                term_scores: [
                  {
                    term_id: 'term-001',
                    term_name: 'Order',
                    consistency_score: 0.8,
                    variant_used: '订单',
                  },
                ],
              },
            ],
            global_average: 0.8,
            most_inconsistent_terms: [],
          },
        },
      })
    );

    assert.strictEqual(typeof html, 'string');
    assert.ok(html.includes('mermaid'));
    assert.ok(html.includes('mermaid.initialize'));
    assert.ok(html.includes('severity-blocker'));
    assert.ok(html.includes('severity-high'));
    assert.ok(html.includes('severity-medium'));
    assert.ok(html.includes('severity-low'));
    assert.ok(html.includes('<div class="heatmap">'));
    assert.ok(html.includes('<div class="heatmap-row heatmap-header">'));
  });

  it('应正确转义 HTML 特殊字符', async () => {
    const html = await renderHtml(
      buildReport({
        prdTitle: '<script>alert("xss")</script>',
        round4: {
          review_summary: {
            executive_summary: 'A & B < C',
            key_findings: [],
            recommendations: [],
            risk_assessment: { overall_risk: 'medium', rationale: '1 < 2 & 2 > 1' },
          },
        },
      })
    );

    assert.ok(!html.includes('<script>alert("xss")</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('A &amp; B &lt; C'));
  });
});
