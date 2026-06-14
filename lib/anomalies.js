/**
 * @fileoverview EventStorming 一致性检查 / 异常检测（Round 3）
 *
 * 输入：Round1_TerminologyExtraction（schema-design.md §3） +
 *       Round2_EventStormingElements（schema-design.md §4）
 * 输出：Round3_ConsistencyCheck（schema-design.md §5） + 统一 Issue[] 供 Round4 使用
 *
 * 特点：
 * - 纯函数，不依赖终端 / IO / 全局状态
 * - 输入为空或字段缺失时返回降级结果，不抛错
 * - 保留原 prototypes/event-storming-review/core/anomalies.js 的检测思想，
 *   但数据结构完全 schema 化
 */

/** @typedef {'blocker'|'high'|'medium'|'low'} Severity */

/** @typedef {Object} SourceLocation
 * @property {string} section_title
 * @property {number} paragraph_index
 * @property {number} approximate_line
 * @property {string} quote
 */

/** @typedef {Object} TermEntry
 * @property {string} id
 * @property {string} term
 * @property {string[]} aliases
 * @property {string} [definition]
 * @property {SourceLocation[]} source_location
 * @property {string} [domain_category]
 */

/** @typedef {Object} TermConflict
 * @property {string} id
 * @property {Severity} severity
 * @property {string} type
 * @property {string} term_a_id
 * @property {string} term_b_id
 * @property {string} description
 * @property {string} [suggested_resolution]
 */

/** @typedef {Object} Round1_TerminologyExtraction
 * @property {string} version
 * @property {number} round
 * @property {TermEntry[]} terms
 * @property {TermConflict[]} conflicts
 * @property {Object} [summary]
 */

/** @typedef {Object} DomainEvent
 * @property {string} id
 * @property {string} name
 * @property {string} [past_tense_verb]
 * @property {string} aggregate_id
 * @property {{type:string, source_id:string}|null|undefined} [trigger]
 * @property {SourceLocation[]} [source_location]
 * @property {'high'|'medium'|'low'} [business_value]
 */

/** @typedef {Object} Command
 * @property {string} id
 * @property {string} name
 * @property {string} target_aggregate_id
 * @property {SourceLocation[]} [source_location]
 */

/** @typedef {Object} Aggregate
 * @property {string} id
 * @property {string} name
 * @property {string[]} [responsibilities]
 * @property {string[]} [boundary_indicators]
 */

/** @typedef {Object} Policy
 * @property {string} id
 * @property {string} name
 * @property {string} trigger_event_id
 * @property {{type:string, target_id:string}|null|undefined} [outcome]
 */

/** @typedef {Object} ExternalSystem
 * @property {string} id
 * @property {string} name
 * @property {string} [integration_type]
 * @property {string[]} [events_consumed]
 * @property {string[]} [events_produced]
 */

/** @typedef {Object} ReadModel
 * @property {string} id
 * @property {string} name
 * @property {string} consumer
 * @property {string} data_source
 * @property {string[]} [events_subscribed]
 */

/** @typedef {Object} HotSpot
 * @property {string} id
 * @property {string} category
 * @property {string} description
 * @property {string[]} related_element_ids
 * @property {Severity} severity
 */

/** @typedef {Object} Round2_EventStormingElements
 * @property {string} version
 * @property {number} round
 * @property {DomainEvent[]} events
 * @property {Command[]} commands
 * @property {Aggregate[]} aggregates
 * @property {Policy[]} policies
 * @property {ExternalSystem[]} [external_systems]
 * @property {ReadModel[]} [read_models]
 * @property {HotSpot[]} [hot_spots]
 */

/** @typedef {Object} OrphanEvent
 * @property {string} event_id
 * @property {string} event_name
 * @property {Severity} severity
 * @property {string} hypothesis
 * @property {string} [suggested_command]
 */

/** @typedef {Object} MissingCommand
 * @property {string} description
 * @property {Severity} severity
 * @property {string} suggested_command_name
 * @property {string} target_aggregate_id
 * @property {SourceLocation[]} source_location
 */

/** @typedef {Object} TermConflictDetail
 * @property {string[]} term_ids
 * @property {Severity} severity
 * @property {string} description
 * @property {{term_id:string, locations:SourceLocation[]}[]} occurrences
 * @property {'unify'|'split_concept'|'clarify_definition'|'ignore'} suggested_action
 */

/** @typedef {Object} BoundaryAmbiguity
 * @property {string[]} aggregate_ids
 * @property {Severity} severity
 * @property {string} description
 * @property {'responsibility'|'data_ownership'|'lifecycle'|'team_ownership'} overlap_type
 * @property {string} suggested_action
 */

/** @typedef {Object} CircularDependency
 * @property {string[]} cycle_path
 * @property {Severity} severity
 * @property {string} description
 * @property {string[]} break_suggestions
 */

/** @typedef {Object} HotSpotReview
 * @property {string} hot_spot_id
 * @property {'confirmed'|'mitigated'|'false_positive'} resolution
 * @property {string} reason
 */

/** @typedef {Object} SagaCandidate
 * @property {string} id
 * @property {string} name
 * @property {string[]} event_chain
 * @property {string[]} involved_aggregates
 * @property {string[]} involved_external_systems
 * @property {Severity} severity
 * @property {string} description
 * @property {string} suggested_saga_name
 */

/** @typedef {Object} MissingCompensation
 * @property {string} saga_candidate_id
 * @property {string} event_id
 * @property {string} event_name
 * @property {Severity} severity
 * @property {string} description
 * @property {string} suggested_compensation_event
 */

