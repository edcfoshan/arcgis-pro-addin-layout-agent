# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

ArcGIS Pro Add-in 功能区布局工具:在桌面设计器里拖出 Ribbon 布局,所见即所得地生成 `.esriAddInX` 安装包,导出到 ArcGIS Pro 验算。验收标准是「设计器里拖的样子 = Pro 里的样子」。

仓库里有两代实现,**新工作都在 `designer-app/`(Tauri 桌面应用)**:

- `designer-app/` — Tauri 2 + React 19 + TypeScript 的桌面设计器(当前主线)
- `ribbon-designer/` — 旧版 Web 设计器(Vite,端口 4173),仅 `shared/arcgisProValidation.ts` 和 `src/core` 逻辑仍有参考价值,UI 已被取代
- `arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn` — .NET 8 验算插件,布局验证的载体,由工具链自动生成代码后编译
- `tools/` — 构建/验证脚本和图标库;`tools/icon-cache/`(约 1.8 万张 PNG)**已随仓库 vendored,克隆即用,无需重提**
- `00测试包/` — 演示/测试安装包产物目录(gitignore)

## 常用命令

```powershell
# 桌面设计器(主线)
cd designer-app
npm run tauri dev            # 启动桌面应用(同时起 Vite,端口 1420)
npx tsc --noEmit             # 类型检查
npm run build                # tsc + vite build
npm run tauri build          # 正式版:产物在 src-tauri/target/release/designer-app.exe
                             # 及 bundle/(msi/nsis);惯例:复制 exe 到仓库根(根目录 designer-app.exe 已 gitignore)

# Rust 后端测试(designer-app/src-tauri,cargo 在任意 cwd 下都能跑)
cargo test --lib                    # 单元测试(图标解析等,快)
cargo test --test export_addin_test # 导出打包集成测试,会真实调 dotnet build 编译 C# 插件
cargo test --test validate_layout_test          # 验算管线测试(组 CaseDir/失败路径)
cargo test --test validate_layout_test -- --ignored --nocapture  # 端到端:真启动/复用 Pro 截图
cargo test --test export_addin_test build_all_controls_demo_package -- --ignored --nocapture
                                    # 全控件演示包:9 类型×各尺寸 21 控件,产出 00测试包/AllControls-Demo-*.esriAddInX

# 全控件演示布局生成(上面演示包测试的前置)
node --experimental-strip-types tools/generate-all-controls-demo.mts

# 单用例装机截图(CaseDir 需含 *.esriAddinX + Config.daml;keytip 建议单字符)
powershell -File tools/pro-ui-check.ps1 -CaseDir <目录> -WaitSeconds 90 -TabKeyTip Z

# 批量随机布局验算 + HTML 报告
powershell -File tools/run-ribbon-layout-validation.ps1 -Cases 10 -RunProUiCheck

# 手动构建验算插件安装包(设计器打包按钮内部走的同一脚本)
powershell -File tools/build-arcgis-pro-validation.ps1 -Version 1.2.3

# 开发环境体检(Node/Rust/.NET/VS BuildTools/Pro/图标缓存,只读;-Install 缺啥装啥)
powershell -File tools/setup-dev-env.ps1

# 手动重提图标库(Pro 升级后图标变化时;Pro 位置见下方「已知约束」)
cd tools/icon-extract
dotnet run -- "<Pro 安装目录>\bin\ArcGIS.Desktop.Resources.dll" "<本仓库>\tools\icon-cache"

# 旧 Web 设计器(仅维护时用)
cd ribbon-designer
npm run dev -- --host 127.0.0.1 --port 4173
npm run build && npm run test:smoke    # Playwright 主流程测试
```

Rust 侧路径用 `CARGO_MANIFEST_DIR/../..` 编译期定位仓库根。

## 端到端管线(理解全局的关键)

