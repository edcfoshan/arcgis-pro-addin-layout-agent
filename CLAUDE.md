# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**极思G GISpro 插件设计器**——面向大众(测绘/国土行业 GIS 从业者与二开者)的 ArcGIS Pro Add-in 功能区布局工具:拖出 Ribbon 布局,免编译一键导出 `.esriAddInX` 安装包。验收标准仍是「设计器里拖的样子 = Pro 里的样子」;公开发布于本仓库(GitHub Releases + 应用内自动更新)。

仓库 `https://github.com/edcfoshan/arcgis-pro-addin-layout-agent`(public,MIT)。**历史含 Esri 提取图标,2026-09-15 已 filter-repo 重写并删库重建**,当前远端历史干净——不要提交任何 Esri 提取资源。本机 `tools/icon-cache-import/` 还有一批散落 Esri PNG,已 gitignore,仅作开发参考。

- `designer-app/` — Tauri 2 + React 19 + TypeScript 桌面设计器(当前主线,产品名/identifier `com.jisig.gispro-addin-designer`,版本 1.0.0)
- `ribbon-designer/` — 旧版 Web 设计器(Vite,端口 4173),仅 `shared/arcgisProValidation.ts`(打包链仍用)与 `src/core` 逻辑有参考价值
- `arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn` — .NET 8 验算插件(开发侧装机验算用)
- `tools/tabler-icons/svg/` — vendored 的 Tabler Icons outline 全集(约 5100 个 SVG,MIT)
- `tools/icon-gen/` — 图标包生成器(node + sharp + adm-zip)
- `tools/placeholder-addin/` — 免编译导出的占位 DLL 源码(.NET 8 + Esri SDK nuget)
- `tools/` 其余 — 验算/构建脚本(pro-ui-check、随机验算等,开发侧管线)

## 常用命令

```powershell
# 桌面设计器(主线)
cd designer-app
npm run tauri dev            # 启动桌面应用(beforeDevCommand 先跑 npm run icons,幂等跳过)
npm run icons                # 生成 icons-tabler.zip(--if-missing 幂等;SVG 更新后强制重跑去掉参数)
npx tsc --noEmit             # 类型检查
npm run build                # tsc + vite build
npm run tauri build          # 正式版:src-tauri/target/release/ + bundle/nsis;
                             # 惯例:复制 exe 到仓库根(已 gitignore);需要 TAURI_SIGNING_PRIVATE_KEY 环境变量出更新签名产物

# Rust 后端测试(designer-app/src-tauri)
cargo test --lib                    # 单元测试(图标解析/取名/编码等,快)
cargo test --test import_addin_test # 导入链路:解包 DAML/图标落盘/损坏包优雅失败
cargo test --test export_addin_test # 开发侧编译链集成测试(payload.daml=None 才走,需 dotnet + 本机验证插件工程;CI 不跑)

# 图标包全量重生成(SVG 源变更后)
cd tools/icon-gen && node gen-png.mjs

# 占位 DLL 重编译(占位类变更后;产物自动拷到 designer-app/src-tauri/resources/placeholder/)
powershell -File tools/placeholder-addin/build-placeholder.ps1

# 开发侧装机验算(装 .esriAddInX 到 Pro 并截图比对)
powershell -File tools/pro-ui-check.ps1 -CaseDir <目录> -WaitSeconds 90 -TabKeyTip Z
powershell -File tools/run-ribbon-layout-validation.ps1 -Cases 10 -RunProUiCheck

# 旧 Web 设计器(仅维护时用)
cd ribbon-designer && npm run dev -- --host 127.0.0.1 --port 4173
```

Rust 侧 `REPO_ROOT = CARGO_MANIFEST_DIR/../..` 仅作开发态回退;运行时优先资源目录/AppData。

## 端到端管线(理解全局的关键)

**应用内导出(大众用户路径,免编译)**:

