# EventStorming PRD Review Skill — 多轮 LLM 结构化抽取 Schema 设计

## 1. 设计原则

- **严格结构化**：LLM 输出必须可解析、可校验，拒绝自由文本混入关键字段。
- **引用溯源**：每个抽取元素必须携带 `source_location`，支持人工回溯 PRD 原文。
- **冲突显式化**：术语冲突、边界重叠等问题必须在结构化字段中标记，不依赖下游 NLP 再分析。
- **Mermaid 预生成**：第四轮直接输出 Mermaid 文本，避免前端再渲染逻辑，减少出错面。
- ** severity 统一**：四轮共用同一套严重度枚举，保证报告一致性。

---

## 2. 严重度枚举（全局）

```typescript
enum Severity {
  BLOCKER = 'blocker', // 必须解决，否则设计无法继续
  HIGH = 'high', // 强烈建议解决，影响架构合理性
  MEDIUM = 'medium', // 需要关注，可能在实现阶段暴露
  LOW = 'low', // 建议优化，不影响主流程
}
```

---

## 3. 第一轮：领域术语表提取（Terminology Extraction）

### 3.1 Schema

```typescript
interface Round1_TerminologyExtraction {
  version: '1.0';
  round: 1;
  prd_metadata: {
    title: string; // PRD 标题
    total_sections: number; // 章节数（用于校验 source_location）
    estimated_lines: number; // 近似行数
  };
  terms: TermEntry[];
  conflicts: TermConflict[];
  summary: {
    total_terms: number;
    new_terms: number; // 相对于 CONTEXT.md / docs/adr/ 中已有术语
    conflict_count: number;
  };
}

interface TermEntry {
  id: string; // 全局唯一，如 "term-001"
  term: string; // 标准术语（单数、首字母大写）
  aliases: string[]; // PRD 中出现的别名/同义词
  definition: string; // 基于 PRD 的简洁定义（≤ 50 字）
  source_location: SourceLocation[]; // 出现位置
  domain_category: 'core' | 'supporting' | 'generic' | 'unknown'; // DDD 子域分类
  first_introduced: boolean; // 是否本轮首次出现（相对于已有术语库）
}

interface SourceLocation {
  section_title: string; // 章节标题，如 "3.2 订单流程"
  paragraph_index: number; // 段落序号（从 1 开始）
  approximate_line: number; // 近似行号（允许 ±5 误差）
  quote: string; // 原文引用（≤ 100 字），用于人工校验
}

interface TermConflict {
  id: string; // 如 "conflict-001"
  severity: Severity;
  type: 'alias_overlap' | 'homonym' | 'inconsistent_definition' | 'external_conflict';
  term_a_id: string;
  term_b_id: string; // 冲突对象，外部冲突时指向外部术语名
  description: string; // 冲突描述
  suggested_resolution: string; // 建议统一方式
}
```

### 3.2 设计理由

| 字段                | 理由                                                     |
| ------------------- | -------------------------------------------------------- |
| `id`                | 后续轮次通过 ID 引用，避免字符串匹配歧义。               |
| `aliases`           | PRD 作者常混用"订单"/"Order"/"order"，需显式归并。       |
| `source_location`   | 架构师评审时需快速定位原文，验证 LLM 理解是否正确。      |
| `domain_category`   | 提前识别核心域 vs 支撑域，为后续聚合边界划分提供输入。   |
| `first_introduced`  | 区分新术语与已有术语，避免重复定义。                     |
| `TermConflict.type` | 细化冲突类型，指导修复策略（别名合并、消歧、定义对齐）。 |

---

## 4. 第二轮：EventStorming 元素提取（EventStorming Elements）

### 4.1 Schema