```
RibbonDocument (JSON)
  → designer-app/src/core/arcgisProValidation.ts
      生成 Config.daml + 占位 C# (Generated/LayoutControls.g.cs) + layout 快照 + iconFiles 清单
  → src-tauri run_export_addin:
      写 Layout/current-layout.json 到验算插件项目
      → tools/build-arcgis-pro-validation.ps1
          → tools/sync-arcgis-pro-validation.ps1 (node --experimental-strip-types 跑 generate-*.mts,
              用 ribbon-designer/shared/arcgisProValidation.ts 重新生成项目根 DAML/g.cs)
          → dotnet build (优先;VS BuildTools 的 MSBuild.exe 缺 .NET SDK 不可用,仅作后备)
              ⚠ Esri SDK 的打包目标(CodeTaskFactory)在 dotnet Core MSBuild 下不可用且被
              csproj 排除——dotnet 只编译 DLL,从不打包;build 脚本里的 Stage-AddInArchive
              自行铺 temp_archive(Config.daml + Install/{dll,deps.json,pdb,Layout})并
              Compress-Archive 出 bin 包,保证每次构建内容新鲜
      → Rust 读 obj/Debug/net8.0-windows7.0/temp_archive 组 zip 打包成 .esriAddInX,
          按 iconFiles 清单把 icon-cache 的 PNG 注入包内 Images/
  → tools/pro-ui-check.ps1:解压安装到 Documents\ArcGIS\AddIns → 启动/复用 Pro
      (等待主窗口就绪、还原最小化、置前台并校验前台句柄)→ KeyTip 切页签 → 全屏截图
```

**DAML 生成器有两个变体,改布局→DAML 逻辑时两边都要看**:

- `ribbon-designer/shared/arcgisProValidation.ts` — **打包链实际使用的那个**(sync 脚本入口),随机验算也走它
- `designer-app/src/core/arcgisProValidation.ts` — Tauri 应用内 artifacts 生成(喂「导出 Config.daml」按钮和 export/validate 的 payload)

两者都仅在 icon 为 `.png` 完整文件名时输出 `smallImage/largeImage`(随机生成器的逻辑名如 `tool16` 会被守卫跳过)。

`designer-app/src/core/` 是从旧 `ribbon-designer` 原样移植的纯逻辑层(types / ribbonLayout / library / ribbon / arcgisProValidation),不要重写其中已验证的网格/碰撞/DAML 生成逻辑;UI 层在 `designer-app/src/ui/`。

## 数据模型与布局规则

`RibbonDocument → tabs → groups → subgroups → controls`。subgroup 是内部兼容层,每个 group 只有一个网格;控件位置存 `control.layout {x,y,w,h}`,网格单位 `RIBBON_CELL = 32px`,分组高度固定 3 行、只能横向扩列(3–18 列)。

控件占格由 `getFootprint(type, size)` 决定(如 button large = 2x3,comboBox large = 4x1),尺寸概念对应 DAML 官方语义:large = 32x32 图标+文字,middle/small = 16x16。

`normalizeDocumentLayouts` 会按 `getSubgroupLayout` 规范化位置:**尊重有效的已存 layout**(拖到哪就是哪),无效时才找空位——修改拖拽/批量改尺寸逻辑时保持这一行为。

给打包链手写 layout JSON 的硬契约:每控件必填 `tooltip`(字符串)、`aiNotes`(字符串)、`behavior{className,target,arguments:{}}`;`metadata.lastUpdated` 必须是可 `Date.parse` 的 ISO 串;group 的 `subgroupIds` 必须含其全部控件的 `subgroupId`;生成器不校验网格容量/重叠,合法性自己保证(参考 `tools/generate-all-controls-demo.mts` 的装箱写法)。

## UI 设计系统(2026-09-15 重写后)

designer.css 已全量 token 化(`:root` 约 40 个语义 token:背景 5 层级/边框 4 档/文字 4 级/主色蓝系/危险系/间距 4px 栅格/圆角/动效/阴影 3 档/z-index),基准是**还原 ArcGIS Pro 本体观感(浅色 Fluent 风)**。铁律:

- **`:root` 之外不允许出现裸 hex/rgb**,改 UI 一律引用 token;要新颜色先加 token
- 全局 2px 圆角、按钮高 26px、文字 12px 基准/11px 次要;激活语言只有两种:侧栏条目=左 2px 竖条+白底,按钮/控件=浅蓝填充+accent 边框
- 控件 mock 的 Pro 还原度规则写在 CSS 07 节注释里(复选框画布白底未勾选/库内演示蓝勾、splitButton/menu 箭头贴右下 8px、兜底图标统一单色深灰蓝、控件面不透明浅渐变)
- `--cell` 恒为 32px,与 `core/ribbonLayout.ts` 的 `RIBBON_CELL` 及 inline px 定位算式联动,不可改
- UI 自检套路:`npm run dev` 后前端可在**普通浏览器**直接渲染(Tauri invoke 会失败但布局/样式全真),用 Playwright 开 localhost:1420 + `evaluate` 读计算样式/布局指标做机械验收

## 图标系统

