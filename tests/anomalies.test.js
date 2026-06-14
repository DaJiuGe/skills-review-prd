import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectAnomalies } from '../lib/anomalies.js';
import {
  buildRound1,
  buildRound2,
  buildTerm,
  buildEvent,
  buildCommand,
  buildAggregate,
  buildPolicy,
  buildExternalSystem,
} from './helpers/mock-data.js';

describe('detectAnomalies', () => {
  it('应检测孤儿事件：事件 trigger 指向不存在的命令', () => {
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          trigger: { type: 'command', source_id: 'cmd-missing' },
        }),
      ],
      commands: [buildCommand({ id: 'cmd-001', name: 'PlaceOrder' })],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    const orphan = round3.checks.orphan_events.find((o) => o.event_id === 'evt-001');
    assert.ok(orphan, '应存在 evt-001 的孤儿事件记录');
    assert.strictEqual(orphan.event_name, 'OrderPlaced');

    const issue = issues.find((i) => i.category === 'orphan_event');
    assert.ok(issue, 'Issue[] 应包含 orphan_event');
    assert.strictEqual(issue.severity, 'blocker');
    assert.ok(issue.related_element_ids.includes('evt-001'));
  });

  it('应检测缺失命令：事件 trigger.type=command 但 source_id 不存在', () => {
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          trigger: { type: 'command', source_id: 'cmd-missing' },
          business_value: 'high',
        }),
      ],
      commands: [],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    const missing = round3.checks.missing_commands.find((m) =>
      m.description.includes('cmd-missing')
    );
    assert.ok(missing, '应存在 cmd-missing 的缺失命令记录');
    assert.strictEqual(missing.severity, 'high');
    assert.strictEqual(missing.suggested_command_name, 'PlaceOrder');

    const issue = issues.find((i) => i.category === 'missing_command');
    assert.ok(issue, 'Issue[] 应包含 missing_command');
    assert.ok(issue.title.includes('PlaceOrder'));
  });

  it('应检测术语冲突：同一别名对应多个术语', () => {
    const round1 = buildRound1({
      terms: [
        buildTerm({ id: 'term-001', term: 'Order', aliases: ['订单'] }),
        buildTerm({ id: 'term-002', term: 'Booking', aliases: ['订单'] }),
      ],
    });
    const round2 = buildRound2();

    const { round3, issues } = detectAnomalies(round1, round2);

    const conflict = round3.checks.term_conflicts.find(
      (c) => c.term_ids.includes('term-001') && c.term_ids.includes('term-002')
    );
    assert.ok(conflict, '应检测到两个术语共享别名“订单”');
    assert.strictEqual(conflict.suggested_action, 'unify');

    const issue = issues.find((i) => i.category === 'term_conflict');
    assert.ok(issue, 'Issue[] 应包含 term_conflict');
    assert.ok(issue.title.includes('Order'));
    assert.ok(issue.title.includes('Booking'));
  });

  it('应检测聚合边界模糊：命令产生的事件归属不同聚合', () => {
    const round2 = buildRound2({
      commands: [
        buildCommand({ id: 'cmd-001', name: 'PlaceOrder', target_aggregate_id: 'agg-001' }),
      ],
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          aggregate_id: 'agg-002',
          trigger: { type: 'command', source_id: 'cmd-001' },
        }),
      ],
      aggregates: [
        buildAggregate({ id: 'agg-001', name: 'Order' }),
        buildAggregate({ id: 'agg-002', name: 'Inventory' }),
      ],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    const ambiguity = round3.checks.boundary_ambiguities.find(
      (b) => b.aggregate_ids.includes('agg-001') && b.aggregate_ids.includes('agg-002')
    );
    assert.ok(ambiguity, '应检测到聚合边界模糊');
    assert.strictEqual(ambiguity.overlap_type, 'lifecycle');

    const issue = issues.find((i) => i.category === 'boundary_ambiguity');
    assert.ok(issue, 'Issue[] 应包含 boundary_ambiguity');
    assert.ok(issue.description.includes('PlaceOrder'));
  });

  it('应检测循环依赖：事件-策略-命令形成环', () => {
    const round2 = buildRound2({
      commands: [
        buildCommand({ id: 'cmd-001', name: 'PlaceOrder', target_aggregate_id: 'agg-001' }),
      ],
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-001' },
        }),
      ],
      policies: [
        buildPolicy({
          id: 'pol-001',
          name: 'RetryPolicy',
          trigger_event_id: 'evt-001',
          outcome: { type: 'command', target_id: 'cmd-001' },
        }),
      ],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    assert.strictEqual(round3.checks.circular_dependencies.length, 1, '应检测到一个循环依赖');
    const cycle = round3.checks.circular_dependencies[0];
    assert.ok(cycle.cycle_path.length > 0, 'cycle_path 不应为空');
    assert.strictEqual(
      cycle.cycle_path[0],
      cycle.cycle_path[cycle.cycle_path.length - 1],
      'cycle_path 首尾应相同'
    );
    assert.ok(
      cycle.cycle_path.includes('cmd-001') &&
        cycle.cycle_path.includes('evt-001') &&
        cycle.cycle_path.includes('pol-001')
    );

    const issue = issues.find((i) => i.category === 'circular_dependency');
    assert.ok(issue, 'Issue[] 应包含 circular_dependency');
    assert.ok(['high', 'medium'].includes(issue.severity));
  });

  it('应检测 Saga 候选：长度 >=3 的事件链且跨聚合/外部系统', () => {
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-001' },
        }),
        buildEvent({
          id: 'evt-002',
          name: 'PaymentPaid',
          aggregate_id: 'agg-002',
          trigger: { type: 'event', source_id: 'evt-001' },
        }),
        buildEvent({
          id: 'evt-003',
          name: 'OrderShipped',
          aggregate_id: 'agg-001',
          trigger: { type: 'event', source_id: 'evt-002' },
        }),
      ],
      commands: [
        buildCommand({ id: 'cmd-001', name: 'PlaceOrder', target_aggregate_id: 'agg-001' }),
      ],
      aggregates: [
        buildAggregate({ id: 'agg-001', name: 'Order' }),
        buildAggregate({ id: 'agg-002', name: 'Payment' }),
      ],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    assert.ok(round3.checks.saga_candidates.length >= 1, '应检测到至少一个 Saga 候选');
    const saga = round3.checks.saga_candidates[0];
    assert.ok(saga.event_chain.length >= 3, 'Saga 事件链长度应 >=3');
    assert.ok(saga.involved_aggregates.length >= 2, 'Saga 应跨聚合');

    const issue = issues.find((i) => i.category === 'saga_candidate');
    assert.ok(issue, 'Issue[] 应包含 saga_candidate');
  });

  it('应检测缺失补偿事件：Saga 关键事件缺少对应补偿', () => {
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-001' },
        }),
        buildEvent({
          id: 'evt-002',
          name: 'PaymentPaid',
          aggregate_id: 'agg-002',
          trigger: { type: 'event', source_id: 'evt-001' },
        }),
        buildEvent({
          id: 'evt-003',
          name: 'OrderShipped',
          aggregate_id: 'agg-001',
          trigger: { type: 'event', source_id: 'evt-002' },
        }),
        buildEvent({
          id: 'evt-004',
          name: 'OrderCancelled',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-002' },
        }),
      ],
      commands: [
        buildCommand({ id: 'cmd-001', name: 'PlaceOrder', target_aggregate_id: 'agg-001' }),
        buildCommand({ id: 'cmd-002', name: 'CancelOrder', target_aggregate_id: 'agg-001' }),
      ],
      aggregates: [
        buildAggregate({ id: 'agg-001', name: 'Order' }),
        buildAggregate({ id: 'agg-002', name: 'Payment' }),
      ],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    assert.ok(round3.checks.saga_candidates.length >= 1, '应先存在 Saga 候选');
    const missing = round3.checks.missing_compensations.find(
      (m) => m.event_name === 'PaymentPaid' && m.suggested_compensation_event === 'PaymentRefunded'
    );
    assert.ok(missing, '应检测到 PaymentPaid 缺少 PaymentRefunded 补偿');

    const issue = issues.find((i) => i.category === 'missing_compensation');
    assert.ok(issue, 'Issue[] 应包含 missing_compensation');
  });

  it('应检测性能风险：高频事件、同步外部调用、热读模型、过大聚合', () => {
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-001' },
        }),
        buildEvent({
          id: 'evt-002',
          name: 'OrderPaid',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-002' },
        }),
        buildEvent({
          id: 'evt-003',
          name: 'OrderShipped',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-003' },
        }),
        buildEvent({
          id: 'evt-004',
          name: 'OrderDelivered',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-004' },
        }),
        buildEvent({
          id: 'evt-005',
          name: 'OrderCompleted',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-005' },
        }),
        buildEvent({
          id: 'evt-006',
          name: 'OrderCancelled',
          aggregate_id: 'agg-001',
          trigger: { type: 'command', source_id: 'cmd-006' },
        }),
      ],
      commands: [
        buildCommand({ id: 'cmd-001', name: 'PlaceOrder', target_aggregate_id: 'agg-001' }),
        buildCommand({ id: 'cmd-002', name: 'PayOrder', target_aggregate_id: 'agg-001' }),
      ],
      aggregates: [buildAggregate({ id: 'agg-001', name: 'Order' })],
      external_systems: [
        buildExternalSystem({
          id: 'ext-001',
          name: 'PaymentGateway',
          integration_type: 'api',
          events_consumed: ['evt-002'],
        }),
      ],
      read_models: [
        {
          id: 'rm-001',
          name: 'OrderStatusView',
          consumer: '用户界面',
          data_source: 'Order 投影',
          events_subscribed: ['evt-001', 'evt-002', 'evt-003', 'evt-004'],
        },
      ],
    });

    const { round3, issues } = detectAnomalies(buildRound1(), round2);

    assert.ok(round3.checks.performance_risks.length >= 3, '应检测到至少 3 类性能风险');
    assert.ok(
      round3.checks.performance_risks.some((r) => r.category === 'high_frequency_event'),
      '应存在 high_frequency_event'
    );
    assert.ok(
      round3.checks.performance_risks.some((r) => r.category === 'synchronous_external_call'),
      '应存在 synchronous_external_call'
    );
    assert.ok(
      round3.checks.performance_risks.some((r) => r.category === 'hot_read_model'),
      '应存在 hot_read_model'
    );
    assert.ok(
      round3.checks.performance_risks.some((r) => r.category === 'large_aggregate'),
      '应存在 large_aggregate'
    );

    const issue = issues.find((i) => i.category === 'performance_risk');
    assert.ok(issue, 'Issue[] 应包含 performance_risk');
  });

  it('空输入时应降级且不抛错', () => {
    assert.doesNotThrow(() => {
      const { round3, issues } = detectAnomalies(null, undefined);
      assert.strictEqual(round3.round, 3);
      assert.deepStrictEqual(round3.checks.orphan_events, []);
      assert.deepStrictEqual(round3.checks.missing_commands, []);
      assert.deepStrictEqual(round3.checks.term_conflicts, []);
      assert.deepStrictEqual(round3.checks.boundary_ambiguities, []);
      assert.deepStrictEqual(round3.checks.circular_dependencies, []);
      assert.deepStrictEqual(round3.checks.saga_candidates, []);
      assert.deepStrictEqual(round3.checks.missing_compensations, []);
      assert.deepStrictEqual(round3.checks.performance_risks, []);
      assert.deepStrictEqual(issues, []);
    });
  });

  it('Issue[] 转换结果应符合 schema 形状', () => {
    const round1 = buildRound1({
      terms: [
        buildTerm({ id: 'term-001', term: 'Order', aliases: ['订单'] }),
        buildTerm({ id: 'term-002', term: 'Booking', aliases: ['订单'] }),
      ],
    });
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          trigger: { type: 'command', source_id: 'cmd-missing' },
        }),
      ],
      commands: [],
    });

    const { issues } = detectAnomalies(round1, round2);
    assert.ok(issues.length > 0, '应至少产生一个问题');

    for (const issue of issues) {
      assert.strictEqual(typeof issue.id, 'string');
      assert.ok(['blocker', 'high', 'medium', 'low'].includes(issue.severity));
      assert.ok(
        [
          'orphan_event',
          'missing_command',
          'term_conflict',
          'boundary_ambiguity',
          'circular_dependency',
          'hot_spot',
          'saga_candidate',
          'missing_compensation',
          'performance_risk',
        ].includes(issue.category)
      );
      assert.strictEqual(typeof issue.title, 'string');
      assert.strictEqual(typeof issue.description, 'string');
      assert.ok(Array.isArray(issue.related_element_ids));
      assert.strictEqual(typeof issue.suggested_action, 'string');
    }

    // ID 应按顺序生成
    assert.strictEqual(issues[0].id, 'issue-001');
    if (issues.length > 1) {
      assert.strictEqual(issues[1].id, 'issue-002');
    }
  });
});
