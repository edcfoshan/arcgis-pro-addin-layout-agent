# 极思G Ribbon 设计器

本文件定义公开发布和历史版本名称统一使用的产品语言。

## Language

**Ribbon 设计器**：
用于编辑 ArcGIS Pro Add-in 功能区布局的桌面应用。
_Avoid_: GISpro 插件设计器, Add-in 布局代理

**Demo**：
用于征集社区意见的社区预览版本，功能边界和兼容范围可能调整。
_Avoid_: Beta, 正式版, 稳定版

**Ribbon 布局**：
由页签、分组、控件、尺寸和顺序组成的 ArcGIS Pro 功能区结构。
_Avoid_: 界面主题, 插件业务逻辑

**占位控件**：
只呈现可视外观、不执行具体命令的导出控件。
_Avoid_: 可执行按钮, 完整控件

**导出包**：
由 Ribbon 布局生成的 `.esriAddInX` 安装文件。
_Avoid_: 安装器, 业务插件

**已实测版本**：
在本项目发布检查中实际安装并完成功能区验证的 ArcGIS Pro 版本。
_Avoid_: 兼容版本, 支持所有版本
