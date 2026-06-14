import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildRound1Prompt,
  buildRound2Prompt,
  buildRound3Prompt,
  buildRound4Prompt,
} from '../lib/prompts.js';

describe('prompts', () => {
  it('buildRound1Prompt 应包含标题、分块与已有术语', () => {
    const prompt = buildRound1Prompt({
      prdTitle: '会议室预订系统 PRD',
      prdChunks: [{ section_title: '背景', approximate_line: 1, content: '我们需要预订会议室。' }],
      existingTerms: [{ source: 'CONTEXT.md', name: '会议室', definition: '会议空间' }],
    });

    assert.ok(prompt.includes('[Round 1]'));
    assert.ok(prompt.includes('会议室预订系统 PRD'));
    assert.ok(prompt.includes('背景'));
    assert.ok(prompt.includes('会议室'));
    assert.ok(prompt.includes('Round1_TerminologyExtraction'));
  });

  it('buildRound2Prompt 应包含 PRD 内容与术语表', () => {
    const prompt = buildRound2Prompt({
      prdContent: '用户可预订会议室。',
      round1Terms: [{ id: 'term-001', term: 'Booking', aliases: ['预订', '预约'] }],
    });

    assert.ok(prompt.includes('[Round 2]'));
    assert.ok(prompt.includes('用户可预订会议室'));
    assert.ok(prompt.includes('term-001'));
    assert.ok(prompt.includes('Round2_EventStormingElements'));
  });

  it('buildRound3Prompt 应序列化输入并包含检查项', () => {
    const prompt = buildRound3Prompt({
      round1Terms: [{ id: 'term-001', term: 'Booking' }],
      round2Elements: { events: [{ id: 'evt-001', name: 'BookingCreated' }] },
    });

    assert.ok(prompt.includes('[Round 3]'));
    assert.ok(prompt.includes('term-001'));
    assert.ok(prompt.includes('BookingCreated'));
    assert.ok(prompt.includes('孤儿事件'));
    assert.ok(prompt.includes('Saga'));
    assert.ok(prompt.includes('Round3_ConsistencyCheck'));
  });

  it('buildRound4Prompt 应序列化输入并包含报告要求', () => {
    const prompt = buildRound4Prompt({
      round1Summary: { total_terms: 5 },
      round2Elements: { events: [] },
      round3Issues: [{ id: 'issue-001', severity: 'high' }],
    });

    assert.ok(prompt.includes('[Round 4]'));
    assert.ok(prompt.includes('total_terms'));
    assert.ok(prompt.includes('issue-001'));
    assert.ok(prompt.includes('mermaid_sequence_diagram'));
    assert.ok(prompt.includes('Round4_ReportGeneration'));
  });
});
