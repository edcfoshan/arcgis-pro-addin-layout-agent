# ArcGIS Pro Add-in Ribbon 布局设计器原型

这是一个用于设计 ArcGIS Pro Add-in 功能区的前端原型。当前版本以 Esri 官方 SDK 文档为准：Ribbon 控件主要按 `large / middle / small` 三种显示状态理解，其中 large 使用 32x32 图标加文字，middle 使用 16x16 图标加文字，small 使用 16x16 图标；Add-in Ribbon 的组织方式围绕 Tab、Group、Command/Control 展开。

## 当前目标

- 默认从空白 Ribbon 开始，而不是预置 “Add-In 工具箱” 或 “地图风格”。
- 只做宽屏功能区预览；标准、紧凑、折叠暂不显示。
- 功能区高度固定，不允许用户增加行数。
- 画布以最小按钮空间作为 `1x1` 单位，控件按整数格吸附。
- 不允许不同控件相互覆盖。
- 分组只允许横向扩列或减列，用来表达功能区可用宽度。
- JSON 导出继续保留 AI 后续补命令、事件和 DAML 转换所需字段。

## 官方规则对齐

已按官方文档做出的调整：

- 控件尺寸保留 `large / middle / small` 概念。
- 只使用宽屏 Ribbon 画布作为当前可编辑状态。
- 分组高度固定为 3 个最小按钮格，不提供加行按钮。
- 拖入、移动、改尺寸都做碰撞检测，空间不足时拒绝放置。
- `subgroups` 字段仅作为内部兼容层保留，界面上只展示一个 Group 网格。

## 界面结构

- 顶部模拟 ArcGIS Pro 窗口标题、功能区页签和工具条。
- 左侧是 Ribbon 画布，默认空白。
- 点击“新增分组”后生成一个固定 3 行高的分组网格。
- 分组顶部可编辑分组名称，可加列或减列。
- 右侧上半部分是控件库，按“命令控件 / 输入与选择”分组。
- 右侧下半部分是属性与 JSON，选中控件后可以编辑标题、尺寸、提示、条件和 AI 备注。

## 控件尺寸规则

当前以 `1格 = 32px x 32px` 建模：

| 控件类型 | 小 | 中 | 大 |
| --- | --- | --- | --- |
| Button 按钮 | `1x1` | `2x1` | `2x3` |
| Tool 交互工具 | `1x1` | `2x1` | `2x3` |
| SplitButton 分裂按钮 | - | `2x1` | `2x2` |
| ToolPalette 工具板 | - | `3x1` | `3x3` |
| Menu 菜单 | `1x1` | `2x1` | `2x2` |
| Gallery 画廊 | - | `3x1` | `3x3` |
| ComboBox 下拉框 | - | `3x1` | `4x1` |
| EditBox 输入框 | - | `3x1` | `4x1` |
| CheckBox 复选框 | `1x1` | `2x1` | - |

## 已实现功能

- 中文控件库和中文界面文案。
- 默认空白 Ribbon。
- 右侧控件库拖放到画布分组。
- 画布控件拖动重排，并按网格吸附。
- 分组固定 3 行高，只允许调整列数。
- 拖入或移动到已有控件位置时拒绝放置。
- 改尺寸时如果会覆盖其他控件，会自动寻找空位；没有空位则拒绝修改。
- 属性编辑与 JSON 实时同步。
- JSON 复制、导出、导入。
- 浏览器本地存储自动保存。
- Playwright 主流程测试和截图验收。

## 数据模型

导出 JSON 仍保留后续生成 DAML 所需的结构：

```json
{
  "metadata": {
    "app": "gispro-ribbon-designer",
    "schemaVersion": "1.0"
  },
  "tabs": [],
  "groups": [],
  "subgroups": [],
  "controls": []
}
```

说明：

- `subgroups` 目前作为内部兼容层保留，每个 `Group` 只有一个内部网格。
- 用户界面不再暴露多个子组。
- `control.layout` 保存真实网格位置：`x / y / w / h`。
- `control.behavior` 和 `eventBindings` 先作为后续命令事件扩展入口。

## 运行方式

```powershell
cd ribbon-designer
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

打开：

```text
http://127.0.0.1:4173/
```

## 验证命令

```powershell
cd ribbon-designer
npm run build
npm run test:smoke
```

测试会验证：

- 页面正常打开。
- 默认没有 Add-In 工具箱、地图风格模板按钮。
- 只显示宽屏，不显示标准、紧凑、折叠。
- 没有加行、减行按钮。
- 新增分组后高度固定为 3 行。
- 大按钮保持 `2x3`，即 `64px x 96px`。
- 已占位置不能再放入其他控件。
- 修改控件标题后 JSON 同步更新。
- JSON 可以导出。

## 主要文件

```text
ribbon-designer/src/next/NextRibbonDesigner.tsx   默认主界面、拖放、分组网格、导入导出
ribbon-designer/src/next/NextRibbonDesigner.css   ArcGIS Pro 风格界面、网格、控件比例
ribbon-designer/src/next/ribbonLayout.ts          网格尺寸、碰撞检测、吸附布局
ribbon-designer/src/next/ControlMock.tsx          Ribbon 控件外观模拟
ribbon-designer/src/library.ts                    控件库定义
ribbon-designer/src/ribbon.ts                     模板、导入校验、尺寸规则
ribbon-designer/src/types.ts                      JSON 数据模型类型
ribbon-designer/tests/ribbon-smoke.spec.ts        Playwright 主流程测试
```

## 后续建议

- 增加更贴近 DAML 的 Tab、Group、Control 属性面板。
- 增加命令事件配置面板。
- 增加 DAML/XML 生成器。
- 根据更多官方控件文档继续校准 SplitButton、Gallery、ComboBox 等控件的展示规则。
