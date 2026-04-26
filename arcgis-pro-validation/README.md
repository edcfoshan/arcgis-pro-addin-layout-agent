# ArcGIS Pro 3.5 验证工程

这个目录放的是最小 ArcGIS Pro 3.5 Add-in 验证工程，用来把设计器导出的 JSON 转成 `Config.daml`，再打包成 `.esriAddinX` 真机看 Ribbon 格局。

常用命令：

```powershell
.\tools\sync-arcgis-pro-validation.ps1
.\tools\build-arcgis-pro-validation.ps1
```

如果要换成别的布局 JSON：

```powershell
.\tools\sync-arcgis-pro-validation.ps1 -InputJson .\your-layout.json
```

## 最新状态

- 验证工程会从设计器导出的当前布局 JSON 生成 `Config.daml`、`Generated/LayoutControls.g.cs` 和安装包。
- `Config.daml` 的 `AddInInfo version` 和安装包文件名都会随当前布局时间更新，用来降低 ArcGIS Pro 复用旧包的概率。
- 当前默认输出目录是：
  `C:\Users\13975\Documents\arcgis-pro-addin-layout-agent\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn\bin\Debug\net8.0-windows7.0`
- 生成完成后可以直接用这个目录里的 `.esriAddInX` 做安装测试。