```typescript
interface Round2_EventStormingElements {
  version: '1.0';
  round: 2;
  dependencies: {
    round1_term_ids: string[]; // 本轮引用的术语 ID
  };
  events: DomainEvent[];
  commands: Command[];
  aggregates: Aggregate[];
  policies: Policy[];
  read_models: ReadModel[];
  external_systems: ExternalSystem[];
  hot_spots: HotSpot[]; // EventStorming 中的粉色便利贴（争议/风险点）
}

interface DomainEvent {
  id: string; // 如 "evt-001"
  name: string; // 标准名：过去时 + 名词，如 "OrderPlaced"
  past_tense_verb: string; // 提取的动词，如 "Placed"
  aggregate_id: string; // 引用 Aggregate.id
  trigger: {
    type: 'command' | 'policy' | 'external_system' | 'time' | 'event';
    source_id: string; // 触发源 ID（如 Command.id / Policy.id）
  };
  description: string;
  source_location: SourceLocation[];
  term_ids: string[]; // 引用的术语 ID
  business_value: 'high' | 'medium' | 'low'; // 业务价值，用于时序图优先级
}

interface Command {
  id: string; // 如 "cmd-001"
  name: string; // 动词开头，如 "PlaceOrder"
  intent: string; // 用户意图描述（≤ 30 字）
  actor: string; // 执行者：用户角色、系统、定时任务
  target_aggregate_id: string;
  description: string;
  source_location: SourceLocation[];
  term_ids: string[];
}

interface Aggregate {
  id: string; // 如 "agg-001"
  name: string; // 名词，如 "Order"
  responsibilities: string[]; // 职责列表，如 ["维护订单生命周期", "计算订单金额"]
  invariants: string[]; // 高层次不变量，不涉及字段级
  boundary_indicators: string[]; // 边界线索：如 "由订单团队维护"
  source_location: SourceLocation[];
  term_ids: string[];
}

interface Policy {
  id: string; // 如 "pol-001"
  name: string;
  trigger_event_id: string; // 触发事件
  decision: string; // 决策逻辑描述
  outcome: {
    type: 'command' | 'event';
    target_id: string;
  };
  source_location: SourceLocation[];
}

interface ReadModel {
  id: string; // 如 "rm-001"
  name: string;
  consumer: string; // 消费方：如 "用户界面 / 报表系统"
  data_source: string; // 数据来源：如 "Order 聚合投影 / 事件流订阅"
  events_subscribed?: string[]; // 订阅的事件 ID 列表（可选，用于性能风险检测）
  source_location: SourceLocation[];
}

interface ExternalSystem {
  id: string; // 如 "ext-001"
  name: string;
  integration_type: 'api' | 'message_queue' | 'file' | 'database' | 'unknown';
  events_consumed: string[]; // 消费的事件 ID 列表
  events_produced: string[]; // 产生的事件 ID 列表
  description: string;
}

interface HotSpot {
  id: string;
  category: 'ambiguous_requirement' | 'missing_info' | 'technical_risk' | 'business_rule_conflict';
  description: string;
  related_element_ids: string[];
  severity: Severity;
}
```

### 4.2 设计理由

| 字段                   | 理由                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `past_tense_verb`      | 强制校验事件命名规范，避免 "CreateOrder" 混入事件列表。      |
| `trigger` / `outcome`  | 显式建立事件-命令-策略的因果链，为第三轮循环检测提供图结构。 |
| `business_value`       | 时序图纵向空间宝贵，高价值事件优先展示，低价值可折叠。       |
| `invariants`（高层次） | 本轮不做战术设计，不变量只到聚合级，防止过度设计。           |
| `boundary_indicators`  | 捕获 PRD 中暗示的团队/组织边界，为第四轮边界图提供输入。     |
| `HotSpot`              | 前置识别争议点，避免全部推到第三轮才暴露。                   |

---

## 5. 第三轮：一致性检查与异常检测（Consistency & Anomaly Detection）

### 5.1 Schema

