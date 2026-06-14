# 上下文定义

本文档用于统一既有系统中的领域术语，避免新 PRD 与既有上下文产生歧义。

## 人员相关

- **Employee**：系统用户。任何登录并使用本系统的自然人，在既有模型中统一称为 **Employee**，不应使用 User、Member、Staff 等别名。
- **Department**：组织单元，是 Employee 的归属单位。

## 资源相关

- **Workspace**：会议室资源，对应物理会议室，包含容量、位置、设备等信息。
- **Reservation**：会议室预订记录，由 Employee 发起。
- **Calendar**：会议室可用时段视图，由预订事件投影生成。

## 既有聚合边界

- **Reservation 聚合**：负责维护预订请求的生命周期。
- **Workspace 聚合**：负责维护物理会议室资源信息。
- Reservation 聚合不直接修改 Calendar；Calendar 由独立读模型投影维护。

## 集成方式

- 与外部系统的集成默认采用异步事件总线（Event Bus），以保证核心域的稳定性。
