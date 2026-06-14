import { describe, it } from 'node:test';
import assert from 'node:assert';
import { closeInteractive, printRoundSummary } from '../lib/interactive.js';

describe('interactive', () => {
  it('closeInteractive 应可重复调用且不抛错', () => {
    assert.doesNotThrow(() => closeInteractive());
    assert.doesNotThrow(() => closeInteractive());
  });

  it('printRoundSummary Round1 应打印术语统计', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printRoundSummary('Round1', {
      terms: [{}, {}, {}],
      summary: { new_terms: 2, conflict_count: 1 },
    });

    console.log = original;

    assert.ok(logs.some((l) => l.includes('术语总数')));
    assert.ok(logs.some((l) => l.includes('新增术语')));
    assert.ok(logs.some((l) => l.includes('冲突数')));
  });

  it('printRoundSummary Round2 应打印元素统计', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printRoundSummary('Round2', {
      events: [{}, {}],
      commands: [{}],
      aggregates: [{}],
      policies: [],
      external_systems: [{}],
      hot_spots: [{}],
    });

    console.log = original;

    assert.ok(logs.some((l) => l.includes('事件数')));
    assert.ok(logs.some((l) => l.includes('命令数')));
    assert.ok(logs.some((l) => l.includes('聚合数')));
  });

  it('printRoundSummary Round3 应打印问题严重度统计', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printRoundSummary('Round3', {
      issues: [
        { severity: 'blocker' },
        { severity: 'high' },
        { severity: 'high' },
        { severity: 'medium' },
      ],
    });

    console.log = original;

    assert.ok(logs.some((l) => l.includes('问题总数')));
    assert.ok(logs.some((l) => l.includes('blocker')));
    assert.ok(logs.some((l) => l.includes('high')));
  });

  it('printRoundSummary Round4 应打印风险与发现数', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printRoundSummary('Round4', {
      review_summary: {
        risk_assessment: { overall_risk: 'high' },
        key_findings: ['a', 'b'],
        recommendations: [{}],
      },
    });

    console.log = original;

    assert.ok(logs.some((l) => l.includes('整体风险')));
    assert.ok(logs.some((l) => l.includes('关键发现数')));
  });
});