```typescript
interface Round3_ConsistencyCheck {
  version: '1.0';
  round: 3;
  dependencies: {
    round1_term_ids: string[];
    round2_event_ids: string[];
    round2_command_ids: string[];
    round2_aggregate_ids: string[];
    round2_policy_ids: string[];
  };
  checks: {
    orphan_events: OrphanEvent[];
    missing_commands: MissingCommand[];
    term_conflicts: TermConflictDetail[];
    boundary_ambiguities: BoundaryAmbiguity[];
    circular_dependencies: CircularDependency[];
    hot_spot_reviews: HotSpotReview[]; // 对第二轮 HotSpot 的复核
    saga_candidates: SagaCandidate[]; // Saga / 长流程编排候选
    missing_compensations: MissingCompensation[]; // 缺失的补偿事件
    performance_risks: PerformanceRisk[]; // 性能风险点
  };
  metrics: {
    event_command_ratio: number; // 事件数 / 命令数，健康度指标
    aggregate_count: number;
    external_system_count: number;
    policy_density: number; // 策略数 / 事件数，过高说明流程复杂
  };
}

interface OrphanEvent {
  event_id: string;
  event_name: string;
  severity: Severity;
  hypothesis: string; // LLM 推测的可能触发源
  suggested_command?: string; // 建议补充的命令名
}

interface MissingCommand {
  description: string; // 如 "PRD 描述用户可取消订单，但未提取到 CancelOrder 命令"
  severity: Severity;
  suggested_command_name: string;
  target_aggregate_id: string;
  source_location: SourceLocation[];
}

interface TermConflictDetail {
  term_ids: string[]; // 冲突术语 ID 列表
  severity: Severity;
  description: string;
  occurrences: {
    // 各术语出现位置
    term_id: string;
    locations: SourceLocation[];
  }[];
  suggested_action: 'unify' | 'split_concept' | 'clarify_definition' | 'ignore';
}

interface BoundaryAmbiguity {
  aggregate_ids: string[]; // 边界重叠的聚合 ID
  severity: Severity;
  description: string;
  overlap_type: 'responsibility' | 'data_ownership' | 'lifecycle' | 'team_ownership';
  suggested_action: string;
}

interface CircularDependency {
  cycle_path: string[]; // 元素 ID 构成的环，如 ["evt-001", "pol-001", "cmd-001", "evt-001"]
  severity: Severity;
  description: string;
  break_suggestions: string[]; // 建议打破循环的方式
}

interface HotSpotReview {
  hot_spot_id: string;
  resolution: 'confirmed' | 'mitigated' | 'false_positive';
  reason: string;
}

interface SagaCandidate {
  id: string;
  name: string; // 如 "下单-支付-配送流程"
  event_chain: string[]; // 事件 ID 序列
  involved_aggregates: string[]; // 聚合 ID 列表
  involved_external_systems: string[]; // 外部系统 ID 列表
  severity: Severity;
  description: string;
  suggested_saga_name: string;
}

interface MissingCompensation {
  saga_candidate_id: string;
  event_id: string; // 需要补偿的事件
  event_name: string;
  severity: Severity;
  description: string;
  suggested_compensation_event: string; // 如 "OrderCancelled", "PaymentRefunded"
}

interface PerformanceRisk {
  id: string;
  category:
    | 'high_frequency_event'
    | 'synchronous_external_call'
    | 'hot_read_model'
    | 'large_aggregate';
  severity: Severity;
  description: string;
  related_element_ids: string[];
  suggested_action: string;
}

interface Issue {
  // 统一问题结构（用于报告聚合）
  id: string;
  severity: Severity;
  category:
    | 'orphan_event'
    | 'missing_command'
    | 'term_conflict'
    | 'boundary_ambiguity'
    | 'circular_dependency'
    | 'hot_spot'
    | 'saga_candidate'
    | 'missing_compensation'
    | 'performance_risk';
  title: string;
  description: string;
  related_element_ids: string[];
  suggested_action: string;
}
```

### 5.2 设计理由

| 字段             | 理由                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| `hypothesis`     | 孤儿事件不一定错误，LLM 给出推测（如 "可能由定时任务触发"），供人工判断。 |
| `metrics`        | 量化指标快速暴露设计畸形（如 policy_density > 0.5 提示流程过度复杂）。    |
| `overlap_type`   | 边界模糊有多种原因，区分职责/数据/生命周期/团队，指导不同修复策略。       |
| `cycle_path`     | 显式给出环路径，便于第四轮在 Mermaid 图中用红色高亮。                     |
| `HotSpotReview`  | 第二轮的 HotSpot 可能在第三轮被证实或证伪，避免误报累积。                 |
| `Issue` 统一结构 | 第四轮生成报告时，所有问题统一渲染，无需按类型分别处理。                  |

---

## 6. 第四轮：报告生成输入（Report Generation Input）

### 6.1 Schema