```
RibbonDocument (JSON)
  → designer-app/src/core/arcgisProValidation.ts (placeholderBehaviors: true)
      生成 Config.daml(控件 className 统一指向 Generated.Placeholder{Button,Tool,ComboBox,EditBox,CheckBox,Gallery})
        + layout 快照 + iconFiles 清单
  → src-tauri run_export_addin(payload.daml = Some):
      Config.daml + 预编译占位 DLL(GisProRibbonLayoutValidator.AddIn.dll/.deps.json,打包资源)
        + Install/Layout/current-layout.json + Images/{Tabler/用户 PNG} → zip 成 .esriAddInX
      用户机器零依赖(无需 dotnet/Esri SDK/仓库)
```

**开发侧验算管线(保留,`daml=None` 时走)**:写 Layout → `tools/build-arcgis-pro-validation.ps1` → sync(shared 版生成器)→ dotnet build → Rust 组 zip。Esri SDK 打包目标在 dotnet Core MSBuild 下不可用,build 脚本自行铺 temp_archive。

**DAML 生成器两个变体必须镜像改**:`ribbon-designer/shared/arcgisProValidation.ts`(打包链/随机验算)与 `designer-app/src/core/arcgisProValidation.ts`(应用内 artifacts)。均仅在 icon 为 `.png` 完整文件名时输出 smallImage/largeImage;`placeholderBehaviors` 开关决定 className 走占位类还是逐控件生成类名。

**逆向(第三方包导入)**:`.esriAddInX` → Rust `run_open_import_file`(解包、DAML/图标落盘)→ `src/core/damlImport.ts`(DAML → RibbonDocument,尽力还原子集:结构/类型/尺寸/标题/keytip/图标引用;DAML 无坐标故布局自动装箱;外部 refID 引用显示为占位控件;不支持的条件/状态/updateModule 静默忽略并计入 stats)。该文件带 `.ts` 扩展名 import,可用 `node --experimental-strip-types` 直接跑。

`designer-app/src/core/` 是纯逻辑层(types/ribbonLayout/library/ribbon/arcgisProValidation/demoLayout/damlImport),不要重写已验证的网格/碰撞/DAML 生成与解析逻辑。

## 数据模型与布局规则

`RibbonDocument → tabs → groups → subgroups → controls`。subgroup 是内部兼容层,每 group 一网格;`control.layout {x,y,w,h}` 网格单位 `RIBBON_CELL=32px`,分组高 3 行、横向扩列(3–30 列)。占格 `getFootprint(type,size,variant)`;`variant='menuStyle'` 实测为带下拉箭头大按钮(2×3/2×1),勿改竖条形态。容器控件递归 `children` 不进网格。`normalizeDocumentLayouts` 尊重有效已存 layout,无效才找空位——保持此行为。

打包链手写 layout JSON 硬契约:每控件必填 `tooltip`/`aiNotes`(字符串)、`behavior{className,target,arguments:{}}`;`metadata.lastUpdated` 可 Date.parse;group.subgroupIds 含全部控件 subgroupId。

## UI 设计系统

designer.css 全量 token 化(`:root` ~40 语义 token),浅色基准还原 ArcGIS Pro 本体(Fluent 风);**暗色主题** = `:root[data-theme='dark']` 全量 token 覆盖(13 段),画布 mock 与图标选择器格子保持白底(Tabler PNG 仅浅色版,还原 Pro 画布观感)。铁律:

- `:root`/`[data-theme='dark']` 之外不允许裸 hex/rgb;新颜色先加 token(两主题都要出值)
- 底部控件库是**紧凑卡**(每类型一卡:Tabler 代表图标 + 类型名 + 尺寸徽章行;点徽章选中尺寸、按住徽章拖出即该尺寸),不再渲染 mock 实体
- `--cell` 恒 32px 不可改;`--group-cols` 必须同时设在组元素与网格元素(漏传组元素会按默认列数渲染导致溢出,实修 bug dd37c532)
- 标题栏:左「文件 ▾」下拉(新建/打开/保存/另存/最近 8 个/示例布局/关于)、文件名+未保存圆点、右侧设置齿轮与关于按钮、更新横幅
- 单文档模型:`currentFile`+`fileDirty`,Ctrl+S 无路径先另存;导入 .json 等同打开(带 path);localStorage 草稿持续兜底,关窗不拦截
- undo/redo:双栈 ref(pastRef/futureRef,深 50)+ `commit()` 单一入口(读 documentRef.current 不用 setState updater,防 StrictMode 双推);清空/新建走确认弹窗,其余删除靠 undo 兜底
- 快捷键:Ctrl+Z/Y/S/O/N、Delete 删选中、Esc 逐层关弹层(输入框聚焦时不拦截)
- UI 自检:`npm run dev` 后浏览器直渲 localhost:1420(invoke 失败但布局样式全真),Playwright evaluate 读计算样式做机械验收