/** @typedef {Object} PerformanceRisk
 * @property {string} id
 * @property {'high_frequency_event'|'synchronous_external_call'|'hot_read_model'|'large_aggregate'} category
 * @property {Severity} severity
 * @property {string} description
 * @property {string[]} related_element_ids
 * @property {string} suggested_action
 */

/** @typedef {Object} Round3_ConsistencyCheck
 * @property {string} version
 * @property {number} round
 * @property {Object} dependencies
 * @property {string[]} dependencies.round1_term_ids
 * @property {string[]} dependencies.round2_event_ids
 * @property {string[]} dependencies.round2_command_ids
 * @property {string[]} dependencies.round2_aggregate_ids
 * @property {string[]} dependencies.round2_policy_ids
 * @property {Object} checks
 * @property {OrphanEvent[]} checks.orphan_events
 * @property {MissingCommand[]} checks.missing_commands
 * @property {TermConflictDetail[]} checks.term_conflicts
 * @property {BoundaryAmbiguity[]} checks.boundary_ambiguities
 * @property {CircularDependency[]} checks.circular_dependencies
 * @property {HotSpotReview[]} checks.hot_spot_reviews
 * @property {SagaCandidate[]} checks.saga_candidates
 * @property {MissingCompensation[]} checks.missing_compensations
 * @property {PerformanceRisk[]} checks.performance_risks
 * @property {Object} metrics
 * @property {number} metrics.event_command_ratio
 * @property {number} metrics.aggregate_count
 * @property {number} metrics.external_system_count
 * @property {number} metrics.policy_density
 */

/** @typedef {Object} Issue
 * @property {string} id
 * @property {Severity} severity
 * @property {'orphan_event'|'missing_command'|'term_conflict'|'boundary_ambiguity'|'circular_dependency'|'hot_spot'|'saga_candidate'|'missing_compensation'|'performance_risk'} category
 * @property {string} title
 * @property {string} description
 * @property {string[]} related_element_ids
 * @property {string} suggested_action
 */

// ---------------------------------------------------------------------------
// 输入校验 / 降级
// ---------------------------------------------------------------------------

/**
 * 规范化输入：空/缺失字段替换为空数组，避免后续代码抛错。
 * @param {Round1_TerminologyExtraction|null|undefined} round1
 * @param {Round2_EventStormingElements|null|undefined} round2
 * @returns {{round1:Round1_TerminologyExtraction, round2:Round2_EventStormingElements, degraded:boolean}}
 */
function normalizeInputs(round1, round2) {
  const degraded = !round1 || !round2;
  return {
    round1: {
      version: round1?.version ?? '1.0',
      round: round1?.round ?? 1,
      terms: Array.isArray(round1?.terms) ? round1.terms : [],
      conflicts: Array.isArray(round1?.conflicts) ? round1.conflicts : [],
    },
    round2: {
      version: round2?.version ?? '1.0',
      round: round2?.round ?? 2,
      events: Array.isArray(round2?.events) ? round2.events : [],
      commands: Array.isArray(round2?.commands) ? round2.commands : [],
      aggregates: Array.isArray(round2?.aggregates) ? round2.aggregates : [],
      policies: Array.isArray(round2?.policies) ? round2.policies : [],
      external_systems: Array.isArray(round2?.external_systems) ? round2.external_systems : [],
      read_models: Array.isArray(round2?.read_models) ? round2.read_models : [],
      hot_spots: Array.isArray(round2?.hot_spots) ? round2.hot_spots : [],
    },
    degraded,
  };
}

