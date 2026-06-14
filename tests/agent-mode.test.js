import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateRound1,
  validateRound2,
  validateRound3,
  validateRound4,
  buildReportData,
  runAgentStep,
  AGENT_STEPS,
} from '../lib/agent-mode.js';
import {
  buildRound1,
  buildRound2,
  buildRound4,
  buildReportDataInput,
} from './helpers/mock-data.js';

describe('validateRound1', () => {
  it('完整对象应校验通过', () => {
    const result = validateRound1(buildRound1());
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.errors, []);
  });

  it('缺少 terms 时应报错', () => {
    const result = validateRound1({
      version: '1.0',
      round: 1,
      prd_metadata: { title: 'x' },
      summary: {},
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('terms')));
  });

  it('非对象输入应降级并报错', () => {
    const result = validateRound1(null);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('不是对象')));
  });
});

describe('validateRound2', () => {
  it('完整对象应校验通过', () => {
    const result = validateRound2(buildRound2());
    assert.strictEqual(result.ok, true);
  });

  it('缺少 events / commands / aggregates 时应报错', () => {
    const result = validateRound2({ version: '1.0', round: 2 });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errors.length, 3);
  });
});

describe('validateRound3', () => {
  it('完整对象应校验通过', () => {
    const result = validateRound3({ version: '1.0', round: 3, checks: {} });
    assert.strictEqual(result.ok, true);
  });

  it('缺少 checks 时应降级', () => {
    const result = validateRound3({ version: '1.0', round: 3 });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.checks, {});
  });
});

describe('validateRound4', () => {
  it('完整对象应校验通过', () => {
    const result = validateRound4(buildRound4());
    assert.strictEqual(result.ok, true);
  });

  it('缺少 diagram 与 review_summary 时应报错', () => {
    const result = validateRound4({ version: '1.0', round: 4 });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('mermaid_sequence_diagram')));
    assert.ok(result.errors.some((e) => e.includes('mermaid_boundary_diagram')));
    assert.ok(result.errors.some((e) => e.includes('review_summary')));
  });
});

describe('buildReportData', () => {
  it('应正确组装 report-data 对象', () => {
    const input = buildReportDataInput();
    const report = buildReportData(input);

    assert.strictEqual(report.prdPath, input.prdPath);
    assert.strictEqual(report.prdTitle, input.prdTitle);
    assert.strictEqual(report.overallRisk, 'medium');
    assert.strictEqual(report.round1, input.round1);
    assert.strictEqual(report.round2, input.round2);
    assert.strictEqual(report.issues, input.issues);
    assert.strictEqual(report.sequenceDiagram, input.round4.mermaid_sequence_diagram);
    assert.strictEqual(report.boundaryDiagram, input.round4.mermaid_boundary_diagram);
    assert.deepStrictEqual(report.heatmap, input.round4.term_heatmap_data);
    assert.deepStrictEqual(report.metadata, input.round4.report_metadata);
    assert.ok(typeof report.generatedAt === 'string');
  });

  it('未提供 prdTitle 时应从 round1 或 round4 推断', () => {
    const round1 = buildRound1({ prd_metadata: { title: '来自 Round1' } });
    const report = buildReportData({
      round1,
      round2: buildRound2(),
      round4: buildRound4({ report_metadata: { prd_title: '来自 Round4' } }),
    });
    assert.strictEqual(report.prdTitle, '来自 Round1');

    const report2 = buildReportData({
      round2: buildRound2(),
      round4: buildRound4({ report_metadata: { prd_title: '来自 Round4' } }),
    });
    assert.strictEqual(report2.prdTitle, '来自 Round4');

    const report3 = buildReportData({ round2: buildRound2() });
    assert.strictEqual(report3.prdTitle, '未命名 PRD');
  });
});

describe('runAgentStep', () => {
  it('Round1 应返回 prompt 与 schema', () => {
    const instruction = runAgentStep('Round1', {
      prdTitle: '测试 PRD',
      prdChunks: [{ section_title: '背景', approximate_line: 1, content: '内容' }],
      existingTerms: [],
    });

    assert.strictEqual(instruction.step, 'Round1');
    assert.strictEqual(instruction.type, 'llm');
    assert.strictEqual(instruction.schemaName, 'Round1_TerminologyExtraction');
    assert.strictEqual(typeof instruction.prompt, 'string');
    assert.ok(instruction.prompt.includes('[Round 1]'));
    assert.strictEqual(typeof instruction.schema, 'string');
    assert.strictEqual(instruction.outputFile, 'round-1.json');
    assert.strictEqual(instruction.validator, 'validateRound1');
  });

  it('未知步骤应抛错', () => {
    assert.throws(() => runAgentStep('Round999', {}), /Unknown agent step/);
  });
});

describe('AGENT_STEPS', () => {
  it('应包含 5 个步骤', () => {
    assert.strictEqual(AGENT_STEPS.length, 5);
  });

  it('每个步骤应包含必要字段', () => {
    for (const step of AGENT_STEPS) {
      assert.strictEqual(typeof step.name, 'string');
      assert.strictEqual(typeof step.description, 'string');
      assert.ok(['llm', 'cli'].includes(step.type));
      assert.ok(step.outputFile || step.outputs);
    }
  });

  it('步骤顺序应为 Round1 / Round2 / Round3 / Round4 / Render', () => {
    const names = AGENT_STEPS.map((s) => s.name);
    assert.deepStrictEqual(names, ['Round1', 'Round2', 'Round3', 'Round4', 'Render']);
  });
});