**两套图标别混**:界面自身的图标(工具栏/弹窗/控件库卡片)走 `lucide-react` 组件;能拖进画布、会进导出包的**用户可选用**图标才是 Tabler(见下节)。改 UI 时不要拿 Tabler PNG 去替 lucide,反之亦然。UI 组件分工:`Designer.tsx` 主战场、`IconPicker.tsx` 图标选择器、`iconsClient.ts` 前端 icon 命令封装、`AboutDialog.tsx`/`Welcome.tsx` 弹窗、`ControlMock.tsx` 画布控件 mock。

## 图标系统(Tabler,2026-09-15 换血)

- 图标源:vendored `tools/tabler-icons/svg/`(Tabler outline 全集 ~5100,MIT);**Esri 提取图标已全部移除**(版权)
- 生成:`tools/icon-gen/gen-png.mjs` 用 **sharp**(libvips,~1.2ms/张;⚠ resvg-js 本机 129ms/张慢百倍勿回退)渲 16/32px 单色 `#4e6172`(=--icon-ink)PNG,adm-zip 打成**单文件** `designer-app/src-tauri/icons-tabler.zip`(约 6MB;避免上万散文件拖慢 NSIS)含 `zh-aliases.json` 中文别名(生成时自校验剔除失效条目)。细节:把 `stroke-width="2"` 归一化后按尺寸改 16px→1.5 / 32px→2,`currentColor` 换成 `#4e6172`;先写 `.tmp` 再 rename(原子);`--if-missing` 的跳过条件是**zip 比 svg 目录新**而不只是"存在",SVG 换了必须强制重跑
- 产物 `icons-tabler.zip` **已 gitignore**(CI 与 `npm run icons` 都会重新生成);`tools/icon-gen/package.json` 里残留一个未使用的 `@resvg/resvg-js` 依赖,属清理对象
- 运行时:Rust 从 zip 懒加载(OnceLock);查找双源=AppData 用户图标目录(散文件,优先)→ zip;`search_icons` 支持中文别名命中(图层→map-layers 之类,以 zh-aliases.json 为准)
- 用户上传:IconPicker「上传图标」→ `import_user_icon`(仅 PNG ≤8MB,imp_ 前缀防撞,落 AppData icons 目录);第三方包导入图标同样落此目录
- 命名仍是 `images_<名><像素>.png`,`parse_icon_file` 解析不变;旧文档里 Esri 名引用失效显示兜底色块(无迁移)
- 打包链 iconFiles 清单注入照旧(读取源换成 zip/用户目录)

## Rust 后端(designer-app/src-tauri)

命令:`list_icons`/`search_icons`/`get_icon_data_url`(app: AppHandle 参数,zip 主缓存)/`import_user_icon`/`read_text_file`/`write_text_file`/`get_default_target_dir`(开发态验算插件目录优先,用户机回退 Documents\极思G GISpro 插件设计器)/`export_addin`(payload.daml=Some 走免编译)/`open_import_file`(run_open_import_file 需传 ImportDirs,集成测试构造)。插件:opener/dialog/updater/process/window-state。环境变量 `ICON_CACHE_DIR`(zip 路径)/`ICON_IMPORT_DIR`/`PLACEHOLDER_DIR` 可覆盖。

## 发布与更新