/** @returns {Round3_ConsistencyCheck} */
function emptyRound3() {
  return {
    version: '1.0',
    round: 3,
    dependencies: {
      round1_term_ids: [],
      round2_event_ids: [],
      round2_command_ids: [],
      round2_aggregate_ids: [],
      round2_policy_ids: [],
    },
    checks: {
      orphan_events: [],
      missing_commands: [],
      term_conflicts: [],
      boundary_ambiguities: [],
      circular_dependencies: [],
      hot_spot_reviews: [],
      saga_candidates: [],
      missing_compensations: [],
      performance_risks: [],
    },
    metrics: {
      event_command_ratio: 0,
      aggregate_count: 0,
      external_system_count: 0,
      policy_density: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { blocker: 0, high: 1, medium: 2, low: 3 };

/** @param {Severity} a @param {Severity} b @returns {Severity} */
function _worseSeverity(a, b) {
  return (SEVERITY_ORDER[a] ?? 2) <= (SEVERITY_ORDER[b] ?? 2) ? a : b;
}

/** @param {string} id @param {string} prefix @returns {string} */
function _safeId(id, prefix = '') {
  return id ? `${prefix}${id}` : `${prefix}unknown`;
}

/** @param {string[]} list @returns {string} */
function uniqueSorted(list) {
  return [...new Set(list)].sort();
}

/** @param {string} name @returns {string} */
function deriveCommandNameFromEventName(name) {
  const common = {
    Placed: 'Place',
    Confirmed: 'Confirm',
    Cancelled: 'Cancel',
    Canceled: 'Cancel',
    Rejected: 'Reject',
    Approved: 'Approve',
    Submitted: 'Submit',
    Adjusted: 'Adjust',
    Created: 'Create',
    Updated: 'Update',
    Deleted: 'Delete',
    Paid: 'Pay',
    Shipped: 'Ship',
    Delivered: 'Deliver',
    Returned: 'Return',
    Refunded: 'Refund',
    Expired: 'Expire',
    Activated: 'Activate',
    Deactivated: 'Deactivate',
  };
  for (const [past, command] of Object.entries(common)) {
    if (name.endsWith(past)) {
      return command + name.slice(0, -past.length);
    }
  }
  return `Handle${name}`;
}

/** @param {string} name @returns {string} */
function deriveCompensationEventName(name) {
  const pairs = {
    Placed: 'Cancelled',
    Confirmed: 'Cancelled',
    Paid: 'Refunded',
    Shipped: 'Returned',
    Created: 'Cancelled',
    Submitted: 'Rejected',
    Approved: 'Rejected',
    Locked: 'Unlocked',
    Sent: 'Recalled',
  };
  for (const [past, comp] of Object.entries(pairs)) {
    if (name.endsWith(past)) {
      const prefix = name.slice(0, -past.length);
      return prefix + comp;
    }
  }
  return '';
}

/** @param {DomainEvent} event @returns {{hypothesis:string, suggested_command?:string}} */
function guessOrphanTrigger(event) {
  const n = event.name || '';
  if (/Payment|Confirm|Receipt|Callback|Webhook|External|Notify/i.test(n)) {
    return {
      hypothesis: '可能由外部系统异步回调触发',
    };
  }
  if (/Time|Schedule|Daily|Hourly|Expired|Timeout/i.test(n)) {
    return {
      hypothesis: '可能由定时任务或时间规则触发',
    };
  }
  if (/Policy|Auto|Rule/i.test(n)) {
    return {
      hypothesis: '可能由策略（Policy）自动触发',
    };
  }
  const suggested = deriveCommandNameFromEventName(n);
  return {
    hypothesis: '可能缺少显式命令触发该事件',
    suggested_command: suggested,
  };
}

// ---------------------------------------------------------------------------
// 1. 孤儿事件（OrphanEvent）
// ---------------------------------------------------------------------------

/**
 * 原算法：找出没有命令触发的事件。
 * Schema 化后：根据 DomainEvent.trigger 判断触发源是否存在/有效。
 * - trigger 缺失 / type 或 source_id 缺失 → 孤儿
 * - trigger.type=command/policy/external_system/time/event 但 source_id 无法解析 → 孤儿
 */
function findOrphanEvents(round2) {
  const commandMap = new Map(round2.commands.map((c) => [c.id, c]));
  const policyMap = new Map(round2.policies.map((p) => [p.id, p]));
  const eventMap = new Map(round2.events.map((e) => [e.id, e]));
  const externalMap = new Map(round2.external_systems.map((e) => [e.id, e]));

  return round2.events
    .filter((event) => {
      const trigger = event.trigger;
      if (!trigger || !trigger.type || !trigger.source_id) return true;
      switch (trigger.type) {
        case 'command':
          return !commandMap.has(trigger.source_id);
        case 'policy':
          return !policyMap.has(trigger.source_id);
        case 'external_system':
          return !externalMap.has(trigger.source_id);
        case 'time':
          return false;
        case 'event':
          return !eventMap.has(trigger.source_id);
        default:
          return true;
      }
    })
    .map((event) => {
      const { hypothesis, suggested_command } = guessOrphanTrigger(event);
      let severity = 'medium';
      if (event.business_value === 'high') severity = 'blocker';
      else if (event.business_value === 'medium') severity = 'high';
      else if (event.business_value === 'low') severity = 'medium';

      /** @type {OrphanEvent} */
      const result = {
        event_id: event.id,
        event_name: event.name,
        severity,
        hypothesis,
      };
      if (suggested_command) result.suggested_command = suggested_command;
      return result;
    });
}

// ---------------------------------------------------------------------------
// 2. 缺失命令（MissingCommand）
// ---------------------------------------------------------------------------

/**
 * 原算法：检查预定义命令名是否缺失。
 * Schema 化后：从事件 / 策略中反推“应该存在却未提取”的命令。
 * - 事件 trigger.type='command' 但 source_id 指向的命令不存在
 * - 策略 outcome.type='command' 但 target_id 指向的命令不存在
 */
function findMissingCommands(round2) {
  const commandIds = new Set(round2.commands.map((c) => c.id));
  const eventMap = new Map(round2.events.map((e) => [e.id, e]));

  /** @type {MissingCommand[]} */
  const results = [];

  for (const event of round2.events) {
    const trigger = event.trigger;
    if (trigger?.type === 'command' && trigger.source_id && !commandIds.has(trigger.source_id)) {
      const suggested = deriveCommandNameFromEventName(event.name);
      results.push({
        description: `事件 "${event.name}" 声明由命令 "${trigger.source_id}" 触发，但该命令未在 Round2 中提取`,
        severity: event.business_value === 'high' ? 'high' : 'medium',
        suggested_command_name: suggested,
        target_aggregate_id: event.aggregate_id,
        source_location: event.source_location || [],
      });
    }
  }

  for (const policy of round2.policies) {
    const outcome = policy.outcome;
    if (outcome?.type === 'command' && outcome.target_id && !commandIds.has(outcome.target_id)) {
      const triggerEvent = eventMap.get(policy.trigger_event_id);
      results.push({
        description: `策略 "${policy.name}" 执行后需要命令 "${outcome.target_id}"，但该命令未在 Round2 中提取`,
        severity: 'medium',
        suggested_command_name: deriveCommandNameFromEventName(
          triggerEvent?.name || outcome.target_id
        ),
        target_aggregate_id: triggerEvent?.aggregate_id || '',
        source_location: triggerEvent?.source_location || [],
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. 术语冲突（TermConflictDetail）
// ---------------------------------------------------------------------------

/**
 * 原算法：同一别名对应多个术语即冲突。
 * Schema 化后：
 * - 先把 Round1 已标记的 TermConflict 转成 TermConflictDetail（带 occurrences）
 * - 再基于 Round1.terms 的 aliases 做别名重叠检测，避免遗漏
 */
function findTermConflicts(round1) {
  const termMap = new Map(round1.terms.map((t) => [t.id, t]));
  /** @type {TermConflictDetail[]} */
  const results = [];
  const seenTermIdSets = new Set();

  const addDetail = (termIds, severity, description, suggestedAction) => {
    const key = uniqueSorted(termIds).join(',');
    if (!key || seenTermIdSets.has(key)) return;
    seenTermIdSets.add(key);
    results.push({
      term_ids: uniqueSorted(termIds),
      severity,
      description,
      occurrences: uniqueSorted(termIds).map((id) => ({
        term_id: id,
        locations: termMap.get(id)?.source_location || [],
      })),
      suggested_action: suggestedAction,
    });
  };

  const actionFromType = (type) => {
    switch (type) {
      case 'alias_overlap':
        return 'unify';
      case 'homonym':
        return 'split_concept';
      case 'inconsistent_definition':
        return 'clarify_definition';
      case 'external_conflict':
        return 'clarify_definition';
      default:
        return 'clarify_definition';
    }
  };

  for (const conflict of round1.conflicts) {
    const ids = [conflict.term_a_id, conflict.term_b_id].filter(Boolean);
    addDetail(
      ids,
      conflict.severity || 'medium',
      conflict.description || '',
      actionFromType(conflict.type)
    );
  }

  const aliasToTermIds = new Map();
  for (const term of round1.terms) {
    for (const alias of term.aliases || []) {
      const key = String(alias).toLowerCase();
      if (!aliasToTermIds.has(key)) aliasToTermIds.set(key, new Set());
      aliasToTermIds.get(key).add(term.id);
    }
  }

  for (const [alias, idsSet] of aliasToTermIds) {
    const ids = [...idsSet];
    if (ids.length > 1) {
      const hasCore = ids.some((id) => termMap.get(id)?.domain_category === 'core');
      addDetail(
        ids,
        hasCore ? 'blocker' : 'medium',
        `术语别名 "${alias}" 同时对应多个术语，存在歧义`,
        'unify'
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. 聚合边界模糊（BoundaryAmbiguity）
// ---------------------------------------------------------------------------

/**
 * 原算法：命令产生的事件归属不同 boundary，或策略跨 boundary 连接事件与命令。
 * Schema 化后：由于 Aggregate 没有显式 boundary 字段，使用 aggregate_id 作为边界代理，
 * 并额外检测 responsibilities / boundary_indicators 的重叠。
 */
function findBoundaryAmbiguities(round2) {
  const eventMap = new Map(round2.events.map((e) => [e.id, e]));
  const commandMap = new Map(round2.commands.map((c) => [c.id, c]));

  /** @type {BoundaryAmbiguity[]} */
  const results = [];
  const seenPairs = new Set();

  const add = (idA, idB, overlapType, description, severity) => {
    if (!idA || !idB || idA === idB) return;
    const key = [idA, idB].sort().join('|');
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    results.push({
      aggregate_ids: [idA, idB].sort(),
      severity,
      description,
      overlap_type: overlapType,
      suggested_action: '重新划分聚合职责，或引入读模型 / 反腐化层 / 异步事件解耦',
    });
  };

  // 命令产生的事件归属不同聚合 → 生命周期边界模糊
  for (const command of round2.commands) {
    for (const event of round2.events) {
      const trigger = event.trigger;
      if (trigger?.type === 'command' && trigger.source_id === command.id) {
        if (event.aggregate_id !== command.target_aggregate_id) {
          add(
            command.target_aggregate_id,
            event.aggregate_id,
            'lifecycle',
            `命令 "${command.name}" 归属聚合 "${command.target_aggregate_id}"，但其产生的事件 "${event.name}" 归属聚合 "${event.aggregate_id}"`,
            'high'
          );
        }
      }
    }
  }

  // 策略连接的事件与命令/事件归属不同聚合 → 职责边界模糊
  for (const policy of round2.policies) {
    const sourceEvent = eventMap.get(policy.trigger_event_id);
    if (!sourceEvent) continue;
    const outcome = policy.outcome;
    if (!outcome) continue;

    if (outcome.type === 'command') {
      const targetCommand = commandMap.get(outcome.target_id);
      if (targetCommand && sourceEvent.aggregate_id !== targetCommand.target_aggregate_id) {
        add(
          sourceEvent.aggregate_id,
          targetCommand.target_aggregate_id,
          'responsibility',
          `策略 "${policy.name}" 将事件 "${sourceEvent.name}" 与命令 "${targetCommand.name}" 跨聚合连接`,
          'medium'
        );
      }
    } else if (outcome.type === 'event') {
      const targetEvent = eventMap.get(outcome.target_id);
      if (targetEvent && sourceEvent.aggregate_id !== targetEvent.aggregate_id) {
        add(
          sourceEvent.aggregate_id,
          targetEvent.aggregate_id,
          'lifecycle',
          `策略 "${policy.name}" 将事件 "${sourceEvent.name}" 与事件 "${targetEvent.name}" 跨聚合连接`,
          'medium'
        );
      }
    }
  }

  // responsibilities / boundary_indicators 显式重叠
  for (let i = 0; i < round2.aggregates.length; i++) {
    const a = round2.aggregates[i];
    for (let j = i + 1; j < round2.aggregates.length; j++) {
      const b = round2.aggregates[j];
      const sharedResp = intersection(a.responsibilities || [], b.responsibilities || []);
      if (sharedResp.length > 0) {
        add(
          a.id,
          b.id,
          'responsibility',
          `聚合 "${a.name}" 与 "${b.name}" 职责重叠：${sharedResp.join('、')}`,
          'medium'
        );
      }
      const sharedBoundary = intersection(a.boundary_indicators || [], b.boundary_indicators || []);
      if (sharedBoundary.length > 0) {
        add(
          a.id,
          b.id,
          'team_ownership',
          `聚合 "${a.name}" 与 "${b.name}" 团队归属 / 边界线索重叠：${sharedBoundary.join('、')}`,
          'low'
        );
      }
    }
  }

  return results;
}

/** @param {string[]} a @param {string[]} b @returns {string[]} */
function intersection(a, b) {
  const setB = new Set(b);
  return [...new Set(a)].filter((x) => setB.has(x));
}

// ---------------------------------------------------------------------------
// 5. 循环依赖（CircularDependency）
// ---------------------------------------------------------------------------

/**
 * 原算法：命令 → 事件 → 策略 → 目标命令，检测长度为 2 的直接回环。
 * Schema 化后：在事件-策略-命令-事件构成的有向图中找环（长度 <= 8），
 * 返回 cycle_path（元素 ID 序列，首尾相同，便于 Round4 在 Mermaid 中高亮）。
 */
function findCircularDependencies(round2) {
  const graph = buildDependencyGraph(round2);
  const cycles = findCycles(graph, 8);

  return cycles.map((cycle) => ({
    cycle_path: cycle,
    severity: cycle.length <= 4 ? 'high' : 'medium',
    description: `元素链形成循环：${cycle.join(' → ')}`,
    break_suggestions: [
      '引入读模型（ReadModel）打破聚合间直接回调',
      '将同步命令改为异步消息 / Saga 编排',
      '抽离第三方上下文或外部系统作为 anticorruption layer',
    ],
  }));
}

/**
 * @param {Round2_EventStormingElements} round2
 * @returns {Map<string, string[]>}
 */
function buildDependencyGraph(round2) {
  const graph = new Map();
  const addEdge = (from, to) => {
    if (!from || !to || from === to) return;
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from).add(to);
  };

  for (const cmd of round2.commands) {
    graph.set(cmd.id, graph.get(cmd.id) || new Set());
  }
  for (const evt of round2.events) {
    graph.set(evt.id, graph.get(evt.id) || new Set());
  }
  for (const pol of round2.policies) {
    graph.set(pol.id, graph.get(pol.id) || new Set());
  }
  for (const ext of round2.external_systems) {
    graph.set(ext.id, graph.get(ext.id) || new Set());
  }

  // command -> produced events
  for (const cmd of round2.commands) {
    for (const evt of round2.events) {
      if (evt.trigger?.type === 'command' && evt.trigger.source_id === cmd.id) {
        addEdge(cmd.id, evt.id);
      }
    }
  }

  // event -> policy (triggered by event)
  for (const evt of round2.events) {
    for (const pol of round2.policies) {
      if (pol.trigger_event_id === evt.id) {
        addEdge(evt.id, pol.id);
      }
    }
  }

  // event -> next event (event chain)
  for (const evt of round2.events) {
    if (evt.trigger?.type === 'event' && evt.trigger.source_id) {
      addEdge(evt.trigger.source_id, evt.id);
    }
  }

  // policy -> outcome target
  for (const pol of round2.policies) {
    if (pol.outcome?.target_id) {
      addEdge(pol.id, pol.outcome.target_id);
    }
  }

  // external system <-> events
  for (const ext of round2.external_systems) {
    for (const eid of ext.events_consumed || []) addEdge(eid, ext.id);
    for (const eid of ext.events_produced || []) addEdge(ext.id, eid);
  }

  const result = new Map();
  for (const [k, v] of graph) result.set(k, [...v]);
  return result;
}

/**
 * @param {Map<string, string[]>} graph
 * @param {number} maxDepth
 * @returns {string[][]}
 */
function findCycles(graph, maxDepth = 8) {
  const nodes = [...graph.keys()].sort();
  const cycles = [];
  const seen = new Set();

  for (const start of nodes) {
    const path = [start];
    const inPath = new Set([start]);

    const dfs = (current) => {
      for (const next of graph.get(current) || []) {
        if (next === start && path.length > 1) {
          const cycle = [...path, start];
          const key = canonicalCycleKey(cycle);
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
          continue;
        }
        if (!inPath.has(next) && path.length < maxDepth) {
          inPath.add(next);
          path.push(next);
          dfs(next);
          path.pop();
          inPath.delete(next);
        }
      }
    };

    dfs(start);
  }

  return cycles;
}

/**
 * 把环归一化为唯一键（旋转到最小节点、去尾），避免重复。
 * @param {string[]} cycle
 * @returns {string}
 */
function canonicalCycleKey(cycle) {
  const nodes = cycle.slice(0, -1);
  const n = nodes.length;
  const rotations = [];
  let minIndex = 0;
  for (let i = 1; i < n; i++) {
    if (nodes[i] < nodes[minIndex]) minIndex = i;
  }
  for (let i = 0; i < n; i++) {
    rotations.push(nodes[(minIndex + i) % n]);
  }
  return rotations.join('|');
}

// ---------------------------------------------------------------------------
// 6. Saga / 长流程编排检测
// ---------------------------------------------------------------------------

/**
 * 从事件触发链中找出长度 >= 3 且跨聚合或跨外部系统的 Saga 候选。
 * @param {Round2_EventStormingElements} round2
 * @returns {SagaCandidate[]}
 */
function findSagaCandidates(round2) {
  const eventMap = new Map(round2.events.map((e) => [e.id, e]));
  const nextEvents = new Map();
  for (const evt of round2.events) {
    if (evt.trigger?.type === 'event' && evt.trigger.source_id) {
      if (!nextEvents.has(evt.trigger.source_id)) nextEvents.set(evt.trigger.source_id, []);
      nextEvents.get(evt.trigger.source_id).push(evt.id);
    }
  }

  const externalConsumed = new Map();
  for (const ext of round2.external_systems || []) {
    for (const eid of ext.events_consumed || []) {
      if (!externalConsumed.has(eid)) externalConsumed.set(eid, []);
      externalConsumed.get(eid).push(ext.id);
    }
  }

  /** @type {SagaCandidate[]} */
  const candidates = [];
  const seenKeys = new Set();
  const maxDepth = 8;

  for (const start of round2.events) {
    const path = [start.id];

    const dfs = (currentId) => {
      if (path.length >= 3) {
        const chain = [...path];
        const key = chain.join('->');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const involvedAggs = uniqueSorted(
            chain.map((id) => eventMap.get(id)?.aggregate_id).filter(Boolean)
          );
          const involvedExt = uniqueSorted(chain.flatMap((id) => externalConsumed.get(id) || []));

          if (involvedAggs.length >= 2 || involvedExt.length >= 1) {
            const names = chain.map((id) => eventMap.get(id)?.name || id);
            const sagaName = names.join('');
            candidates.push({
              id: `saga-${String(candidates.length + 1).padStart(3, '0')}`,
              name: `${names.join(' → ')} 流程`,
              event_chain: chain,
              involved_aggregates: involvedAggs,
              involved_external_systems: involvedExt,
              severity: 'high',
              description: `事件链跨越 ${involvedAggs.length} 个聚合${
                involvedExt.length ? ` 和 ${involvedExt.length} 个外部系统` : ''
              }，可能形成 Saga 长事务，建议显式编排并补充补偿事件`,
              suggested_saga_name: sagaName,
            });
          }
        }
      }

      if (path.length < maxDepth) {
        for (const nxt of nextEvents.get(currentId) || []) {
          if (!path.includes(nxt)) {
            path.push(nxt);
            dfs(nxt);
            path.pop();
          }
        }
      }
    };

    dfs(start.id);
  }

  return candidates;
}

/**
 * 检查 Saga 候选链中的关键事件是否缺少补偿事件。
 * @param {Round2_EventStormingElements} round2
 * @param {SagaCandidate[]} sagaCandidates
 * @returns {MissingCompensation[]}
 */
function findMissingCompensations(round2, sagaCandidates) {
  const eventMap = new Map(round2.events.map((e) => [e.id, e]));
  const allEvents = round2.events;
  /** @type {MissingCompensation[]} */
  const results = [];

  for (const saga of sagaCandidates) {
    for (const eventId of saga.event_chain) {
      const evt = eventMap.get(eventId);
      if (!evt) continue;
      const suggested = deriveCompensationEventName(evt.name);
      if (!suggested) continue;

      const hasCompensation = allEvents.some((e) => e.name === suggested);

      if (!hasCompensation) {
        results.push({
          saga_candidate_id: saga.id,
          event_id: evt.id,
          event_name: evt.name,
          severity: 'high',
          description: `Saga "${saga.name}" 中事件 "${evt.name}" 缺少对应的补偿事件，长事务失败时难以回滚`,
          suggested_compensation_event: suggested,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 7. 性能风险检测
// ---------------------------------------------------------------------------

/**
 * 识别可能导致性能问题的设计点。
 * @param {Round2_EventStormingElements} round2
 * @returns {PerformanceRisk[]}
 */
function findPerformanceRisks(round2) {
  /** @type {PerformanceRisk[]} */
  const risks = [];
  let seq = 1;
  const nextId = () => `perf-${String(seq++).padStart(3, '0')}`;

  const eventsByAgg = new Map();
  const commandsByAgg = new Map();
  const commandIdsByAgg = new Map();

  for (const evt of round2.events) {
    if (!eventsByAgg.has(evt.aggregate_id)) eventsByAgg.set(evt.aggregate_id, []);
    eventsByAgg.get(evt.aggregate_id).push(evt);
  }
  for (const cmd of round2.commands) {
    if (!commandsByAgg.has(cmd.target_aggregate_id)) {
      commandsByAgg.set(cmd.target_aggregate_id, 0);
      commandIdsByAgg.set(cmd.target_aggregate_id, []);
    }
    commandsByAgg.set(cmd.target_aggregate_id, commandsByAgg.get(cmd.target_aggregate_id) + 1);
    commandIdsByAgg.get(cmd.target_aggregate_id).push(cmd.id);
  }

  // high_frequency_event & large_aggregate
  for (const agg of round2.aggregates) {
    const cmdCount = commandsByAgg.get(agg.id) || 0;
    const evts = eventsByAgg.get(agg.id) || [];
    const evtIds = evts.map((e) => e.id);

    if (cmdCount > 0 && evts.length > cmdCount * 1.5) {
      risks.push({
        id: nextId(),
        category: 'high_frequency_event',
        severity: evts.length > cmdCount * 2 ? 'high' : 'medium',
        description: `聚合 "${agg.name}" 上命令数为 ${cmdCount}，事件数为 ${evts.length}，事件产出密度偏高，可能导致并发冲突或消息风暴`,
        related_element_ids: [agg.id, ...evtIds, ...(commandIdsByAgg.get(agg.id) || [])],
        suggested_action: '为高频事件引入异步事件总线、削峰队列，或将部分事件合并为粗粒度领域事件',
      });
    }

    if (evts.length >= 5 || cmdCount >= 4) {
      risks.push({
        id: nextId(),
        category: 'large_aggregate',
        severity: 'medium',
        description: `聚合 "${agg.name}" 包含 ${evts.length} 个事件、${cmdCount} 个命令，聚合边界过大，可能导致事务范围过大或加载缓慢`,
        related_element_ids: [agg.id, ...evtIds, ...(commandIdsByAgg.get(agg.id) || [])],
        suggested_action:
          '拆分聚合，将生命周期较短的子概念独立为新的聚合，或通过读模型卸载查询压力',
      });
    }
  }

  // synchronous_external_call
  const apiExternals = (round2.external_systems || []).filter(
    (ext) => ext.integration_type === 'api'
  );
  const eventsTriggeredByCommand = round2.events.filter(
    (evt) => evt.trigger?.type === 'command' && evt.trigger.source_id
  );
  const syncRelated = new Set();
  for (const evt of eventsTriggeredByCommand) {
    for (const ext of apiExternals) {
      if ((ext.events_consumed || []).includes(evt.id) && !syncRelated.has(`${evt.id}|${ext.id}`)) {
        syncRelated.add(`${evt.id}|${ext.id}`);
        risks.push({
          id: nextId(),
          category: 'synchronous_external_call',
          severity: 'high',
          description: `命令触发的领域事件 "${evt.name}" 被外部系统 "${ext.name}"（api 集成）同步消费，可能阻塞主流程或放大故障`,
          related_element_ids: [evt.id, evt.trigger.source_id, ext.id],
          suggested_action: '将外部系统调用改为异步消息或 Saga 补偿，避免主事务强依赖外部 API',
        });
      }
    }
  }

  // hot_read_model
  for (const rm of round2.read_models || []) {
    const subscribed = rm.events_subscribed || [];
    const sourceAggs = extractAggregateNamesFromDataSource(rm.data_source, round2.aggregates);
    if (subscribed.length >= 3 || sourceAggs.length >= 2) {
      risks.push({
        id: nextId(),
        category: 'hot_read_model',
        severity: subscribed.length >= 5 || sourceAggs.length >= 3 ? 'high' : 'medium',
        description: `读模型 "${rm.name}" 订阅 ${subscribed.length} 个事件${
          sourceAggs.length > 1 ? ` 并依赖 ${sourceAggs.length} 个聚合` : ''
        }，刷新频率高或数据来源复杂`,
        related_element_ids: [rm.id, ...subscribed],
        suggested_action: '为读模型引入独立投影数据库、事件监听去重或缓存，避免拖累写模型',
      });
    }
  }

  return risks;
}

/**
 * 从 data_source 描述中提取提到的聚合名（简单启发式）。
 * @param {string} dataSource
 * @param {Aggregate[]} aggregates
 * @returns {string[]}
 */
function extractAggregateNamesFromDataSource(dataSource, aggregates) {
  if (!dataSource) return [];
  const found = [];
  for (const agg of aggregates) {
    if (agg.name && dataSource.includes(agg.name)) found.push(agg.name);
  }
  return uniqueSorted(found);
}

// ---------------------------------------------------------------------------
// HotSpot 复核
// ---------------------------------------------------------------------------

function reviewHotSpots(round2) {
  return round2.hot_spots.map((hs) => ({
    hot_spot_id: hs.id,
    resolution: /** @type {'confirmed'|'mitigated'|'false_positive'} */ ('confirmed'),
    reason: '第二轮标记的风险点仍需要人工复核，当前未找到足以推翻的相反证据',
  }));
}

// ---------------------------------------------------------------------------
// 统一 Issue[] 转换
// ---------------------------------------------------------------------------

/**
 * 把 Round3 各类异常转换为 Issue[]，供 Round4 渲染报告。
 * @param {Round3_ConsistencyCheck['checks']} checks
 * @param {Round2_EventStormingElements} round2
 * @param {Round1_TerminologyExtraction} round1
 * @returns {Issue[]}
 */
function checksToIssues(checks, round2, round1) {
  /** @type {Issue[]} */
  const issues = [];
  let seq = 1;
  const nextId = () => `issue-${String(seq++).padStart(3, '0')}`;

  const aggregateMap = new Map(round2.aggregates.map((a) => [a.id, a]));
  const termMap = new Map(round1.terms.map((t) => [t.id, t]));

  for (const item of checks.orphan_events) {
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'orphan_event',
      title: `孤儿事件：${item.event_name}`,
      description: `${item.event_name} 没有明确触发源。${item.hypothesis}${item.suggested_command ? `，建议补充命令 "${item.suggested_command}"` : ''}`,
      related_element_ids: [item.event_id],
      suggested_action: item.suggested_command
        ? `补充命令 "${item.suggested_command}" 或明确触发机制`
        : '明确触发源（外部系统 / 定时任务 / 策略）',
    });
  }

  for (const item of checks.missing_commands) {
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'missing_command',
      title: `缺失命令：${item.suggested_command_name}`,
      description: item.description,
      related_element_ids: uniqueSorted([item.target_aggregate_id]),
      suggested_action: `补充命令 "${item.suggested_command_name}"，并关联到聚合 "${item.target_aggregate_id}"`,
    });
  }

  for (const item of checks.term_conflicts) {
    const names = item.term_ids.map((id) => termMap.get(id)?.term || id).join(' / ');
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'term_conflict',
      title: `术语冲突：${names}`,
      description: item.description,
      related_element_ids: item.term_ids,
      suggested_action: actionToChinese(item.suggested_action),
    });
  }

  for (const item of checks.boundary_ambiguities) {
    const names = item.aggregate_ids.map((id) => aggregateMap.get(id)?.name || id).join(' / ');
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'boundary_ambiguity',
      title: `聚合边界模糊：${names}`,
      description: item.description,
      related_element_ids: item.aggregate_ids,
      suggested_action: item.suggested_action,
    });
  }

  for (const item of checks.circular_dependencies) {
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'circular_dependency',
      title: `循环依赖：${item.cycle_path.slice(0, -1).join(' → ')}`,
      description: item.description,
      related_element_ids: uniqueSorted(item.cycle_path),
      suggested_action: item.break_suggestions.join('；'),
    });
  }

  for (const item of checks.saga_candidates || []) {
    const aggNames = item.involved_aggregates
      .map((id) => aggregateMap.get(id)?.name || id)
      .join(' / ');
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'saga_candidate',
      title: `Saga 候选：${item.name}`,
      description: `${item.description}（涉及聚合：${aggNames}）`,
      related_element_ids: [
        ...item.event_chain,
        ...item.involved_aggregates,
        ...item.involved_external_systems,
      ],
      suggested_action: `显式命名为 ${item.suggested_saga_name}，并梳理各关键事件的补偿事件`,
    });
  }

  for (const item of checks.missing_compensations || []) {
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'missing_compensation',
      title: `缺失补偿事件：${item.event_name}`,
      description: item.description,
      related_element_ids: [item.saga_candidate_id, item.event_id],
      suggested_action: `补充补偿事件 "${item.suggested_compensation_event}" 并纳入 Saga 编排`,
    });
  }

  for (const item of checks.performance_risks || []) {
    issues.push({
      id: nextId(),
      severity: item.severity,
      category: 'performance_risk',
      title: `性能风险：${item.category}`,
      description: item.description,
      related_element_ids: item.related_element_ids,
      suggested_action: item.suggested_action,
    });
  }

  return issues;
}

/** @param {string} action */
function actionToChinese(action) {
  switch (action) {
    case 'unify':
      return '统一术语命名';
    case 'split_concept':
      return '拆分为不同概念';
    case 'clarify_definition':
      return '澄清定义并消除歧义';
    case 'ignore':
      return '忽略（不影响设计）';
    default:
      return action;
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 基于 Round1 与 Round2 输出执行 Round3 一致性检查。
 *
 * @param {Round1_TerminologyExtraction|null|undefined} round1
 * @param {Round2_EventStormingElements|null|undefined} round2
 * @returns {{round3: Round3_ConsistencyCheck, issues: Issue[]}}
 */
export function detectAnomalies(round1, round2) {
  const { round1: r1, round2: r2, degraded } = normalizeInputs(round1, round2);

  if (degraded) {
    const round3 = emptyRound3();
    return { round3, issues: [] };
  }

  const orphanEvents = findOrphanEvents(r2);
  const missingCommands = findMissingCommands(r2);
  const termConflicts = findTermConflicts(r1);
  const boundaryAmbiguities = findBoundaryAmbiguities(r2);
  const circularDependencies = findCircularDependencies(r2);
  const hotSpotReviews = reviewHotSpots(r2);
  const sagaCandidates = findSagaCandidates(r2);
  const missingCompensations = findMissingCompensations(r2, sagaCandidates);
  const performanceRisks = findPerformanceRisks(r2);

  const eventCount = r2.events.length || 0;
  const commandCount = r2.commands.length || 0;

  /** @type {Round3_ConsistencyCheck} */
  const round3 = {
    version: '1.0',
    round: 3,
    dependencies: {
      round1_term_ids: r1.terms.map((t) => t.id),
      round2_event_ids: r2.events.map((e) => e.id),
      round2_command_ids: r2.commands.map((c) => c.id),
      round2_aggregate_ids: r2.aggregates.map((a) => a.id),
      round2_policy_ids: r2.policies.map((p) => p.id),
    },
    checks: {
      orphan_events: orphanEvents,
      missing_commands: missingCommands,
      term_conflicts: termConflicts,
      boundary_ambiguities: boundaryAmbiguities,
      circular_dependencies: circularDependencies,
      hot_spot_reviews: hotSpotReviews,
      saga_candidates: sagaCandidates,
      missing_compensations: missingCompensations,
      performance_risks: performanceRisks,
    },
    metrics: {
      event_command_ratio: commandCount ? eventCount / commandCount : 0,
      aggregate_count: r2.aggregates.length,
      external_system_count: r2.external_systems.length,
      policy_density: eventCount ? r2.policies.length / eventCount : 0,
    },
  };

  const issues = checksToIssues(round3.checks, r2, r1);

  return { round3, issues };
}