```typescript
interface Round4_ReportGeneration {
  version: '1.0';
  round: 4;
  dependencies: {
    round1_summary: Round1_TerminologyExtraction['summary'];
    round2_elements: Pick<
      Round2_EventStormingElements,
      'events' | 'commands' | 'aggregates' | 'policies' | 'external_systems'
    >;
    round3_issues: Issue[];
  };
  mermaid_sequence_diagram: string; // 事件流时序图 Mermaid 文本
  mermaid_boundary_diagram: string; // 聚合边界图 Mermaid 文本
  term_heatmap_data: TermHeatmapData;
  review_summary: ReviewSummary;
  report_metadata: {
    generated_at: string; // ISO 8601
    prd_title: string;
    total_issues: number;
    blocker_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
  };
}

interface TermHeatmapData {
  // 术语一致性热力图：矩阵形式，行=章节，列=术语，值=一致性分数
  chapters: {
    chapter_title: string;
    chapter_index: number;
    term_scores: {
      term_id: string;
      term_name: string;
      // 分数含义：1.0=该章节术语使用完全一致；0.0=该章节术语使用混乱/多别名
      consistency_score: number; // 0.0 ~ 1.0
      variant_used: string; // 该章节实际使用的变体（如 "Order" 或 "订单"）
    }[];
  }[];
  // 全局统计
  global_average: number;
  most_inconsistent_terms: string[]; // 术语 ID 列表
}

interface ReviewSummary {
  executive_summary: string; // 面向架构师的 3 句话摘要
  key_findings: string[]; // 关键发现列表（≤ 5 条）
  recommendations: {
    priority: 'immediate' | 'before_implementation' | 'ongoing';
    action: string;
    related_issue_ids: string[];
  }[];
  risk_assessment: {
    overall_risk: 'low' | 'medium' | 'high' | 'critical';
    rationale: string;
  };
}
```

### 6.2 设计理由

| 字段                           | 理由                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `mermaid_sequence_diagram`     | 预生成文本，前端直接嵌入 `<div class="mermaid">`，零渲染逻辑。                 |
| `term_heatmap_data`            | 不生成图片，输出结构化矩阵，前端可用 CSS Grid / ECharts 渲染，灵活性高。       |
| `consistency_score`            | 量化每章节的术语一致性，热力图颜色映射直接可用。                               |
| `variant_used`                 | 显示每章节实际使用的术语变体，帮助定位"第 3 章用 Order、第 5 章用订单"的问题。 |
| `executive_summary`            | 架构师时间宝贵，3 句话决定是否深入看报告。                                     |
| `risk_assessment.overall_risk` | 综合 blocker/high 数量与循环依赖等指标，给出全局风险评级。                     |

---

## 7. 各轮数据依赖关系

```
Round 1 (术语)
  │
  ├─→ Round 2 (EventStorming 元素)
  │     引用：term_ids, 用于元素命名一致性校验
  │
  ├─→ Round 3 (一致性检查)
  │     引用：round1_term_ids（术语冲突）
  │     引用：round2_event_ids / command_ids / aggregate_ids / policy_ids（结构异常）
  │
  └─→ Round 4 (报告生成)
        引用：round1_summary（术语统计）
        引用：round2_elements（Mermaid 图数据源）
        引用：round3_issues（问题列表、严重度统计）
```

**关键依赖规则**：

- Round 2 的 `term_ids` 必须存在于 Round 1 的输出中。
- Round 3 的 `related_element_ids` 必须存在于 Round 2 的输出中。
- Round 4 的 `term_heatmap_data.term_scores.term_id` 必须存在于 Round 1 的输出中。

---

## 8. 超长 PRD 分块处理建议

### 8.1 分块策略

| 维度     | 建议                                                              |
| -------- | ----------------------------------------------------------------- |
| 分块单位 | 按 Markdown 二级标题（`##`）分块，保持语义完整。                  |
| 块大小   | 每块 ≤ 4000 tokens（预留 1000 tokens 给 schema 和上下文）。       |
| 重叠区   | 块尾保留前一块的最后 1 个段落（≈ 200 tokens），确保跨块术语连贯。 |

### 8.2 跨块一致性机制

```
[Chunk 1] ──→ 输出：Partial Round 1 (terms_1)
                  │
[Chunk 2] ──→ 输入：terms_1（作为上下文前缀）
              输出：Partial Round 1 (terms_2，含与 terms_1 的冲突标记)
                  │
[Chunk N] ──→ 输入：merged_terms_{N-1}
              输出：Partial Round 1 (terms_N)
                  │
         Merge → Final Round 1（去重、合并别名、统一 source_location）
```

### 8.3 合并规则（Merge Rules）

