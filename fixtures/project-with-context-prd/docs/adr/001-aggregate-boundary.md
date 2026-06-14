# ADR-001：聚合边界划分

## 背景

在会议室预订系统中，需要明确 **Reservation**、**Workspace** 与 **Calendar** 三个概念的职责边界。

## 决策

- **Reservation 聚合**只负责维护预订请求的生命周期（创建、审批、取消）。
- **Workspace 聚合**只负责维护物理会议室资源信息（容量、位置、设备、可用时段模板）。
- **Calendar** 不作为聚合存在，而是由 Reservation 事件投影生成的读模型；Reservation 聚合不直接操作 Calendar。

## 后果

- 避免 Reservation 与 Workspace 因“时段占用”产生职责重叠。
- 新增外部系统同步日历需求时，Calendar 读模型可独立演进，不影响核心聚合。
