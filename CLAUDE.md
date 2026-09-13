# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

ArcGIS Pro Add-in 功能区布局工具:在桌面设计器里拖出 Ribbon 布局,所见即所得地生成 `.esriAddInX` 安装包,导出到 ArcGIS Pro 验算。验收标准是「设计器里拖的样子 = Pro 里的样子」。

仓库里有两代实现,**新工作都在 `designer-app/`(Tauri 桌面应用)**:

- `designer-app/` — Tauri 2 + React 19 + TypeScript 的桌面设计器(当前主线)
- `ribbon-designer/` — 旧版 Web 设计器(Vite,端口 4173),仅 `shared/arcgisProValidation.ts` 和 `src/core` 逻辑仍有参考价值,UI 已被取代
- `arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn` — .NET 8 验算插件,布局验证的载体,由工具链自动生成代码后编译
- `tools/` — 构建/验证脚本和图标库

## 常用命令

```powershell
# 桌面设计器(主线)
cd designer-app
npm run tauri dev            # 启动桌面应用(同时起 Vite,端口 1420)
npx tsc --noEmit             # 类型检查
npm run build                # tsc + vite build

# Rust 后端测试(designer-app/src-tauri)
cargo test --lib             # 单元测试(图标解析等,快)
cargo test --test export_addin_test   # 导出打包集成测试,会真实调 dotnet build 编译 C# 插件

# 旧 Web 设计器(仅维护时用)
cd ribbon-designer
npm run dev -- --host 127.0.0.1 --port 4173
npm run build && npm run test:smoke    # Playwright 主流程测试

# 手动重提图标库(Pro 升级后图标变化时)
cd tools/icon-extract
dotnet run -- "C:/Program Files/ArcGIS/Pro/bin/ArcGIS.Desktop.Resources.dll" "~/arcgis-pro-addin-layout-agent/tools/icon-cache"

# 手动构建验算插件安装包(设计器打包按钮内部走的同一脚本)
powershell -File tools/build-arcgis-pro-validation.ps1 -Version 1.2.3
```

Rust 侧路径用 `CARGO_MANIFEST_DIR/../..` 编译期定位仓库根,`cargo` 命令在任意 cwd 下都能跑。

## 端到端管线(理解全局的关键)

```
RibbonDocument (JSON)
  → designer-app/src/core/arcgisProValidation.ts
      生成 Config.daml + 占位 C# (Generated/LayoutControls.g.cs) + layout 快照 + iconFiles 清单
  → src-tauri run_export_addin:
      写 Layout/current-layout.json 到验算插件项目
      → tools/build-arcgis-pro-validation.ps1
          → tools/sync-arcgis-pro-validation.ps1 (node --experimental-strip-types 跑 generate-*.mts,重新生成 DAML/g.cs)
          → dotnet build (优先;VS BuildTools 的 MSBuild.exe 缺 .NET SDK 不可用,仅作后备)
      → 暂存 obj/Debug/net8.0-windows7.0/temp_archive (Config.daml + Install/)
      → zip 打包成 .esriAddInX,选中图标注入 Images/
  → tools/pro-ui-check.ps1:解压安装到 Pro → 启动 Pro → KeyTip 切到目标 Tab → 全屏截图
```

`designer-app/src/core/` 是从旧 `ribbon-designer` 原样移植的纯逻辑层(types / ribbonLayout / library / ribbon / arcgisProValidation),不要重写其中已验证的网格/碰撞/DAML 生成逻辑;UI 层在 `designer-app/src/ui/`。

## 数据模型与布局规则

`RibbonDocument → tabs → groups → subgroups → controls`。subgroup 是内部兼容层,每个 group 只有一个网格;控件位置存 `control.layout {x,y,w,h}`,网格单位 `RIBBON_CELL = 32px`,分组高度固定 3 行、只能横向扩列(3–18 列)。

控件占格由 `getFootprint(type, size)` 决定(如 button large = 2x3,comboBox large = 4x1),尺寸概念对应 DAML 官方语义:large = 32x32 图标+文字,middle/small = 16x16。

`normalizeDocumentLayouts` 会按 `getSubgroupLayout` 规范化位置:**尊重有效的已存 layout**(拖到哪就是哪),无效时才找空位——修改拖拽/批量改尺寸逻辑时保持这一行为。

## 图标系统

- 图标源:Pro 的功能区图标内嵌在 `C:/Program Files/ArcGIS/Pro/bin/ArcGIS.Desktop.Resources.dll`(约 2.1 万张 PNG),由 `tools/icon-extract`(可用的 .NET 8 小工具,用 ResourceReader 枚举 `.g.resources`)提取到 `tools/icon-cache/`
- 命名:`images_<语义名><像素>.png` / `darkimages_...`(如 `images_adddata32.png`),Rust 侧 `parse_icon_file` 按此解析主题/尺寸
- 设计器通过 Rust 命令 `list_icons` / `search_icons` / `get_icon_data_url` 拿 base64 data URL(刻意不走 asset protocol)
- 控件绑定图标后,DAML 生成器输出 `smallImage="Images\..." largeImage="Images\..."`,打包时按 `iconFiles` 清单把 PNG 注入包内 `Images/`
- 控件库默认图标为空字符串(旧版假文件名已废弃),图标一律由用户从 IconPicker 选择

## Rust 后端(designer-app/src-tauri)

命令:`list_icons`、`search_icons`、`get_icon_data_url`、`write_text_file`、`export_addin`(薄壳,内部调 `pub fn run_export_addin` 便于集成测试直接调用)。依赖编译期常量 `REPO_ROOT`,可用环境变量 `ICON_CACHE_DIR` 覆盖图标目录。

## 已知约束

- 本机 ArcGIS Pro 实际版本 3.6.0,DAML 里 `desktopVersion` 仍写 3.5.0(最低版本语义,可运行)
- 里程碑路线(Tauri 重构共识):M1 设计器+图标 ✅ → M2 一键验算(Pro 截图进应用对比)→ M3 命令事件+C# 模式库 → M4 Dockpane 模板 → M5 AI 视觉评审闭环(经 `claude -p`,结构化差异 JSON)
- 导出目录默认指向验算插件的 `bin/Debug/net8.0-windows7.0`,安装包文件名带版本号以防 Pro 复用旧包
- UI 文案、控件库、代码注释均为中文;与用户交流用中文
