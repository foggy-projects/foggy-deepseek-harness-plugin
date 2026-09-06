# DeepSeek Harness 社区插件目录准备

状态记录：2026-09-06。DeepSeek Harness 官方页面仍标注为开发者预览版，
官方公开入口是源码、开发者文档、GitHub `dsh-plugin` Topic 和社区讨论，
目前没有看到官方一方插件市场或官方审核收录入口。

## 推荐顺序

### 1. `awesome-dsh-plugin`（优先提交）

- 目录仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
- 提交方式：向该仓库提交 PR，只新增一个
  `data/plugins/foggy-projects__foggy-deepseek-harness-plugin.yml` 文件。
- 主要要求：真实可用代码、仓库至少存在 1 天、添加 `dsh-plugin` Topic、
  描述准确且不使用夸张营销语句、根包声明 `dsh.bundle`。
- 可选增强：在 npm 发布包中保留正确的 `repository` 字段；如提供 GitHub
  Release `.tgz`，可在条目中声明固定版本的 `tarball`。
- 评审说明：CI 检查格式和 manifest，维护者会阅读目标仓库；收录不等于
  安全审计或官方认证。

建议条目草稿：

```yaml
url: https://github.com/foggy-projects/foggy-deepseek-harness-plugin
name: foggy-projects/foggy-deepseek-harness-plugin
category: tools
description:
  en: Foggy Java data-analysis integration for DeepSeek Harness with a managed Runtime, CLI, Launcher, onboarding Skills, and semantic-layer workflows.
  zh: 在 DeepSeek Harness 中管理 Foggy Java 数据分析 Runtime、CLI、Launcher 与 onboarding/语义查询 Skill，支持数据库接入和语义层建模。
```

### 2. `dsh-market`（市场应用，目录来自上游）

- 项目：<https://github.com/dsh-market/dsh-market>
- 它是可安装到 DSH 设置页的社区市场应用，本身不是目录数据源。
- 目录来自 `awesome-dsh-plugin`；其说明要求向上游目录提交 PR，
  市场会自动同步，通常不需要重复提交到 `dsh-market`。
- 适合验证“一键安装”体验，但它不是 DeepSeek 官方产品。

### 3. `DSH-Plugins-Marketplace`（Topic 自动聚合）

- 项目：<https://github.com/bradeGithub/DSH-Plugins-Marketplace>
- 通过 GitHub `dsh-plugin` Topic 自动聚合，项目讨论中说明无需手工 PR，
  Topic 出现后等待索引刷新即可。
- 它会安装到 DSH Web profile，适合做第二个发现入口；必须标注为第三方市场。

### 4. `dshplugin.app`（独立目录与证据页）

- 目录：<https://dshplugin.app/>
- 支持提交公开 GitHub 仓库，随后进行源码、manifest、依赖、安装路径和兼容性
  信号分析。
- 页面明确声明其为独立社区项目，不隶属于 DeepSeek；“Indexed”不等于安全认证。
- 适合补充兼容性说明和安全信号展示，但不应把它描述为官方市场。

## 当前可执行清单

1. 保持当前 npm `rc` 预发布与 GitHub Release，不切换 `latest`。
2. 给 GitHub 仓库添加 `dsh-plugin` Topic；可同时保留
   `deepseek-harness`、`data-analysis`、`semantic-layer` 等描述性 Topic。
3. 确认下一次 npm 发布继续携带 `repository`、`homepage`、`bugs` 和
   `dsh-plugin` keywords，便于目录把 npm 包与源码仓库关联。
4. 优先向 `awesome-dsh-plugin` 提交上面的单文件 PR，再等待 `dsh-market`
   同步；随后向 `dshplugin.app` 提交公开仓库 URL。
5. 对外文案统一使用“社区目录/第三方市场”，不使用“官方市场/官方认证”。