- 图标源:Pro 的功能区图标内嵌在 `ArcGIS.Desktop.Resources.dll`(约 2.1 万张 PNG),由 `tools/icon-extract`(可用的 .NET 8 小工具,用 ResourceReader 枚举 `.g.resources`)提取到 `tools/icon-cache/`(已 vendored,见上)
- 命名:`images_<语义名><像素>.png` / `darkimages_...`(如 `images_addpoint32.png`),Rust 侧 `parse_icon_file` 按此解析主题/尺寸
- 设计器通过 Rust 命令 `list_icons` / `search_icons` / `get_icon_data_url` 拿 base64 data URL(刻意不走 asset protocol)
- 控件绑定图标后,DAML 生成器输出 `smallImage="Images\..." largeImage="Images\..."`,打包时按 `iconFiles` 清单把 PNG 注入包内 `Images/`
- 控件库默认图标为空字符串(旧版假文件名已废弃),图标一律由用户从 IconPicker 选择

## Rust 后端(designer-app/src-tauri)

命令:`list_icons`、`search_icons`、`get_icon_data_url`、`write_text_file`、`get_default_target_dir`(下发 REPO_ROOT 派生的默认导出目录)、`export_addin`(薄壳,内部调 `pub fn run_export_addin` 便于集成测试直接调用)、`validate_layout`(一键验算:打包→组 CaseDir 到 `validation-runs/app`→跑 pro-ui-check→截图转 dataURL 回传,实逻辑在 `pub fn run_validate_layout`)。依赖编译期常量 `REPO_ROOT`,可用环境变量 `ICON_CACHE_DIR` 覆盖图标目录。

## 已知约束与坑(Windows 环境)

- **.ps1 含中文必须带 UTF-8 BOM**:PowerShell 5.1 对无 BOM 的按 GBK 解析,中文会撕碎引号报语法错;编辑器/工具改写 ps1 后 BOM 可能丢失或变成文件内双 BOM,改完要「剥光所有前置 BOM 再补恰好一个」
- **PS5.1 写 JSON 用 `[IO.File]::WriteAllText`**:`Set-Content -Encoding UTF8` 会带 BOM,serde_json/Node `JSON.parse` 都会挂(读侧:`Get-Content -Encoding UTF8` 或 `XmlDocument.Load` 按声明编码读)
- **Tauri 序列化约定**:入参自动做 camelCase↔snake_case 转换(仅限命令参数);**返回值不转换**,Rust 结构体需 `#[serde(rename_all = "camelCase")]` 才能对上前端字段(本仓库 IconResult/ValidationOutcome 都踩过)
- **Windows 前台锁**:后台进程直接 `SetForegroundWindow` 会被拒,先 `WScript.Shell.SendKeys('%')` 模拟一次 Alt 输入解锁;最小化窗口用 `ShowWindowAsync(SW_RESTORE)` 还原
- **运行中的 Pro 不会自动发现新装的 add-in**,需重启 Pro;pro-ui-check 已内置复用实例/还原最小化/前台句柄校验,截屏不会再拍到桌面(假阳性教训)
- 本机(Administrator)ArcGIS Pro 装在**用户级目录** `LOCALAPPDATA\Programs\ArcGIS\Pro`,探测候选含该路径的:`pro-ui-check.ps1`、`setup-dev-env.ps1`;旧机器级安装残留 `C:\Program Files\ArcGIS\Pro` 勿混淆
- dotnet SDK 10 可直接构建 net8.0-windows7.0 目标,无需装 .NET 8 SDK
- 本机 ArcGIS Pro 实际版本 3.6.0,DAML 里 `desktopVersion` 仍写 3.5.0(最低版本语义,可运行)
- 里程碑路线(Tauri 重构共识):M1 设计器+图标 ✅ → M2 一键验算 ✅(应用内「验算」按钮,Pro 截图回传与画布并排对比)→ M3 命令事件+C# 模式库(首批方向:数据加载/图层管理、地图浏览、数据编辑)→ M4 Dockpane 模板 → M5 AI 视觉评审闭环(经 `claude -p`,结构化差异 JSON)
- 导出目录默认指向验算插件的 `bin/Debug/net8.0-windows7.0`(由 `get_default_target_dir` 动态下发,前端不写死路径),安装包文件名带版本号以防 Pro 复用旧包
- `validation-runs/`、`00测试包/`、根目录 `designer-app.exe`、`bin/obj` 均已 gitignore;但仓库历史里 **bin/obj 产物曾被提交跟踪**,git status 里它们的 M 是构建噪音,提交时避开
- UI 文案、控件库、代码注释均为中文;与用户交流用中文
