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
