# 通过签名更新器分发后续 Demo

应用更新继续使用 Tauri Updater：Release 提供签名安装包和 `latest.json`，发布后由 `sync-latest-json.yml` 将清单同步到仓库 `main` 分支。该分支的 GitHub Raw 地址为主端点，jsDelivr 镜像为备用端点，两者均读取持续更新的清单，以发现后续版本。预发布版本不依赖于 GitHub 的 `/releases/latest`，因为它只指向非预发布 Release。发布标签和安装包版本必须一致，草稿 Release 只有在签名、安装、更新回退和端点可达性均验证后才能公开。
