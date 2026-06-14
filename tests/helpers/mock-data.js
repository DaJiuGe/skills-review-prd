/**
 * @fileoverview review-prd 单元测试用 mock 数据构造辅助函数
 */

export function buildRound1(overrides = {}) {
  return {
    version: '1.0',
    round: 1,
    prd_metadata: {
      title: '测试 PRD',
      total_sections: 3,
      estimated_lines: 100,
    },
    terms: [],
    conflicts: [],
    summary: {
      total_terms: 0,
      new_terms: 0,
      conflict_count: 0,
    },
    ...overrides,
  };
}

export function buildTerm({
  id = 'term-001',
  term = 'Order',
  aliases = [],
  definition = '',
  domain_category = 'core',
} = {}) {
  return {
    id,
    term,
    aliases,
    definition,
    domain_category,
    source_location: [
      {
        section_title: '1. 项目背景',
        paragraph_index: 1,
        approximate_line: 10,
        quote: `${term} 相关描述`,
      },
    ],
    first_introduced: true,
  };
}

export function buildRound2(overrides = {}) {
  return {
    version: '1.0',
    round: 2,
    dependencies: {
      round1_term_ids: [],
    },
    events: [],
    commands: [],
    aggregates: [],
    policies: [],
    read_models: [],
    external_systems: [],
    hot_spots: [],
    ...overrides,
  };
}

export function buildEvent({
  id = 'evt-001',
  name = 'OrderPlaced',
  aggregate_id = 'agg-001',
  trigger = { type: 'command', source_id: 'cmd-001' },
  business_value = 'high',
  description = '',
} = {}) {
  return {
    id,
    name,
    past_tense_verb: name.replace(/^[A-Z][a-z]+/, '').replace(/[A-Z].*$/, ''),
    aggregate_id,
    trigger,
    description,
    source_location: [
      {
        section_title: '1. 项目背景',
        paragraph_index: 1,
        approximate_line: 15,
        quote: `${name} 触发描述`,
      },
    ],
    term_ids: [],
    business_value,
  };
}

export function buildCommand({
  id = 'cmd-001',
  name = 'PlaceOrder',
  target_aggregate_id = 'agg-001',
  actor = 'User',
} = {}) {
  return {
    id,
    name,
    intent: name,
    actor,
    target_aggregate_id,
    description: `${name} 描述`,
    source_location: [
      {
        section_title: '1. 项目背景',
        paragraph_index: 1,
        approximate_line: 12,
        quote: `${name} 命令描述`,
      },
    ],
    term_ids: [],
  };
}

export function buildAggregate({
  id = 'agg-001',
  name = 'Order',
  responsibilities = [],
  boundary_indicators = [],
} = {}) {
  return {
    id,
    name,
    responsibilities,
    invariants: [],
    boundary_indicators,
    source_location: [],
    term_ids: [],
  };
}

export function buildPolicy({
  id = 'pol-001',
  name = 'AutoRefundPolicy',
  trigger_event_id = 'evt-001',
  outcome = { type: 'command', target_id: 'cmd-002' },
} = {}) {
  return {
    id,
    name,
    trigger_event_id,
    outcome,
  };
}

export function buildExternalSystem({
  id = 'ext-001',
  name = 'PaymentGateway',
  integration_type = 'api',
  events_consumed = [],
  events_produced = [],
} = {}) {
  return {
    id,
    name,
    integration_type,
    events_consumed,
    events_produced,
    description: `${name} 描述`,
  };
}

export function buildRound4(overrides = {}) {
  return {
    version: '1.0',
    round: 4,
    dependencies: {
      round1_summary: {},
      round2_elements: {},
      round3_issues: [],
    },
    mermaid_sequence_diagram: 'sequenceDiagram\n    A->>B: msg',
    mermaid_boundary_diagram: 'graph TB\n    A-->B',
    term_heatmap_data: {
      chapters: [],
      global_average: 0,
      most_inconsistent_terms: [],
    },
    review_summary: {
      executive_summary: '摘要',
      key_findings: [],
      recommendations: [],
      risk_assessment: {
        overall_risk: 'medium',
        rationale: '原因',
      },
    },
    report_metadata: {
      generated_at: new Date().toISOString(),
      prd_title: '测试 PRD',
      total_issues: 0,
      blocker_count: 0,
      high_count: 0,
      medium_count: 0,
      low_count: 0,
    },
    ...overrides,
  };
}

export function buildReportDataInput(overrides = {}) {
  return {
    prdPath: '/path/to/prd.md',
    prdTitle: '测试 PRD',
    round1: buildRound1({
      terms: [buildTerm({ id: 'term-001', term: 'Order', aliases: ['订单'] })],
    }),
    round2: buildRound2(),
    round3: { version: '1.0', round: 3, checks: {} },
    issues: [],
    round4: buildRound4(),
    ...overrides,
  };
}
