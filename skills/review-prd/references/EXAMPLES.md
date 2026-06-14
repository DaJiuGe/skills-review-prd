# /review-prd — Examples

## 典型 CLI 调用

```text
/review-prd
/review-prd docs/prd/order-system.md --interactive
/review-prd README.md --no-save --mock
```

```bash
# 从 skill 目录运行（推荐）
node ./index.js --no-save ./fixtures/meeting-room-booking-prd.md
node ./index.js --mock --no-save ./fixtures/sample-prd.md
node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md
```

## Fixtures

`./fixtures/` 目录包含示例 PRD，可用于快速验证 CLI 与报告生成：

- `sample-prd.md` — 在线订餐系统最小示例
- `meeting-room-booking-prd.md` — 会议室预订系统
- `ecommerce-aftersales-prd.md` — 电商订单售后系统
- `saas-rbac-prd.md` — SaaS 权限管理系统
- `project-with-context-prd/` — 含 `CONTEXT.md` 与 ADR 的仓库库存管理示例

mock 模式下使用固定 mock 数据运行，适合验证 CLI 文件读取、参数解析、终端摘要与报告渲染链路，但不验证 fixture 真实语义召回。

## 终端摘要示例

```text
PRD EventStorming 评审完成
============================
PRD:        docs/prd/order-system.md
标题:       在线订餐系统 PRD
生成时间:   2026-06-14T10:00:00Z

统计:
  术语:     24 个（新增 18 个，冲突 2 处）
  事件:     12 个 | 命令: 8 个 | 聚合: 4 个 | 策略: 2 个 | 外部系统: 3 个
  问题:     7 个（blocker 1 / high 2 / medium 3 / low 1）
  整体风险: medium

关键发现:
  1. [high] PaymentConfirmed 为孤儿事件，建议补充 ConfirmPayment 命令或明确外部回调。
  2. [medium] 术语“订单”在 3.1/3.2 节存在歧义。

报告:
  Markdown: docs/reviews/prd-review-20260614T100000Z.md
  HTML:     docs/reviews/prd-review-20260614T100000Z/index.html
```

完整输出规范见 [REFERENCE.md](./REFERENCE.md)。