1. **术语去重**：同一名词在不同块出现，合并 `aliases` 和 `source_location` 数组。
2. **冲突升级**：若某术语在块 A 定义为 X、在块 B 定义为 Y，标记 `inconsistent_definition`。
3. **全局 ID 分配**：合并后重新分配连续 ID（`term-001` ~ `term-N`），并更新后续轮次的引用。
4. **第二轮并行**：Round 1 合并完成后，各块可并行执行 Round 2（因为 EventStorming 元素通常局限在单章节内），但需全局聚合 `aggregates` 去重。

### 8.4 一致性校验清单

- [ ] 所有跨块术语的 `source_location` 已合并，无丢失。
- [ ] 全局 ID 映射表已建立，后续轮次引用正确。
- [ ] 块间重叠区的术语未重复计数。
- [ ] 分块导致的截断事件（如命令在块 A、事件在块 B）已人工或启发式关联。

---

## 9. 最小示例 JSON

以下展示一个虚构的"在线订餐系统 PRD"的四轮输出片段。

### 9.1 Round 1：术语提取

```json
{
  "version": "1.0",
  "round": 1,
  "prd_metadata": {
    "title": "在线订餐系统 PRD",
    "total_sections": 5,
    "estimated_lines": 320
  },
  "terms": [
    {
      "id": "term-001",
      "term": "Order",
      "aliases": ["订单", "order"],
      "definition": "用户提交的餐饮购买请求，包含菜品、地址、支付信息",
      "source_location": [
        {
          "section_title": "3.1 下单流程",
          "paragraph_index": 2,
          "approximate_line": 45,
          "quote": "用户选择菜品后生成订单（Order），订单包含配送地址和支付方式"
        }
      ],
      "domain_category": "core",
      "first_introduced": true
    },
    {
      "id": "term-002",
      "term": "Delivery",
      "aliases": ["配送", "delivery"],
      "definition": "从餐厅到用户地址的物流服务",
      "source_location": [
        {
          "section_title": "3.2 配送流程",
          "paragraph_index": 1,
          "approximate_line": 78,
          "quote": "系统根据订单地址分配配送（Delivery）任务"
        }
      ],
      "domain_category": "core",
      "first_introduced": true
    }
  ],
  "conflicts": [
    {
      "id": "conflict-001",
      "severity": "medium",
      "type": "alias_overlap",
      "term_a_id": "term-001",
      "term_b_id": "term-002",
      "description": "PRD 第 3.1 节和第 3.2 节混用 '订单' 指代 Order 和 Delivery 的关联单据",
      "suggested_resolution": "统一 '订单' 仅指 Order，Delivery 相关单据使用 '配送单'"
    }
  ],
  "summary": {
    "total_terms": 2,
    "new_terms": 2,
    "conflict_count": 1
  }
}
```

### 9.2 Round 2：EventStorming 元素

```json
{
  "version": "1.0",
  "round": 2,
  "dependencies": {
    "round1_term_ids": ["term-001", "term-002"]
  },
  "events": [
    {
      "id": "evt-001",
      "name": "OrderPlaced",
      "past_tense_verb": "Placed",
      "aggregate_id": "agg-001",
      "trigger": {
        "type": "command",
        "source_id": "cmd-001"
      },
      "description": "用户成功提交订单",
      "source_location": [
        {
          "section_title": "3.1 下单流程",
          "paragraph_index": 3,
          "approximate_line": 52,
          "quote": "订单创建成功后触发 OrderPlaced 事件"
        }
      ],
      "term_ids": ["term-001"],
      "business_value": "high"
    }
  ],
  "commands": [
    {
      "id": "cmd-001",
      "name": "PlaceOrder",
      "intent": "用户提交新订单",
      "actor": "Customer",
      "target_aggregate_id": "agg-001",
      "description": "收集用户选择的菜品、地址、支付信息并创建订单",
      "source_location": [
        {
          "section_title": "3.1 下单流程",
          "paragraph_index": 2,
          "approximate_line": 48,
          "quote": "用户点击提交按钮，系统执行 PlaceOrder 命令"
        }
      ],
      "term_ids": ["term-001"]
    }
  ],
  "aggregates": [
    {
      "id": "agg-001",
      "name": "Order",
      "responsibilities": ["维护订单生命周期", "验证订单金额", "关联配送信息"],
      "invariants": ["订单金额必须大于 0", "订单必须关联有效地址"],
      "boundary_indicators": ["由订单团队维护", "数据存储在订单库"],
      "source_location": [
        {
          "section_title": "3.1 下单流程",
          "paragraph_index": 1,
          "approximate_line": 42,
          "quote": "Order 聚合负责订单的完整生命周期管理"
        }
      ],
      "term_ids": ["term-001"]
    }
  ],
  "policies": [],
  "read_models": [
    {
      "id": "rm-001",
      "name": "OrderStatusView",
      "consumer": "用户订单追踪页面",
      "data_source": "Order 聚合投影",
      "source_location": [
        {
          "section_title": "4.1 用户界面",
          "paragraph_index": 2,
          "approximate_line": 150,
          "quote": "用户可在个人中心查看订单状态"
        }
      ]
    }
  ],
  "external_systems": [
    {
      "id": "ext-001",
      "name": "PaymentGateway",
      "integration_type": "api",
      "events_consumed": ["evt-001"],
      "events_produced": ["evt-002"],
      "description": "第三方支付网关，处理支付请求"
    }
  ],
  "hot_spots": [
    {
      "id": "hs-001",
      "category": "ambiguous_requirement",
      "description": "PRD 未明确说明支付失败后的订单状态流转",
      "related_element_ids": ["cmd-001", "evt-001"],
      "severity": "high"
    }
  ]
}
```

