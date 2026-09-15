# 极思G GISpro 插件设计器

面向测绘 / 国土行业 GIS 从业者与二开者的 **ArcGIS Pro Add-in 功能区可视化设计器**。

拖出 Ribbon 布局，**免编译一键导出 `.esriAddInX` 安装包** —— 不需要装 Visual Studio、不需要 .NET SDK、不需要 Esri Pro SDK。

> 验收标准只有一条：**设计器里拖成什么样，ArcGIS Pro 里就是什么样。**

## 下载安装

到 [Releases](../../releases/latest) 下载 `极思G GISpro 插件设计器_x.y.z_x64-setup.exe`，双击安装即可。

- 仅支持 Windows，按当前用户安装（无需管理员权限）
- 装好后自带更新：应用内「关于 → 检查更新」可一键升级

## 三步上手

1. **新增分组** —— 点画布上的「新增分组」，得到一条 3 行高的功能区网格；分组可横向加减列，用来表达功能区可用宽度。
2. **拖入控件** —— 从底部控件库选类型和尺寸（大 / 中 / 小），按住徽章直接拖到网格上。控件的占格与真实 Ribbon 一致：拖「大 2×3」就落成 2×3。
3. **导出安装包** —— 点「导出」，生成 `.esriAddInX`。双击安装，重启 ArcGIS Pro 就能看到你的功能区。

首次启动会有引导浮层，也可以直接点「打开示例布局」看看成品长什么样。

## 功能

**布局编辑**
- 9 类 Ribbon 控件：按钮、工具、分裂按钮、工具板、菜单、画廊、下拉框、输入框、复选框
- 每类支持大 / 中 / 小尺寸，占格与 ArcGIS Pro 真实显示一致
- 网格吸附、碰撞检测（空间不足时拒绝放置），分组高度固定 3 行、只允许横向扩列
- 容器控件（菜单 / 工具板 / 画廊）支持递归子项编辑

**效率**
- 全量撤销 / 重做（`Ctrl+Z` / `Ctrl+Y`，栈深 50），清空等危险操作有确认弹窗
- 快捷键：`Ctrl+Z` 撤销、`Ctrl+Y` 重做、`Ctrl+S` 保存、`Ctrl+O` 打开、`Ctrl+N` 新建、`Delete` 删除选中控件、`Esc` 逐层关闭弹层
- 标题栏「文件」菜单：新建 / 打开 / 保存 / 另存为 / 最近 8 个文件 / 示例布局
- 单文档模型，磁盘草稿持续自动兜底，关窗不会丢工作

**图标**
- 内置 Tabler Icons 全集（约 5100 个，MIT 协议），16 / 32 像素双尺寸
- 支持中文搜索：输入「图层」「放大」这类中文词直接命中对应图标
- 可上传自定义 PNG 图标

**外观**
- 浅色 / 暗色主题，还原 ArcGIS Pro 本体的 Fluent 观感
- 窗口大小与位置记忆

## 导出是怎么做到免编译的

传统做法要在用户机器上编译 C# 插件，依赖 .NET SDK 和 Esri Pro SDK，大众用户必然装不上。

本设计器的做法是：**预编译一组通用占位类随应用分发**，导出时只做三件事——

```
RibbonDocument (JSON)
  ├─ 生成 Config.daml（控件统一指向占位类）
  ├─ 打包占位 DLL + deps.json
  ├─ 注入图标到 Images/
  └─ 连同布局快照 zip 成 .esriAddInX
```

所以用户机器上零依赖，解压即得安装包。

> 注意：占位类的行为是空的，按钮点下去不会有反应。这个版本解决的是**界面布局**的快速成型；真实命令 / 事件的绑定在后续里程碑。

## 从源码构建

需要 Node.js 20+ 与 Rust 工具链。

```powershell
# 1. 生成图标包（首次必须，cargo 编译期会校验它存在；幂等可重复跑）
cd tools/icon-gen
npm ci
node gen-png.mjs

# 2. 构建桌面应用
cd ../../designer-app
npm ci
npm run tauri build
```

产物在 `designer-app/src-tauri/target/release/` 与 `bundle/nsis/`。

开发调试：

```powershell
cd designer-app
npm run tauri dev      # 启动桌面应用（自动跳过已生成的图标包）
npx tsc --noEmit       # 类型检查
```

测试：

```powershell
cd designer-app/src-tauri
cargo test --lib                     # 单元测试（图标解析 / 取名 / 编码）
cargo test --test import_addin_test  # 导入链路：解包 DAML / 图标落盘 / 损坏包优雅失败
```

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| `designer-app/` | 桌面设计器本体（Tauri 2 + React 19 + TypeScript），主线 |
| `designer-app/src/core/` | 纯逻辑层：布局 / 网格 / 碰撞 / DAML 生成 |
| `ribbon-designer/` | 旧版 Web 设计器，仅 `shared/arcgisProValidation.ts` 打包链仍在用 |
| `tools/tabler-icons/` | vendored 的 Tabler Icons SVG 源（MIT） |
| `tools/icon-gen/` | 图标包生成器（node + sharp），产出单文件 `icons-tabler.zip` |
| `tools/placeholder-addin/` | 免编译导出的占位 DLL 源码 |
| `tools/` 其余 | 开发侧验算 / 构建 / 装机截图比对脚本 |
| `arcgis-pro-validation/` | .NET 8 验算插件，开发侧装机验证用 |

## 布局规则速查

以 `1 格 = 32px × 32px` 建模，分组高 3 行：

| 控件类型 | 小 | 中 | 大 |
| --- | --- | --- | --- |
| 按钮 Button | `1x1` | `2x1` | `2x3` |
| 工具 Tool | `1x1` | `2x1` | `2x3` |
| 分裂按钮 SplitButton | - | `2x1` | `2x2` |
| 工具板 ToolPalette | - | `3x1` | `3x3` |
| 菜单 Menu | `1x1` | `2x1` | `2x2` |
| 画廊 Gallery | - | `3x1` | `3x3` |
| 下拉框 ComboBox | - | `3x1` | `4x1` |
| 输入框 EditBox | - | `3x1` | `4x1` |
| 复选框 CheckBox | `1x1` | `2x1` | - |

## 许可证

本项目以 [MIT](LICENSE) 协议开源。

内置图标来自 [Tabler Icons](https://github.com/tabler/tabler-icons)（MIT 协议）。

ArcGIS、ArcGIS Pro 是 Esri 的商标，本项目与 Esri 无隶属关系。
