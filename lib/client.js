window.__ModuleLoader__.load({
  id: '@foggy-projects/deepseek-harness-plugin',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const { jsx, jsxs } = require('react/jsx-runtime')
    const { useCallback, useEffect, useState } = require('react')

    const NS = 'settings.foggy'
    const passthroughSchema = { parse: (value) => value }
    const runtimeSettingsInputSchema = {
      parse: (value) => {
        const port = value?.port
        if (!Number.isInteger(port) || port < 1024 || port > 65535 || Object.keys(value || {}).some((key) => key !== 'port')) {
          throw new Error('Runtime port must be an integer between 1024 and 65535')
        }
        return { port }
      },
    }
    const descriptor = (method, parameters = []) => ({
      id: `@foggy-projects/deepseek-harness-plugin#foggyIntegration/${method}`,
      service: 'foggyIntegration',
      namespace: 'foggyIntegration',
      method,
      invocation: { kind: 'direct' },
      parameters,
      result: {
        mode: 'strict',
        typeSymbol: '@foggy-projects/deepseek-harness-plugin#FoggyIntegrationResult',
        schema: passthroughSchema,
      },
      sourceLocation: { file: 'lib/index.js', line: 1, column: 1 },
    })
    const TYPERT_REMOTE = {
      package: '@foggy-projects/deepseek-harness-plugin',
      descriptors: [
        ...[
        'status', 'plan', 'initialize', 'initializeAndStart', 'repair', 'updateComponents', 'repairPython', 'repairCli', 'repairLauncher', 'repairAnalysisSkill', 'repairSemanticQuerySkill',
        'migrateProfiles', 'diagnostics', 'runtimeStart', 'runtimeStop',
        ].map((method) => descriptor(method)),
        descriptor('saveRuntimeSettings', [{
          name: 'input',
          wire: 'input',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: '@foggy-projects/deepseek-harness-plugin#FoggyRuntimeSettingsInput',
            schema: runtimeSettingsInputSchema,
          },
        }]),
      ],
    }

    const zh = {
      tab: 'Foggy 数据分析',
      title: 'Foggy Java 数据分析引擎',
      intro: '在 DeepSeek Harness 内管理 Foggy 私有 Python、CLI、Launcher、Skills 和本地 Runtime。大型组件按需下载，插件升级后可在此处一键更新。',
      refresh: '刷新状态',
      loading: '正在读取 Foggy 状态…',
      failed: '暂时无法读取 Foggy 状态。',
      retry: '重试',
      notInstalled: '尚未初始化',
      degraded: '需要修复',
      ready: '已就绪',
      running: 'Runtime 运行中',
      cli: 'CLI',
      launcher: 'Launcher',
      analysisSkill: '分析 Skill',
      semanticQuerySkill: '语义查询 Skill',
      onboardingSkill: '引导 Skill',
      skillRegistry: 'DSH Skill 注册',
      python: 'Python',
      java: 'Java',
      installed: '已安装',
      missing: '未安装',
      upToDate: '最新',
      updateAvailable: '有更新',
      installedVersion: '当前版本',
      targetVersion: '目标版本',
      available: '可用',
      unavailable: '不可用',
      initialize: '初始化 Foggy',
      initializeAndStart: '初始化并启动',
      initializeAndStartDone: 'Foggy 已初始化，Runtime 已启动。',
      updateComponents: '更新组件',
      updateAndStart: '更新并启动',
      updateAndStartDone: '组件已更新，Runtime 已启动。',
      repair: '修复组件',
      repairTitle: '高级修复',
      repairPython: '检查 / 修复私有 Python',
      repairCli: '检查 / 修复 CLI',
      repairLauncher: '检查 / 修复 Launcher',
      repairAnalysisSkill: '检查 / 修复分析 Skill',
      repairSemanticQuerySkill: '检查 / 修复语义查询 Skill',
      diagnostics: '导出诊断报告',
      diagnosticsSaved: '诊断报告已保存',
      start: '启动 Runtime',
      stop: '停止 Runtime',
      updateBlockedRunning: 'Runtime 运行中，停止后才能更新组件。',
      updateReady: '检测到组件更新；可点击“更新并启动”一次完成更新。',
      updateNone: '所有托管组件均为当前版本。',
      operationTimeout: '操作等待超时，请刷新状态或导出诊断报告。',
      resourceTitle: '文档与项目',
      docs: '使用文档',
      project: '插件项目',
      releases: '版本记录',
      runtimeProject: 'Runtime 项目',
      openExternal: '在新标签页打开',
      working: '操作进行中…',
      progressWorking: '正在初始化 Foggy…',
      progressPreflight: '检查运行环境',
      progressPython: '准备私有 Python',
      progressCli: '准备 CLI',
      progressLauncher: '准备 Launcher',
      progressAnalysis: '准备分析 Skill',
      progressSemanticQuery: '准备语义查询 Skill',
      progressSkills: '注册 DSH Skills',
      progressState: '写入安装状态',
      progressComplete: '初始化完成',
      progressRuntimePreflight: '检查 Runtime 状态',
      progressRuntimeLauncher: '启动 Java Launcher',
      progressRuntimeReadiness: '等待 Runtime 就绪',
      progressRuntimeCapabilities: '验证 Runtime 能力',
      progressRuntimeState: '保存 Runtime 状态',
      progressRuntimeComplete: 'Runtime 已就绪',
      progressFiles: '文件',
      progressElapsed: '已等待',
      progressTimeout: '最长',
      progressSeconds: '秒',
      managedPrivate: 'Foggy 私有',
      configuredOverride: '外部指定',
      accepted: '操作已开始；页面会自动刷新状态。',
      actionFailed: '操作失败',
      roots: '本地目录',
      installRoot: '组件目录',
      dataRoot: '数据目录',
      profileStore: 'CLI Profile',
      profileMigrationTitle: '旧 Profile 迁移',
      profileMigrationPending: '检测到旧版临时 Profile。迁移只转移连接元数据和密码环境变量引用，不复制密码值。',
      profileMigrationConflict: '旧 Profile 存在冲突或格式问题，请先导出诊断报告。',
      migrateProfiles: '迁移到持久目录',
      onboardingProgress: '数据库与语义层进度',
      noOnboarding: '尚无数据库引导记录；请在对话中调用 Foggy onboarding Skill。',
      projectRoot: '工作区',
      resumeInChat: '未完成步骤应回到对应工作区，在对话中继续。',
      queryWarningTitle: '查询输入已自动兼容',
      queryWarningSummary: 'Runtime 在 WARN 模式下忽略了未知的查询属性，查询仍已执行。请检查告警代码与证据后决定是否修正模型或请求。',
      queryWarningCodes: '告警代码',
      queryWarningEvidence: '证据目录',
      stepPlanned: '规划',
      stepDatasourceConfigured: '数据库连接',
      stepDatasourceVerified: '连接验证',
      stepSchemaDiscovered: 'Schema 发现',
      stepSemanticDrafted: '语义层草拟',
      stepSemanticValidated: '模型校验',
      stepSemanticPublished: '发布',
      stepSemanticVerified: '首次查询',
      runtimeUrl: 'Runtime 地址',
      runtimeSettingsTitle: 'Runtime 连接设置',
      runtimePort: 'Runtime 端口',
      runtimePortHint: '端口会持久保存，CLI 与 Skill 将使用同一个 Runtime 地址。',
      configuredRuntimeUrl: '下次启动地址',
      saveRuntimePort: '保存端口',
      runtimePortSaved: 'Runtime 端口已保存',
      stopToChangePort: 'Runtime 运行时不能修改端口，请先停止 Runtime。',
      errorTitle: 'Foggy 操作失败',
      portUnavailableTitle: 'Runtime 端口被占用',
      portUnavailableMessage: '已被其他程序或 Windows 端口代理占用，Runtime 无法启动。',
      portUnavailableHelp: '请更换端口后保存并重新启动；也可以先释放占用该端口的程序或 Windows 端口代理。',
      portInvalidTitle: '端口配置无效',
      portInvalidMessage: '当前值无法保存为 Runtime 端口。',
      portInvalidHelp: '请输入 1024 到 65535 之间的整数端口。',
      settingsInvalidTitle: 'Runtime 设置文件异常',
      nextTitle: '后续配置',
      nextCopy: 'Skills 已通过 DeepSeek Harness 原生注册表提供给所有工作区；每个会话直接使用自己的工作目录。Runtime 启动成功后，将继续进入数据库连接与语义层向导。',
      beta: 'Beta',
    }

    const en = {
      tab: 'Foggy Data Analysis',
      title: 'Foggy Java Data Analysis Engine',
      intro: 'Manage Foggy private Python, CLI, Launcher, Skills, and the local Runtime inside DeepSeek Harness. Large components download on demand, and plugin upgrades can be applied here in one step.',
      refresh: 'Refresh status',
      loading: 'Reading Foggy status…',
      failed: 'Foggy status is temporarily unavailable.',
      retry: 'Retry',
      notInstalled: 'Not initialized',
      degraded: 'Repair required',
      ready: 'Ready',
      running: 'Runtime running',
      cli: 'CLI',
      launcher: 'Launcher',
      analysisSkill: 'Analysis Skill',
      semanticQuerySkill: 'Semantic Query Skill',
      onboardingSkill: 'Onboarding Skill',
      skillRegistry: 'DSH Skill registry',
      python: 'Python',
      java: 'Java',
      installed: 'Installed',
      missing: 'Missing',
      upToDate: 'Up to date',
      updateAvailable: 'Update available',
      installedVersion: 'Current',
      targetVersion: 'Target',
      available: 'Available',
      unavailable: 'Unavailable',
      initialize: 'Initialize Foggy',
      initializeAndStart: 'Initialize and start',
      initializeAndStartDone: 'Foggy was initialized and Runtime started.',
      updateComponents: 'Update components',
      updateAndStart: 'Update and start',
      updateAndStartDone: 'Components were updated and Runtime started.',
      repair: 'Repair components',
      repairTitle: 'Advanced repair',
      repairPython: 'Check / repair private Python',
      repairCli: 'Check / repair CLI',
      repairLauncher: 'Check / repair Launcher',
      repairAnalysisSkill: 'Check / repair analysis Skill',
      repairSemanticQuerySkill: 'Check / repair semantic query Skill',
      diagnostics: 'Export diagnostics',
      diagnosticsSaved: 'Diagnostics saved',
      start: 'Start Runtime',
      stop: 'Stop Runtime',
      updateBlockedRunning: 'Runtime is running. Stop it before updating components.',
      updateReady: 'Component updates are available. Use “Update and start” to finish in one step.',
      updateNone: 'All managed components are up to date.',
      operationTimeout: 'The operation timed out. Refresh the status or export diagnostics.',
      resourceTitle: 'Documentation and project',
      docs: 'User documentation',
      project: 'Plugin project',
      releases: 'Releases',
      runtimeProject: 'Runtime project',
      openExternal: 'Opens in a new tab',
      working: 'Operation in progress…',
      progressWorking: 'Initializing Foggy…',
      progressPreflight: 'Checking prerequisites',
      progressPython: 'Preparing private Python',
      progressCli: 'Preparing CLI',
      progressLauncher: 'Preparing Launcher',
      progressAnalysis: 'Preparing analysis Skill',
      progressSemanticQuery: 'Preparing semantic query Skill',
      progressSkills: 'Registering DSH Skills',
      progressState: 'Writing install state',
      progressComplete: 'Initialization complete',
      progressRuntimePreflight: 'Checking Runtime state',
      progressRuntimeLauncher: 'Starting Java Launcher',
      progressRuntimeReadiness: 'Waiting for Runtime readiness',
      progressRuntimeCapabilities: 'Verifying Runtime capabilities',
      progressRuntimeState: 'Saving Runtime state',
      progressRuntimeComplete: 'Runtime ready',
      progressFiles: 'files',
      progressElapsed: 'elapsed',
      progressTimeout: 'timeout',
      progressSeconds: 's',
      managedPrivate: 'Foggy private',
      configuredOverride: 'Configured override',
      accepted: 'The operation started; this page will refresh automatically.',
      actionFailed: 'Operation failed',
      roots: 'Local directories',
      installRoot: 'Components',
      dataRoot: 'Data',
      profileStore: 'CLI profiles',
      profileMigrationTitle: 'Legacy profile migration',
      profileMigrationPending: 'Legacy temporary profiles were found. Migration transfers connection metadata and password environment-variable references, never password values.',
      profileMigrationConflict: 'A legacy profile has a conflict or invalid format. Export diagnostics before continuing.',
      migrateProfiles: 'Move to persistent store',
      onboardingProgress: 'Database and semantic-layer progress',
      noOnboarding: 'No database onboarding record yet. Invoke the Foggy onboarding Skill in a conversation.',
      projectRoot: 'Workspace',
      resumeInChat: 'Resume incomplete steps from a conversation in the matching workspace.',
      queryWarningTitle: 'Query input was normalized',
      queryWarningSummary: 'In WARN mode, Runtime ignored unknown query properties and continued. Review the warning codes and evidence before deciding whether to change the model or request.',
      queryWarningCodes: 'Warning codes',
      queryWarningEvidence: 'Evidence directory',
      stepPlanned: 'Plan',
      stepDatasourceConfigured: 'Database connection',
      stepDatasourceVerified: 'Connection test',
      stepSchemaDiscovered: 'Schema discovery',
      stepSemanticDrafted: 'Semantic draft',
      stepSemanticValidated: 'Model validation',
      stepSemanticPublished: 'Publish',
      stepSemanticVerified: 'First query',
      runtimeUrl: 'Runtime URL',
      runtimeSettingsTitle: 'Runtime connection settings',
      runtimePort: 'Runtime port',
      runtimePortHint: 'The port is persisted so the CLI and Skills use one stable Runtime URL.',
      configuredRuntimeUrl: 'Next startup URL',
      saveRuntimePort: 'Save port',
      runtimePortSaved: 'Runtime port saved',
      stopToChangePort: 'Stop Runtime before changing its port.',
      errorTitle: 'Foggy operation failed',
      portUnavailableTitle: 'Runtime port is already in use',
      portUnavailableMessage: 'is already used by another application or Windows port proxy, so Runtime cannot start.',
      portUnavailableHelp: 'Save a different port and start again, or release the application or Windows port proxy using this port.',
      portInvalidTitle: 'Invalid port setting',
      portInvalidMessage: 'The current value cannot be saved as the Runtime port.',
      portInvalidHelp: 'Enter an integer port between 1024 and 65535.',
      settingsInvalidTitle: 'Runtime settings file is invalid',
      nextTitle: 'Next configuration',
      nextCopy: 'Skills are provided to every workspace through the native DeepSeek Harness registry, and each session uses its own working directory. After Runtime starts, the database connection and semantic-layer wizard comes next.',
      beta: 'Beta',
    }

    const css = `
      .foggy-settings{width:100%;max-width:820px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
      .foggy-hero{border:1px solid var(--dsw-alias-border-l2);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-layer-3)),var(--dsw-alias-bg-layer-3));border-radius:12px;padding:18px}
      .foggy-title-row{display:flex;align-items:center;gap:10px}.foggy-title-row h3{margin:0;font-size:18px;line-height:26px}.foggy-beta{font-size:11px;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-state-business-primary)}
      .foggy-intro{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.foggy-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.foggy-toolbar-main,.foggy-toolbar-secondary{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.foggy-toolbar-secondary{width:100%;padding-top:2px;border-top:1px solid var(--dsw-alias-border-l2)}
      .foggy-state{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}.foggy-dot{width:9px;height:9px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.foggy-dot[data-state=ready],.foggy-dot[data-state=running]{background:var(--dsw-alias-state-success-primary)}.foggy-dot[data-state=degraded]{background:var(--dsw-alias-state-error-primary)}
      .foggy-actions{display:flex;gap:8px;flex-wrap:wrap}.foggy-button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:7px 12px;cursor:pointer;transition:background-color .15s ease,box-shadow .15s ease,transform .15s ease}.foggy-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.foggy-button:active{transform:translateY(1px)}.foggy-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.foggy-button:disabled{opacity:.55;cursor:not-allowed}.foggy-button-primary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:white}
      .foggy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.foggy-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:13px 14px}.foggy-card-head{display:flex;justify-content:space-between;gap:8px}.foggy-card strong{font-size:13px}.foggy-badge{font-size:11px;color:var(--dsw-alias-label-secondary)}.foggy-card code{display:block;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow-wrap:anywhere}
      .foggy-progress{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:13px 14px}.foggy-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}.foggy-progress-head strong{font-weight:600}.foggy-progress-percent{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.foggy-progress-track{height:8px;margin-top:10px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}.foggy-progress-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-business-primary);transition:width .25s ease}.foggy-progress-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.foggy-progress-file{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .foggy-runtime-settings{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:14px}.foggy-runtime-settings h4{margin:0;font-size:13px}.foggy-runtime-settings-row{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr) auto;align-items:end;gap:10px;margin-top:10px}.foggy-field{display:flex;flex-direction:column;gap:6px}.foggy-field label{font-size:12px;font-weight:600}.foggy-input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;padding:8px 10px;outline:none}.foggy-input:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}.foggy-input[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}.foggy-setting-meta{display:flex;flex-direction:column;gap:4px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px}.foggy-setting-meta code{overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
      .foggy-update-banner{border:1px solid color-mix(in srgb,var(--dsw-alias-state-warning-primary) 55%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 9%,transparent);border-radius:10px;padding:11px 13px;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}.foggy-update-banner strong{color:var(--dsw-alias-state-warning-primary)}.foggy-update-list{margin:6px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary)}
      .foggy-resources{border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px}.foggy-resources h4{margin:0 0 9px;font-size:13px}.foggy-resource-links{display:flex;gap:8px;flex-wrap:wrap}.foggy-resource-link{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;text-decoration:none}.foggy-resource-link:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.foggy-resource-link:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
      .foggy-error-panel{border:2px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-3));border-radius:10px;padding:13px 14px;box-shadow:0 6px 18px color-mix(in srgb,var(--dsw-alias-state-error-primary) 13%,transparent)}.foggy-error-panel-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:14px;font-weight:700}.foggy-error-icon{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--dsw-alias-state-error-primary);color:white;font-size:14px}.foggy-error-panel p{margin:7px 0 0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow-wrap:anywhere}.foggy-error-help{color:var(--dsw-alias-state-error-primary)!important;font-weight:600}
      .foggy-message{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.foggy-message[data-error=true]{color:var(--dsw-alias-state-error-primary)}.foggy-paths,.foggy-next,.foggy-section{border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px}.foggy-paths h4,.foggy-next h4,.foggy-section h4{margin:0 0 8px;font-size:13px}.foggy-paths dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:6px 10px;margin:0}.foggy-paths dt{color:var(--dsw-alias-label-tertiary);font-size:12px}.foggy-paths dd{margin:0;min-width:0;overflow-wrap:anywhere;font-family:var(--ds-font-family-code);font-size:11px}.foggy-next p,.foggy-section p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.foggy-section-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.foggy-onboarding-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.foggy-onboarding-head code{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}.foggy-step-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}.foggy-step{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;font-size:11px;color:var(--dsw-alias-label-tertiary)}.foggy-step[data-state=completed]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,var(--dsw-alias-border-l2));color:var(--dsw-alias-state-success-primary)}.foggy-step[data-state=failed],.foggy-step[data-state=invalid]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.foggy-warning{border:1px solid color-mix(in srgb,var(--dsw-alias-state-warning-primary) 55%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--dsw-alias-state-warning-primary) 8%,transparent);border-radius:10px;padding:12px}.foggy-query-warning{margin-top:10px}.foggy-query-warning p+p{margin-top:5px}.foggy-query-warning code{overflow-wrap:anywhere}
      @media (width<=680px){.foggy-grid{grid-template-columns:minmax(0,1fr)}.foggy-runtime-settings-row{grid-template-columns:minmax(0,1fr)}.foggy-runtime-settings-row .foggy-button{width:100%}.foggy-toolbar-main{width:100%}.foggy-toolbar-main .foggy-button{flex:1}.foggy-resource-link{min-height:36px}}
    `

    if (typeof document !== 'undefined' && !document.querySelector('style[data-foggy-settings]')) {
      const tag = document.createElement('style')
      tag.dataset.foggySettings = 'true'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function unwrap(response, method) {
      if (!response?.ok) {
        const error = response?.error
        throw new Error(error ? `${error.code}: ${error.message}` : `${method} failed`)
      }
      return response.value
    }

    function componentCard(label, component, kind, t) {
      const available = kind === 'runtime' ? component?.installed : component?.available
      const stateText = component?.updateAvailable
        ? t('updateAvailable')
        : kind === 'runtime'
          ? t(available ? 'installed' : 'missing')
          : t(available ? 'available' : 'unavailable')
      const source = component?.source === 'managed'
        ? t('managedPrivate')
        : component?.source === 'override'
          ? t('configuredOverride')
          : null
      const detail = [
        component?.installedVersion
          ? `${t('installedVersion')} ${component.installedVersion}`
          : component?.version || component?.output || '—',
        component?.targetVersion && component?.targetVersion !== component?.installedVersion
          ? `${t('targetVersion')} ${component.targetVersion}`
          : null,
        component?.minimum ? `≥${component.minimum}` : null,
        source,
      ].filter(Boolean).join(' · ')
      return jsxs('div', {
        className: 'foggy-card',
        children: [
          jsxs('div', { className: 'foggy-card-head', children: [
            jsx('strong', { children: label }),
            jsx('span', { className: 'foggy-badge', children: stateText }),
          ] }),
          jsx('code', { children: detail }),
          component?.path ? jsx('code', { title: component.path, children: component.path }) : null,
        ],
      })
    }

    const componentLabels = {
      cli: 'cli',
      launcher: 'launcher',
      analysisSkill: 'analysisSkill',
      semanticQuerySkill: 'semanticQuerySkill',
    }

    function updateSummary(status, t) {
      return Object.entries(status?.components || {})
        .filter(([key, component]) => componentLabels[key] && component?.updateAvailable)
        .map(([key, component]) => `${t(componentLabels[key])}: ${component.installedVersion || '—'} → ${component.targetVersion}`)
    }

    function progressPanel(progress, t) {
      if (!progress) return null
      const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
      const phaseKeys = {
        preflight: 'progressPreflight',
        python: 'progressPython',
        cli: 'progressCli',
        launcher: 'progressLauncher',
        'analysis-skill': 'progressAnalysis',
        'semantic-query-skill': 'progressSemanticQuery',
        'workspace-skills': 'progressSkills',
        state: 'progressState',
        complete: 'progressComplete',
        'runtime-preflight': 'progressRuntimePreflight',
        'runtime-launcher': 'progressRuntimeLauncher',
        'runtime-readiness': 'progressRuntimeReadiness',
        'runtime-capabilities': 'progressRuntimeCapabilities',
        'runtime-state': 'progressRuntimeState',
        'runtime-complete': 'progressRuntimeComplete',
      }
      const phase = t(phaseKeys[progress.phase] || 'progressWorking')
      const headline = String(progress.phase || '').startsWith('runtime-') ? phase : progress.message || phase
      const step = progress.step?.index && progress.step?.total
        ? `${progress.step.index}/${progress.step.total}`
        : ''
      const files = progress.files?.total
        ? `${progress.files.completed || 0}/${progress.files.total} ${t('progressFiles')}`
        : ''
      const elapsed = Number(progress.timing?.elapsedSeconds)
      const timeout = Number(progress.timing?.timeoutSeconds)
      const timing = Number.isFinite(elapsed)
        ? `${t('progressElapsed')} ${elapsed}${t('progressSeconds')}${Number.isFinite(timeout) ? ` / ${t('progressTimeout')} ${timeout}${t('progressSeconds')}` : ''}`
        : ''
      return jsxs('div', {
        className: 'foggy-progress',
        role: 'status',
        'aria-live': 'polite',
        children: [
          jsxs('div', { className: 'foggy-progress-head', children: [
            jsx('strong', { children: headline }),
            jsx('span', { className: 'foggy-progress-percent', children: `${percent}%` }),
          ] }),
          jsx('div', {
            className: 'foggy-progress-track',
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            'aria-label': phase,
            children: jsx('div', { className: 'foggy-progress-fill', style: { width: `${percent}%` } }),
          }),
          jsxs('div', { className: 'foggy-progress-meta', children: [
            jsx('span', { children: phase }),
            jsx('span', { children: [step, files, timing].filter(Boolean).join(' · ') }),
          ] }),
          progress.currentFile ? jsx('div', { className: 'foggy-progress-meta foggy-progress-file', title: progress.currentFile, children: progress.currentFile }) : null,
        ],
      })
    }

    function onboardingPanel(onboarding, t) {
      const profile = onboarding?.profiles?.[0]
      if (!profile) return jsxs('div', { className: 'foggy-section', children: [
        jsx('h4', { children: t('onboardingProgress') }),
        jsx('p', { children: t('noOnboarding') }),
      ] })
      const steps = [
        ['planned', 'stepPlanned'],
        ['datasourceConfigured', 'stepDatasourceConfigured'],
        ['datasourceVerified', 'stepDatasourceVerified'],
        ['schemaDiscovered', 'stepSchemaDiscovered'],
        ['semanticDrafted', 'stepSemanticDrafted'],
        ['semanticValidated', 'stepSemanticValidated'],
        ['semanticPublished', 'stepSemanticPublished'],
        ['semanticVerified', 'stepSemanticVerified'],
      ]
      const percent = Math.round(((profile.completedSteps || 0) / Math.max(profile.totalSteps || 8, 1)) * 100)
      return jsxs('div', { className: 'foggy-section', children: [
        jsxs('div', { className: 'foggy-onboarding-head', children: [
          jsxs('div', { children: [
            jsx('h4', { children: `${t('onboardingProgress')} · ${profile.profile}` }),
            jsx('code', { children: `${t('projectRoot')}: ${profile.projectRoot || '—'}` }),
          ] }),
          jsx('span', { className: 'foggy-progress-percent', children: `${percent}%` }),
        ] }),
        jsx('div', { className: 'foggy-step-list', children: steps.map(([name, label]) => jsx('div', {
          className: 'foggy-step',
          'data-state': profile.steps?.[name]?.status || 'pending',
          title: profile.steps?.[name]?.status || 'pending',
          children: t(label),
        }, name)) }),
        profile.warningCount > 0 ? jsxs('div', { className: 'foggy-warning foggy-query-warning', role: 'status', children: [
          jsx('h4', { children: `${t('queryWarningTitle')} · ${profile.warningCount}` }),
          jsx('p', { children: t('queryWarningSummary') }),
          profile.warningCodes?.length ? jsxs('p', { children: [`${t('queryWarningCodes')}: `, jsx('code', { children: profile.warningCodes.join(', ') })] }) : null,
          profile.warningEvidence ? jsxs('p', { children: [`${t('queryWarningEvidence')}: `, jsx('code', { children: profile.warningEvidence })] }) : null,
        ] }) : null,
        profile.next?.status !== 'completed' ? jsx('p', { style: { marginTop: '9px' }, children: t('resumeInChat') }) : null,
      ] })
    }

    function errorPanel(title, message, help) {
      if (!message) return null
      return jsxs('div', {
        className: 'foggy-error-panel',
        role: 'alert',
        'aria-live': 'assertive',
        children: [
          jsxs('div', { className: 'foggy-error-panel-head', children: [
            jsx('span', { className: 'foggy-error-icon', 'aria-hidden': true, children: '!' }),
            jsx('strong', { children: title }),
          ] }),
          jsx('p', { children: message }),
          help ? jsx('p', { className: 'foggy-error-help', children: help }) : null,
        ],
      })
    }

    function FoggySettingsTab({ api, t }) {
      const [view, setView] = useState({ phase: 'loading', status: null, message: '', error: false, errorCode: null })
      const [portDraft, setPortDraft] = useState('')
      const [portDirty, setPortDirty] = useState(false)
      const [sequenceBusy, setSequenceBusy] = useState(false)

      const refresh = useCallback(async () => {
        setView((current) => ({ ...current, phase: current.status ? 'ready' : 'loading', error: false }))
        try {
          const status = unwrap(await api.status(), 'status')
          setView((current) => ({
            ...current,
            phase: 'ready',
            status,
            error: false,
            message: current.message === t('accepted') && status.operation?.state !== 'running' ? '' : current.message,
          }))
          if (!portDirty) setPortDraft(String(status.runtimeSettings?.port ?? 18166))
        } catch (error) {
          setView((current) => ({ ...current, phase: current.status ? 'ready' : 'error', message: String(error.message || error), error: true }))
        }
      }, [api, portDirty, t])

      useEffect(() => { refresh() }, [refresh])
      useEffect(() => {
        if (view.status?.operation?.state !== 'running') return undefined
        const timer = setInterval(refresh, 2000)
        return () => clearInterval(timer)
      }, [refresh, view.status?.operation?.state])

      const run = async (method) => {
        setSequenceBusy(true)
        setView((current) => ({ ...current, message: t('working'), error: false, errorCode: null }))
        try {
          const result = unwrap(await api[method](), method)
          const message = result.accepted
            ? t('accepted')
            : result.path
              ? `${t('diagnosticsSaved')}: ${result.path}`
              : result.error?.message || ''
          setView((current) => ({ ...current, message, error: result.success === false, errorCode: result.error?.code || null }))
          await refresh()
        } catch (error) {
          setView((current) => ({ ...current, message: `${t('actionFailed')}: ${String(error.message || error)}`, error: true, errorCode: 'REMOTE_ERROR' }))
        } finally {
          setSequenceBusy(false)
        }
      }

      const waitForOperation = async (operationId) => {
        for (let attempt = 0; attempt < 900; attempt += 1) {
          const status = unwrap(await api.status(), 'status')
          const operation = status.operation
          if (operation?.id === operationId && operation.state !== 'running') return status
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        throw new Error(t('operationTimeout'))
      }

      const runSequence = async (methods, successMessage) => {
        setSequenceBusy(true)
        setView((current) => ({ ...current, message: t('working'), error: false, errorCode: null }))
        try {
          for (const method of methods) {
            const result = unwrap(await api[method](), method)
            if (result.success === false) {
              setView((current) => ({ ...current, message: result.error?.message || t('actionFailed'), error: true, errorCode: result.error?.code || null }))
              return
            }
            if (result.accepted && result.operation?.id) {
              const completed = await waitForOperation(result.operation.id)
              if (completed.operation?.state === 'failed') {
                throw new Error(completed.operation.error || completed.operation.result?.error?.message || t('actionFailed'))
              }
            }
          }
          setView((current) => ({ ...current, message: successMessage, error: false, errorCode: null }))
        } catch (error) {
          setView((current) => ({ ...current, message: `${t('actionFailed')}: ${String(error.message || error)}`, error: true, errorCode: 'REMOTE_ERROR' }))
        } finally {
          setSequenceBusy(false)
          await refresh()
        }
      }

      const saveRuntimePort = async () => {
        const port = Number(portDraft)
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
          setView((current) => ({ ...current, message: t('portInvalidMessage'), error: true, errorCode: 'RUNTIME_PORT_INVALID' }))
          return
        }
        setView((current) => ({ ...current, message: t('working'), error: false, errorCode: null }))
        try {
          const result = unwrap(await api.saveRuntimeSettings({ port }), 'saveRuntimeSettings')
          if (result.success === false) {
            setView((current) => ({ ...current, message: result.error?.message || t('actionFailed'), error: true, errorCode: result.error?.code || null }))
            return
          }
          setPortDirty(false)
          setPortDraft(String(result.settings.port))
          setView((current) => ({ ...current, message: `${t('runtimePortSaved')}: ${result.settings.runtimeUrl}`, error: false, errorCode: null }))
          await refresh()
        } catch (error) {
          setView((current) => ({ ...current, message: `${t('actionFailed')}: ${String(error.message || error)}`, error: true, errorCode: 'REMOTE_ERROR' }))
        }
      }

      if (view.phase === 'loading') return jsx('p', { className: 'foggy-message', children: t('loading') })
      if (view.phase === 'error') return jsxs('div', { className: 'foggy-settings', children: [
        jsx('p', { className: 'foggy-message', 'data-error': true, children: `${t('failed')} ${view.message}` }),
        jsx('button', { className: 'foggy-button', type: 'button', onClick: refresh, children: t('retry') }),
      ] })

      const status = view.status
      const busy = sequenceBusy || status.operation?.state === 'running'
      const portNumber = Number(portDraft)
      const portValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535
      const operationError = status.operation?.state === 'failed'
        ? status.operation.error || status.operation.result?.error?.message || t('actionFailed')
        : ''
      const operationErrorCode = status.operation?.state === 'failed' ? status.operation.result?.error?.code || null : null
      const settingsError = status.runtimeSettings?.valid === false
        ? status.runtimeSettings.error || t('settingsInvalidTitle')
        : ''
      const portConflict = status.runtimeSettings?.conflictApplies ? status.runtimeSettings.lastConflict : null
      const validationError = portDirty && !portValid ? t('portInvalidMessage') : ''
      const rawAlertMessage = validationError || (view.error ? view.message : '') || operationError || settingsError || portConflict?.message || ''
      const alertCode = validationError
        ? 'RUNTIME_PORT_INVALID'
        : view.error
          ? view.errorCode
          : operationErrorCode || (settingsError ? 'RUNTIME_SETTINGS_INVALID' : portConflict ? 'RUNTIME_PORT_UNAVAILABLE' : null)
      const alertTitle = alertCode === 'RUNTIME_PORT_UNAVAILABLE'
        ? t('portUnavailableTitle')
        : alertCode === 'RUNTIME_PORT_INVALID'
          ? t('portInvalidTitle')
          : alertCode === 'RUNTIME_SETTINGS_INVALID'
            ? t('settingsInvalidTitle')
            : t('errorTitle')
      const alertMessage = alertCode === 'RUNTIME_PORT_UNAVAILABLE'
        ? `${t('runtimePort')} ${portConflict?.port ?? status.runtimeSettings?.port ?? portNumber} ${t('portUnavailableMessage')}`
        : rawAlertMessage
      const alertHelp = alertCode === 'RUNTIME_PORT_UNAVAILABLE'
        ? t('portUnavailableHelp')
        : alertCode === 'RUNTIME_PORT_INVALID'
          ? t('portInvalidHelp')
          : alertCode === 'RUNTIME_RUNNING_UPDATE_REQUIRES_STOP'
            ? t('updateBlockedRunning')
          : ''
      const progress = busy ? progressPanel(status.operation?.progress, t) : null
      const pendingUpdates = updateSummary(status, t)
      const hasPendingUpdates = pendingUpdates.length > 0
      const stateLabels = { 'not-installed': 'notInstalled', degraded: 'degraded', ready: 'ready', running: 'running' }
      return jsxs('section', { className: 'foggy-settings', children: [
        jsxs('div', { className: 'foggy-hero', children: [
          jsxs('div', { className: 'foggy-title-row', children: [jsx('h3', { children: t('title') }), jsx('span', { className: 'foggy-beta', children: t('beta') })] }),
          jsx('p', { className: 'foggy-intro', children: t('intro') }),
        ] }),
        jsxs('div', { className: 'foggy-resources', children: [
          jsx('h4', { children: t('resourceTitle') }),
          jsxs('div', { className: 'foggy-resource-links', children: [
            jsx('a', { className: 'foggy-resource-link', href: 'https://github.com/foggy-projects/foggy-deepseek-harness-plugin#readme', target: '_blank', rel: 'noreferrer noopener', title: t('openExternal'), children: t('docs') }),
            jsx('a', { className: 'foggy-resource-link', href: 'https://github.com/foggy-projects/foggy-deepseek-harness-plugin', target: '_blank', rel: 'noreferrer noopener', title: t('openExternal'), children: t('project') }),
            jsx('a', { className: 'foggy-resource-link', href: 'https://github.com/foggy-projects/foggy-deepseek-harness-plugin/releases', target: '_blank', rel: 'noreferrer noopener', title: t('openExternal'), children: t('releases') }),
            jsx('a', { className: 'foggy-resource-link', href: 'https://github.com/f-projects/foggy-data-mcp-bridge', target: '_blank', rel: 'noreferrer noopener', title: t('openExternal'), children: t('runtimeProject') }),
          ] }),
        ] }),
        jsxs('div', { className: 'foggy-toolbar', children: [
          jsxs('div', { className: 'foggy-state', children: [jsx('span', { className: 'foggy-dot', 'data-state': status.state }), jsx('span', { children: `${t(stateLabels[status.state] || 'notInstalled')}${hasPendingUpdates ? ` · ${t('updateAvailable')}` : ''}` })] }),
          jsxs('div', { className: 'foggy-toolbar-main', children: [
            status.state === 'not-installed'
              ? jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => runSequence(['initializeAndStart'], t('initializeAndStartDone')), children: t('initializeAndStart') })
              : status.running
                ? jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: () => run('runtimeStop'), children: t('stop') })
                : hasPendingUpdates && status.components.java.available
                  ? jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => runSequence(['updateComponents', 'runtimeStart'], t('updateAndStartDone')), children: t('updateAndStart') })
                  : status.installed && status.components.java.available
                    ? jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => run('runtimeStart'), children: t('start') })
                    : jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => run('updateComponents'), children: t('updateComponents') }),
          ] }),
          jsxs('div', { className: 'foggy-toolbar-secondary', children: [
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: refresh, children: t('refresh') }),
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: () => run('diagnostics'), children: t('diagnostics') }),
            status.state !== 'not-installed' && !status.running && hasPendingUpdates
              ? jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: () => run('updateComponents'), children: t('updateComponents') })
              : null,
          ] }),
        ] }),
        errorPanel(alertTitle, alertMessage, alertHelp),
        progress,
        busy ? jsx('p', { className: 'foggy-message', children: t('working') }) : null,
        !busy && view.message && !view.error && !operationError ? jsx('p', { className: 'foggy-message', children: view.message }) : null,
        !busy && hasPendingUpdates ? jsxs('div', { className: 'foggy-update-banner', role: 'status', children: [
          jsx('strong', { children: t('updateAvailable') }),
          jsx('span', { children: ` · ${status.running ? t('updateBlockedRunning') : t('updateReady')}` }),
          jsx('ul', { className: 'foggy-update-list', children: pendingUpdates.map((item) => jsx('li', { children: item }, item)) }),
        ] }) : null,
        jsxs('div', { className: 'foggy-runtime-settings', children: [
          jsx('h4', { children: t('runtimeSettingsTitle') }),
          jsxs('div', { className: 'foggy-runtime-settings-row', children: [
            jsxs('div', { className: 'foggy-field', children: [
              jsx('label', { htmlFor: 'foggy-runtime-port', children: t('runtimePort') }),
              jsx('input', {
                id: 'foggy-runtime-port',
                className: 'foggy-input',
                type: 'number',
                min: 1024,
                max: 65535,
                step: 1,
                value: portDraft,
                disabled: busy || status.running,
                'aria-invalid': portDirty && !portValid ? 'true' : undefined,
                onChange: (event) => {
                  setPortDraft(event.target.value)
                  setPortDirty(true)
                  setView((current) => ({ ...current, message: '', error: false, errorCode: null }))
                },
              }),
            ] }),
            jsxs('div', { className: 'foggy-setting-meta', children: [
              jsx('span', { children: t('runtimePortHint') }),
              jsx('code', { children: `${t('configuredRuntimeUrl')}: http://127.0.0.1:${portValid ? portNumber : '—'}` }),
              status.running ? jsx('span', { children: t('stopToChangePort') }) : null,
            ] }),
            jsx('button', {
              className: 'foggy-button foggy-button-primary',
              type: 'button',
              disabled: busy || status.running || !portDirty || !portValid,
              onClick: saveRuntimePort,
              children: t('saveRuntimePort'),
            }),
          ] }),
        ] }),
        jsxs('div', { className: 'foggy-grid', children: [
          componentCard(t('python'), status.components.python, 'tool', t),
          componentCard(t('java'), status.components.java, 'tool', t),
          componentCard(t('cli'), status.components.cli, 'runtime', t),
          componentCard(t('launcher'), status.components.launcher, 'runtime', t),
          componentCard(t('analysisSkill'), status.components.analysisSkill, 'runtime', t),
          componentCard(t('semanticQuerySkill'), status.components.semanticQuerySkill, 'runtime', t),
          componentCard(t('onboardingSkill'), status.components.onboardingSkill, 'runtime', t),
          componentCard(t('skillRegistry'), { installed: status.components.onboardingSkill?.provider === 'foggy-managed-skills', version: 'native' }, 'runtime', t),
        ] }),
        jsxs('div', { className: 'foggy-section', children: [
          jsx('h4', { children: t('repairTitle') }),
          jsx('div', { className: 'foggy-section-actions', children: [
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy || status.running, title: status.running ? t('updateBlockedRunning') : undefined, onClick: () => run('repairPython'), children: t('repairPython') }),
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy || status.running, title: status.running ? t('updateBlockedRunning') : undefined, onClick: () => run('repairCli'), children: t('repairCli') }),
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy || status.running, title: status.running ? t('updateBlockedRunning') : undefined, onClick: () => run('repairLauncher'), children: t('repairLauncher') }),
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy || status.running, title: status.running ? t('updateBlockedRunning') : undefined, onClick: () => run('repairAnalysisSkill'), children: t('repairAnalysisSkill') }),
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy || status.running, title: status.running ? t('updateBlockedRunning') : undefined, onClick: () => run('repairSemanticQuerySkill'), children: t('repairSemanticQuerySkill') }),
          ] }),
        ] }),
        status.profileMigration?.pendingCount || status.profileMigration?.conflictCount ? jsxs('div', { className: 'foggy-warning', children: [
          jsx('h4', { children: t('profileMigrationTitle') }),
          jsx('p', { children: status.profileMigration.conflictCount ? t('profileMigrationConflict') : t('profileMigrationPending') }),
          !status.profileMigration.conflictCount ? jsx('div', { className: 'foggy-section-actions', children: jsx('button', {
            className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy,
            onClick: () => run('migrateProfiles'), children: t('migrateProfiles'),
          }) }) : null,
        ] }) : null,
        onboardingPanel(status.onboarding, t),
        jsxs('div', { className: 'foggy-paths', children: [
          jsx('h4', { children: t('roots') }),
          jsxs('dl', { children: [
            jsx('dt', { children: t('installRoot') }), jsx('dd', { children: status.roots.installRoot }),
            jsx('dt', { children: t('dataRoot') }), jsx('dd', { children: status.roots.dataRoot }),
            jsx('dt', { children: t('profileStore') }), jsx('dd', { children: status.roots.profileStore }),
            status.runtimeUrl ? jsx('dt', { children: t('runtimeUrl') }) : null,
            status.runtimeUrl ? jsx('dd', { children: status.runtimeUrl }) : null,
          ] }),
        ] }),
        jsxs('div', { className: 'foggy-next', children: [jsx('h4', { children: t('nextTitle') }), jsx('p', { children: t('nextCopy') })] }),
      ] })
    }

    const inject = ['slots', 'locale', 'remote']

    async function apply(ctx) {
      const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
      ctx.effect(() => disposeRemote, 'foggy: remote contribution')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'foggy: settings dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.inject(['remote.foggyIntegration'], (remoteCtx) => {
        const api = remoteCtx.remote.foggyIntegration
        remoteCtx.slots.inject('settings.plugins.tab', () => remoteCtx.slots.register({
          name: 'settings.plugins.tab',
          id: 'foggy',
          order: 5,
          label: () => t('tab'),
          locale: NS,
          inject: () => ({ api, t }),
        }, FoggySettingsTab))
      })
    }

    exports.NS = NS
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