### 9.3 Round 3：一致性检查

```json
{
  "version": "1.0",
  "round": 3,
  "dependencies": {
    "round1_term_ids": ["term-001", "term-002"],
    "round2_event_ids": ["evt-001", "evt-002"],
    "round2_command_ids": ["cmd-001"],
    "round2_aggregate_ids": ["agg-001"],
    "round2_policy_ids": []
  },
  "checks": {
    "orphan_events": [
      {
        "event_id": "evt-002",
        "event_name": "PaymentConfirmed",
        "severity": "high",
        "hypothesis": "可能由外部系统 PaymentGateway 异步回调触发",
        "suggested_command": "ConfirmPayment"
      }
    ],
    "missing_commands": [],
    "term_conflicts": [
      {
        "term_ids": ["term-001", "term-002"],
        "severity": "medium",
        "description": "'订单' 在 3.1 节指 Order，在 3.2 节被用于描述 Delivery 的关联单据",
        "occurrences": [
          {
            "term_id": "term-001",
            "locations": [
              {
                "section_title": "3.1 下单流程",
                "paragraph_index": 2,
                "approximate_line": 45,
                "quote": "用户选择菜品后生成订单"
              }
            ]
          },
          {
            "term_id": "term-002",
            "locations": [
              {
                "section_title": "3.2 配送流程",
                "paragraph_index": 1,
                "approximate_line": 78,
                "quote": "系统根据订单地址分配配送任务"
              }
            ]
          }
        ],
        "suggested_action": "clarify_definition"
      }
    ],
    "boundary_ambiguities": [],
    "circular_dependencies": [],
    "hot_spot_reviews": [
      {
        "hot_spot_id": "hs-001",
        "resolution": "confirmed",
        "reason": "PRD 全文未提及支付失败后的订单状态，确认为缺失需求"
      }
    ]
  },
  "metrics": {
    "event_command_ratio": 2.0,
    "aggregate_count": 1,
    "external_system_count": 1,
    "policy_density": 0.0
  }
}
```

### 9.4 Round 4：报告生成输入

