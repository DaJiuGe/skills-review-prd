# 仓库库存管理系统 PRD

## 1. 项目背景与目标

为了实时掌握多仓库库存水位、减少缺货与超卖，平台需要建设仓库库存管理系统。系统覆盖入库、出库、盘点、调拨、库存锁定等核心流程，并对接仓储自动化设备与上游订单系统。

## 2. 目标用户与角色

- **User（系统用户）**：仓库管理员、操作员，在系统中执行入库、出库、盘点等操作。
- **Member（成员）**：仓库作业组成员，可被分配盘点任务。
- **Staff（职员）**：拥有更高权限的仓库主管，可审批调拨单。

> 注：本 PRD 使用 User / Member / Staff 指代系统使用者，未与既有上下文中的 **Employee** 概念对齐。

## 3. 核心流程

### 3.1 入库流程

货物到达仓库后，操作员扫描 SKU 与库位，执行 **ReceiveInventory** 命令，生成 **InventoryReceived** 事件。Inventory 聚合更新可用库存数量。

### 3.2 出库流程

订单下发后，系统根据库存分布分配仓库与库位，执行 **ShipInventory** 命令，生成 **InventoryShipped** 事件。

### 3.3 库存锁定

为防止超卖，Inventory 聚合在收到订单锁定请求时，直接占用 WarehouseSlot（库位）的可用数量，生成 **InventoryLocked** 事件。锁定记录由 Inventory 聚合维护。

## 4. 聚合与领域模型

本系统核心聚合：

- **Inventory（库存）**：维护 SKU 在仓库层面的数量、锁定数量、在途数量。
- **WarehouseSlot（库位）**：维护仓库中具体库位的容量、当前存放 SKU、可用空间。
- **TransferOrder（调拨单）**：维护仓库间调拨申请与执行状态。

Inventory 聚合直接根据出库/锁定请求更新 WarehouseSlot 的可用数量，未引入独立读模型投影。这与既有 ADR 中“Reservation 聚合不直接操作 Calendar”的边界决策不一致。

## 5. 外部系统集成

- **OrderSystem（订单系统）**：同步调用库存锁定接口，确认订单可用库存。
- **WMS（仓库管理系统）**：通过 REST API 同步下发入库、出库任务，并同步获取执行结果。
- **IoTGateway（物联网网关）**：接收自动化设备的实时库存变化通知。

> 注：本 PRD 中的外部系统主要采用同步 REST API 集成，与既有 ADR 中“默认采用异步事件总线”的决策存在偏离。

## 6. 读模型与查询

- **InventoryLevelView（库存水位视图）**：按仓库、SKU 展示实时可用库存、锁定库存、在途库存。
- **SlotOccupancyView（库位占用视图）**：展示各 WarehouseSlot 的当前 SKU 占用与剩余容量。
- **TransferOrderListView（调拨单列表）**：展示待审批、执行中、已完成的调拨单。

## 7. 策略与规则

- **AutoLockPolicy（自动锁定策略）**：订单创建成功后，自动为订单锁定库存，直到出库或超时释放。
- **AutoReleasePolicy（自动释放策略）**：订单取消或超时未支付时，自动释放已锁定库存。
- **InventoryAlertPolicy（库存预警策略）**：当可用库存低于安全水位时，触发补货提醒。

## 8. 非功能需求

- 库存锁定接口峰值 QPS 不低于 3000。
- 库存状态最终一致延迟不超过 1 秒。
- 需要统一 User / Member / Staff / Employee 的人员术语，避免与既有上下文冲突。
