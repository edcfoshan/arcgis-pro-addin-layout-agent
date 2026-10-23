# 快速安装与升级

## 环境

- Windows 10 / 11，64 位。
- 首次安装无需管理员权限。
- 安装只是获取设计器；导出的 `.esriAddInX` 是否正常显示仍需对应 ArcGIS Pro 环境验证。

## 安装 Demo

1. 打开 [Releases](https://github.com/edcfoshan/arcgis-pro-addin-layout-agent/releases)。
2. 下载 `JisigG-Ribbon-Designer_0.1.0-demo.1_x64-setup.exe`。
3. 对照 Release 公布值核对 SHA256。
4. 双击安装包，按简体中文向导为当前用户安装。安装后的名称为「极思G Ribbon 设计器」。
5. 从开始菜单中的「极思G Ribbon 设计器」启动，在「关于」中确认版本为 `0.1.0-demo.1`。

旧版英文名称 `JisigG-GISpro-Addin-Designer` / `JisigG-Ribbon-Designer` 安装在默认用户目录时，新安装器会调用旧卸载器移除旧程序和快捷方式，再建立中文入口。应用标识保持不变，迁移不会选择删除布局草稿与设置。若旧版安装在自定义位置或注册信息不匹配，安装器会提示先通过 Windows 设置卸载旧版；请保留应用数据后再重装。

后续版本固定使用同一中文安装名称。GitHub 安装包仍使用上面的英文文件名，该文件名与开始菜单名称相互独立。

## 检查更新

在新版本已经公开、安装包和 `latest.json` 签名均已验证后，应用会通过 Tauri Updater 检查更新。Demo 不应绕过签名校验；如果下载失败，可重新打开 Release 页面手动下载。

当前版本处于发布验证阶段；本机缺签名私钥密码时，构建产出的安装包没有可用的 `.sig`，不能把应用内更新标记为已经完成。

## 导出并验证 Ribbon 布局

1. 打开或新建一个布局，添加分组与控件。
2. 点击导出，得到 `.esriAddInX`。
3. 双击安装，重启 ArcGIS Pro。
4. 只检查功能区布局和图标是否正确。
5. 按钮不会执行业务动作，这是 Demo 的已知边界。

## 回退

如新版无法启动，卸载当前设计器后安装上一条已验证的 Release。用户设计文件与导出包应单独保留，避免把回退误当数据恢复。