```json
{
  "version": "1.0",
  "round": 4,
  "dependencies": {
    "round1_summary": {
      "total_terms": 2,
      "new_terms": 2,
      "conflict_count": 1
    },
    "round2_elements": {
      "events": [{ "id": "evt-001", "name": "OrderPlaced" }],
      "commands": [{ "id": "cmd-001", "name": "PlaceOrder" }],
      "aggregates": [{ "id": "agg-001", "name": "Order" }],
      "policies": [],
      "external_systems": [{ "id": "ext-001", "name": "PaymentGateway" }]
    },
    "round3_issues": [
      {
        "id": "issue-001",
        "severity": "high",
        "category": "orphan_event",
        "title": "孤儿事件：PaymentConfirmed",
        "description": "PaymentConfirmed 事件无明确触发命令，建议补充 ConfirmPayment 命令或明确外部系统触发机制",
        "related_element_ids": ["evt-002"],
        "suggested_action": "补充 ConfirmPayment 命令，或明确 PaymentGateway 回调触发逻辑"
      },
      {
        "id": "issue-002",
        "severity": "medium",
        "category": "term_conflict",
        "title": "术语冲突：订单",
        "description": "'订单' 在 3.1 节指 Order，在 3.2 节被用于描述 Delivery 的关联单据",
        "related_element_ids": ["term-001", "term-002"],
        "suggested_action": "统一 '订单' 仅指 Order，Delivery 相关单据使用 '配送单'"
      }
    ]
  },
  "mermaid_sequence_diagram": "sequenceDiagram\n    actor Customer\n    Customer->>Order: PlaceOrder\n    Order->>PaymentGateway: 请求支付\n    PaymentGateway-->>Order: PaymentConfirmed\n    Order->>Delivery: 分配配送",
  "mermaid_boundary_diagram": "graph TB\n    subgraph 核心域\n        Order[Order 聚合]\n    end\n    subgraph 支撑域\n        Delivery[Delivery 聚合]\n    end\n    subgraph 外部系统\n        PaymentGateway[PaymentGateway]\n    end\n    Order --> PaymentGateway\n    Order --> Delivery",
  "term_heatmap_data": {
    "chapters": [
      {
        "chapter_title": "3.1 下单流程",
        "chapter_index": 3,
        "term_scores": [
          {
            "term_id": "term-001",
            "term_name": "Order",
            "consistency_score": 0.85,
            "variant_used": "订单"
          },
          {
            "term_id": "term-002",
            "term_name": "Delivery",
            "consistency_score": 1.0,
            "variant_used": "配送"
          }
        ]
      },
      {
        "chapter_title": "3.2 配送流程",
        "chapter_index": 4,
        "term_scores": [
          {
            "term_id": "term-001",
            "term_name": "Order",
            "consistency_score": 0.4,
            "variant_used": "订单（歧义）"
          },
          {
            "term_id": "term-002",
            "term_name": "Delivery",
            "consistency_score": 0.9,
            "variant_used": "配送"
          }
        ]
      }
    ],
    "global_average": 0.79,
    "most_inconsistent_terms": ["term-001"]
  },
  "review_summary": {
    "executive_summary": "在线订餐系统 PRD 的核心流程（下单-支付-配送）已识别，但存在 1 个孤儿事件和 1 处术语冲突，建议会前澄清支付失败后的订单状态流转。",
    "key_findings": [
      "核心聚合 Order 职责清晰，但配送边界未明确",
      "PaymentConfirmed 事件缺少触发命令，存在集成风险",
      "术语 '订单' 在下单和配送章节存在歧义"
    ],
    "recommendations": [
      {
        "priority": "immediate",
        "action": "补充支付失败后的订单状态流转规则",
        "related_issue_ids": ["issue-001"]
      },
      {
        "priority": "before_implementation",
        "action": "统一术语 '订单' 定义，区分 Order 和 Delivery 单据",
        "related_issue_ids": ["issue-002"]
      }
    ],
    "risk_assessment": {
      "overall_risk": "medium",
      "rationale": "核心流程完整，但支付集成点和术语歧义可能在实现阶段引发需求变更"
    }
  },
  "report_metadata": {
    "generated_at": "2026-06-14T10:00:00Z",
    "prd_title": "在线订餐系统 PRD",
    "total_issues": 2,
    "blocker_count": 0,
    "high_count": 1,
    "medium_count": 1,
    "low_count": 0
  }
}
```

---

## 10. Schema 演进建议

| 版本 | 变更                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| v1.0 | 当前版本，覆盖四轮基础抽取，并已加入 Saga 候选、缺失补偿、性能风险检测。               |
| v1.1 | （已合并）增加 `Round2` 的 `sagas` 字段（长流程编排），支持更复杂业务流程。            |
| v1.2 | （已合并）增加 `Round3` 的 `performance_risks` 字段（如 "高频事件可能导致聚合冲突"）。 |
| v1.3 | 增加 `Round4` 的 `mermaid_state_diagram`（聚合状态机图），补充时序图和边界图。         |

---

## 11. 附录：JSON Schema 校验提示

- 所有 `id` 字段建议格式：`{type}-{seq}`，如 `term-001`、`evt-005`。
- `source_location` 的 `approximate_line` 允许 ±5 误差，校验时作为范围匹配。
- `Severity` 和 `domain_category` 等枚举字段，校验失败时降级为 `unknown` 而非报错，保证 LLM 输出容错性。
- Round 2 的 `trigger.type` 为 `event` 时，表示该事件由另一事件直接触发（事件链），需参与第三轮循环检测。
