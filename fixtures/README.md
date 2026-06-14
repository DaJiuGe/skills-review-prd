# review-prd fixtures

本目录存放用于测试 `review-prd` skill 的示例 PRD。每个 fixture 都故意埋入了特定类型的领域设计问题，用于验证 LLM 抽取、术语冲突检测、聚合边界检查、循环依赖检查等能力。

## 文件清单

| 文件 / 目录                   | 主题                                     | 埋入的问题类型                                                     | 推荐测试命令                                                     |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `sample-prd.md`               | 在线订餐系统（最小示例）                 | 基本 EventStorming 元素抽取                                        | `node ./index.js --mock --no-save ./sample-prd.md`               |
| `meeting-room-booking-prd.md` | 会议室预订系统                           | 术语歧义、孤儿事件、缺失命令、聚合边界模糊                         | `node ./index.js --mock --no-save ./meeting-room-booking-prd.md` |
| `ecommerce-aftersales-prd.md` | 电商订单售后系统                         | 术语歧义、孤儿事件、缺失命令、聚合边界模糊、外部系统、读模型、策略 | `node ./index.js --mock --no-save ./ecommerce-aftersales-prd.md` |
| `saas-rbac-prd.md`            | SaaS 权限管理系统                        | 术语歧义、循环依赖风险、聚合边界模糊、缺失命令、读模型、外部系统   | `node ./index.js --mock --no-save ./saas-rbac-prd.md`            |
| `project-with-context-prd/`   | 仓库库存管理系统（含 CONTEXT.md 与 ADR） | 外部术语冲突、既有聚合边界冲突、集成方式冲突                       | 见下方“上下文/ADR 测试命令”                                      |

## 各 fixture 埋入问题摘要

### `meeting-room-booking-prd.md`

- 术语歧义：User / 员工 / 成员混用；Booking / 预约、CalendarLock / 锁定 / 已占用混用。
- 孤儿事件：`BookingCancelled` 未声明明确触发命令。
- 缺失命令：`BookingApproved` 触发了一个不存在的命令 `cmd-999`，缺少 `ApproveBooking`。
- 边界模糊：`Booking` 与 `MeetingRoom` 在“验证时段冲突”上职责重叠，命令产生的事件归属不同聚合。
- 外部系统：邮件通知服务、企业微信、企业日历服务。
- 读模型：会议室可用时段查询、我的预订列表、成员参会视图。

### `ecommerce-aftersales-prd.md`

- 术语歧义：退货 / 退款 / 换货 / 售后 交叉混用。
- 孤儿事件：`RefundCompleted` 无明确触发命令。
- 缺失命令：用户可撤销售后申请，但 PRD 未定义 `RevokeAftersalesOrder` 命令。
- 边界模糊：`AftersalesOrder` 与 `Order` 在售后状态流转上职责重叠。
- 外部系统：PaymentGateway、LogisticsSystem、InventorySystem。
- 读模型：AftersalesProgressView、MerchantAftersalesWorkbench、PlatformRefundOverview。
- 策略：AutoRefundPolicy、ManualAuditPolicy、TimeoutAutoClosePolicy。

### `saas-rbac-prd.md`

- 术语歧义：角色 / Role / 权限 / Permission / 资源 / Resource 混用。
- 循环依赖风险：角色继承关系存在潜在循环（部门管理员 ↔ 普通成员）。
- 边界模糊：`User` 聚合与 `Organization` 聚合在成员关系上职责重叠。
- 缺失命令：管理员可撤销角色，但未定义 `RevokeRole` 命令。
- 读模型：UserPermissionView、OrganizationRoleTree、PermissionAssignmentView。
- 外部系统：IdentityProvider（IdP）、AuditLogService。

### `project-with-context-prd/`

- 外部术语冲突：PRD 使用 User / Member / Staff，而 `CONTEXT.md` 已定义 **Employee = 系统用户**。
- 聚合边界冲突：`CONTEXT.md` 与 ADR-001 明确“Reservation 聚合不直接操作 Calendar”，但 PRD 中 `Inventory` 聚合直接操作 `WarehouseSlot`。
- 集成方式冲突：ADR-002 规定外部系统默认使用异步事件总线，但 PRD 中外部系统采用同步 REST API。
- 读模型：InventoryLevelView、SlotOccupancyView、TransferOrderListView。
- 策略：AutoLockPolicy、AutoReleasePolicy、InventoryAlertPolicy。

## 上下文/ADR 测试命令

```bash
# 进入含 CONTEXT.md 与 docs/adr 的项目目录
cd ./project-with-context-prd

# 运行 review-prd，显式指定上下文与 ADR 目录
node ../../index.js --mock --no-save prd.md --context CONTEXT.md --adr-dir docs/adr
```

## 使用说明

- 所有推荐命令均使用 `--mock` 与 `--no-save`，仅验证终端摘要输出，不落盘报告。
- 去掉 `--mock` 并在环境中配置 `KIMI_API_KEY` 或 `OPENAI_API_KEY` 后，可调用真实 LLM 进行完整评审。
- 当前 `runner.js` 的 mock 数据仍基于会议室预订系统构造，因此 `--mock` 模式下的中间 JSON 与报告内容不会随 fixture 变化；真实 LLM 接入后，才能完整验证各 fixture 的异常召回效果。