- updater:tauri-plugin-updater,`dialog:false` 自建 UI(关于弹窗检查更新+下载进度+relaunch;启动静默检查可关,横幅提示);endpoints=GitHub Releases latest.json + jsdelivr @main 镜像(回写 latest.json 到仓库根的是 `sync-latest-json.yml`)
- 签名:私钥 `~/.tauri/jisig-designer.key`(**已设口令**;口令只放 GitHub Secrets 和你的密码管理器,不要写进仓库),公钥在 tauri.conf.json;CI 需 Secrets:`TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。**私钥或口令丢失就无法再发更新,务必离线备份两者**;换口令只能重新生成密钥对(tauri 不支持给已有密钥改密码),会换掉公钥,需同步更新 tauri.conf.json 的 pubkey 与两个 Secrets
- CI:`build.yml`(push/PR:gen-png → npm ci → tsc → cargo test --lib;**只跑 `--lib`,两个集成测试不在 CI 里**);`release.yml`(tag v*:tauri-action 出 NSIS+签名产物+latest.json,草稿 Release);`sync-latest-json.yml`(监听 release published,把 latest.json 回写仓库根供 jsdelivr @main 镜像——**草稿 Release 的资产下载不到,所以同步不能放在 release.yml 里**)
- 发布流程:改版本(package.json/tauri.conf.json/Cargo.toml 三处)→ commit → tag vX.Y.Z → push tag → CI 出包 → 编辑 Release 说明后发布
- bundle:仅 nsis(Windows),`installMode: currentUser`,resources 平铺 exe 同级(icons-tabler.zip + 占位 DLL/deps.json 映射);`createUpdaterArtifacts: true`

## 已知约束与坑(Windows 环境)

- **.ps1 含中文必须带 UTF-8 BOM**(PS5.1 无 BOM 按 GBK 解析会撕碎引号);改完确保恰好一个 BOM
- **Tauri 序列化**:入参自动 camel↔snake;**返回值不转换**,Rust 结构体需 `#[serde(rename_all="camelCase")]`
- **cargo 编译期校验 bundle.resources**:icons-tabler.zip 必须先存在(生成它或跑过 `npm run icons`),否则 build script 报 `resource path doesn't exist`
- **Windows 前台锁**:`SetForegroundWindow` 前先 `SendKeys('%')` 解锁;最小化用 `ShowWindowAsync(SW_RESTORE)`
- 运行中的 Pro 不自动发现新 add-in,需重启;pro-ui-check 已内置前台句柄校验
- 本机 Pro 装在 `LOCALAPPDATA\Programs\ArcGIS\Pro`(3.6.0);DAML `desktopVersion` 写 3.5.0(最低版本语义);dotnet SDK 10 可直接构建 net8.0-windows7.0
- 2026-09-15 历史已 filter-repo 重写:icon-cache(Esri 图标)/bin/obj/validation-runs/00测试包/废弃下载服务器文件全清,用户路径已替换;**勿再引用 tools/icon-cache**
- 里程碑:M1 设计器 ✅ → M2 验算 ✅ → 2026-09-15 大众化 ✅(Tabler 图标/免编译导出/undo/文件菜单/暗色/更新体系,打 v1.0.0)→ M3 命令事件+C# 模式库 → M4 Dockpane → M5 AI 视觉评审
- **CI 只跑 `cargo test --lib`,两个集成测试会悄悄烂掉**:免编译改造给 `ExportPayload` 加 `daml` 字段时漏改 `export_addin_test.rs`,该测试长期编译不过而无人发现(2026-09-15 修复)。改 Rust 公共结构体后,记得手动 `cargo test --test import_addin_test --test export_addin_test --no-run` 过一遍
- **GitHub Actions 不会把 `secrets.GITHUB_TOKEN` 自动注入环境变量**:tauri-action 建 Release 靠它,必须在 step 的 `env` 里显式写 `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`,否则构建和签名全成功、最后一步报 `##[error]GITHUB_TOKEN is required`(实修 bug,release.yml)
- 已打标签的发版要重做(改版本号/换密钥后):`git tag -d vX.Y.Z` + `git push origin :refs/tags/vX.Y.Z` → 在新提交上重打 → 再 push tag;草稿 Release 会随新的 tag 推送重建
- `designer-app/README.md` 还是 Tauri 脚手架模板原文,未改(根 README.md 才是对外文档)
- `D:\00安装包\AlailaiPro.esriAddInX` 是全零损坏文件(优雅失败测试用例)
- UI 文案、控件库、代码注释均为中文;与用户交流用中文
