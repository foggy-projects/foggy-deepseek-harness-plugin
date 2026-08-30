window.__ModuleLoader__.load({
  id: '@foggy-projects/deepseek-harness-plugin',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const { jsx, jsxs } = require('react/jsx-runtime')
    const { useCallback, useEffect, useState } = require('react')

    const NS = 'settings.foggy'
    const passthroughSchema = { parse: (value) => value }
    const TYPERT_REMOTE = {
      package: '@foggy-projects/deepseek-harness-plugin',
      descriptors: ['status', 'plan', 'initialize', 'repair', 'runtimeStart', 'runtimeStop'].map((method) => ({
        id: `@foggy-projects/deepseek-harness-plugin#foggyIntegration/${method}`,
        service: 'foggyIntegration',
        namespace: 'foggyIntegration',
        method,
        invocation: { kind: 'direct' },
        parameters: [],
        result: {
          mode: 'strict',
          typeSymbol: '@foggy-projects/deepseek-harness-plugin#FoggyIntegrationResult',
          schema: passthroughSchema,
        },
        sourceLocation: { file: 'lib/index.js', line: 1, column: 1 },
      })),
    }

    const zh = {
      tab: 'Foggy 数据分析',
      title: 'Foggy Java 数据分析引擎',
      intro: '在 DeepSeek Harness 内管理 Foggy CLI、Launcher、Skills 和本地 Runtime。大型组件在首次初始化时按需下载。',
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
      python: 'Python',
      java: 'Java',
      installed: '已安装',
      missing: '未安装',
      available: '可用',
      unavailable: '不可用',
      initialize: '初始化 Foggy',
      repair: '重新下载 / 修复',
      start: '启动 Runtime',
      stop: '停止 Runtime',
      working: '操作进行中…',
      progressWorking: '正在初始化 Foggy…',
      progressPreflight: '检查运行环境',
      progressCli: '准备 CLI',
      progressLauncher: '准备 Launcher',
      progressAnalysis: '准备分析 Skill',
      progressSkills: '安装工作区 Skills',
      progressState: '写入安装状态',
      progressComplete: '初始化完成',
      progressFiles: '文件',
      accepted: '操作已开始；页面会自动刷新状态。',
      actionFailed: '操作失败',
      roots: '本地目录',
      installRoot: '组件目录',
      dataRoot: '数据目录',
      runtimeUrl: 'Runtime 地址',
      projectRoot: 'Skill 目标工作区',
      nextTitle: '后续配置',
      nextCopy: 'Runtime 启动成功后，将继续进入数据库连接与语义层向导。数据库密码不会写入 DSH 普通设置。',
      beta: 'Beta',
    }

    const en = {
      tab: 'Foggy Data Analysis',
      title: 'Foggy Java Data Analysis Engine',
      intro: 'Manage the Foggy CLI, Launcher, Skills, and local Runtime inside DeepSeek Harness. Large components are downloaded on first initialization.',
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
      python: 'Python',
      java: 'Java',
      installed: 'Installed',
      missing: 'Missing',
      available: 'Available',
      unavailable: 'Unavailable',
      initialize: 'Initialize Foggy',
      repair: 'Re-download / Repair',
      start: 'Start Runtime',
      stop: 'Stop Runtime',
      working: 'Operation in progress…',
      progressWorking: 'Initializing Foggy…',
      progressPreflight: 'Checking prerequisites',
      progressCli: 'Preparing CLI',
      progressLauncher: 'Preparing Launcher',
      progressAnalysis: 'Preparing analysis Skill',
      progressSkills: 'Installing workspace Skills',
      progressState: 'Writing install state',
      progressComplete: 'Initialization complete',
      progressFiles: 'files',
      accepted: 'The operation started; this page will refresh automatically.',
      actionFailed: 'Operation failed',
      roots: 'Local directories',
      installRoot: 'Components',
      dataRoot: 'Data',
      runtimeUrl: 'Runtime URL',
      projectRoot: 'Skill target workspace',
      nextTitle: 'Next configuration',
      nextCopy: 'After the Runtime starts, the database connection and semantic-layer wizard comes next. Database passwords are never stored in ordinary DSH settings.',
      beta: 'Beta',
    }

    const css = `
      .foggy-settings{width:100%;max-width:820px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:16px}
      .foggy-hero{border:1px solid var(--dsw-alias-border-l2);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-layer-3)),var(--dsw-alias-bg-layer-3));border-radius:12px;padding:18px}
      .foggy-title-row{display:flex;align-items:center;gap:10px}.foggy-title-row h3{margin:0;font-size:18px;line-height:26px}.foggy-beta{font-size:11px;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-state-business-primary)}
      .foggy-intro{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.foggy-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .foggy-state{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}.foggy-dot{width:9px;height:9px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.foggy-dot[data-state=ready],.foggy-dot[data-state=running]{background:var(--dsw-alias-state-success-primary)}.foggy-dot[data-state=degraded]{background:var(--dsw-alias-state-error-primary)}
      .foggy-actions{display:flex;gap:8px;flex-wrap:wrap}.foggy-button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:7px 12px;cursor:pointer}.foggy-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.foggy-button:disabled{opacity:.55;cursor:not-allowed}.foggy-button-primary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:white}
      .foggy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.foggy-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:13px 14px}.foggy-card-head{display:flex;justify-content:space-between;gap:8px}.foggy-card strong{font-size:13px}.foggy-badge{font-size:11px;color:var(--dsw-alias-label-secondary)}.foggy-card code{display:block;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow-wrap:anywhere}
      .foggy-progress{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:13px 14px}.foggy-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}.foggy-progress-head strong{font-weight:600}.foggy-progress-percent{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.foggy-progress-track{height:8px;margin-top:10px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}.foggy-progress-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-business-primary);transition:width .25s ease}.foggy-progress-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.foggy-progress-file{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .foggy-message{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.foggy-message[data-error=true]{color:var(--dsw-alias-state-error-primary)}.foggy-paths,.foggy-next{border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px}.foggy-paths h4,.foggy-next h4{margin:0 0 8px;font-size:13px}.foggy-paths dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:6px 10px;margin:0}.foggy-paths dt{color:var(--dsw-alias-label-tertiary);font-size:12px}.foggy-paths dd{margin:0;min-width:0;overflow-wrap:anywhere;font-family:var(--ds-font-family-code);font-size:11px}.foggy-next p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
      @media (width<=680px){.foggy-grid{grid-template-columns:minmax(0,1fr)}}
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
      const stateText = kind === 'runtime'
        ? t(available ? 'installed' : 'missing')
        : t(available ? 'available' : 'unavailable')
      return jsxs('div', {
        className: 'foggy-card',
        children: [
          jsxs('div', { className: 'foggy-card-head', children: [
            jsx('strong', { children: label }),
            jsx('span', { className: 'foggy-badge', children: stateText }),
          ] }),
          jsx('code', { children: `${component?.version || component?.output || '—'}${component?.minimum ? ` · ≥${component.minimum}` : ''}` }),
        ],
      })
    }

    function progressPanel(progress, t) {
      if (!progress) return null
      const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
      const phaseKeys = {
        preflight: 'progressPreflight',
        cli: 'progressCli',
        launcher: 'progressLauncher',
        'analysis-skill': 'progressAnalysis',
        'workspace-skills': 'progressSkills',
        state: 'progressState',
        complete: 'progressComplete',
      }
      const phase = t(phaseKeys[progress.phase] || 'progressWorking')
      const step = progress.step?.index && progress.step?.total
        ? `${progress.step.index}/${progress.step.total}`
        : ''
      const files = progress.files?.total
        ? `${progress.files.completed || 0}/${progress.files.total} ${t('progressFiles')}`
        : ''
      return jsxs('div', {
        className: 'foggy-progress',
        role: 'status',
        'aria-live': 'polite',
        children: [
          jsxs('div', { className: 'foggy-progress-head', children: [
            jsx('strong', { children: progress.message || phase }),
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
            jsx('span', { children: [step, files].filter(Boolean).join(' · ') }),
          ] }),
          progress.currentFile ? jsx('div', { className: 'foggy-progress-meta foggy-progress-file', title: progress.currentFile, children: progress.currentFile }) : null,
        ],
      })
    }

    function FoggySettingsTab({ api, t }) {
      const [view, setView] = useState({ phase: 'loading', status: null, message: '', error: false })

      const refresh = useCallback(async () => {
        setView((current) => ({ ...current, phase: current.status ? 'ready' : 'loading', error: false }))
        try {
          const status = unwrap(await api.status(), 'status')
          setView((current) => ({ ...current, phase: 'ready', status, error: false }))
        } catch (error) {
          setView((current) => ({ ...current, phase: current.status ? 'ready' : 'error', message: String(error.message || error), error: true }))
        }
      }, [api])

      useEffect(() => { refresh() }, [refresh])
      useEffect(() => {
        if (view.status?.operation?.state !== 'running') return undefined
        const timer = setInterval(refresh, 2000)
        return () => clearInterval(timer)
      }, [refresh, view.status?.operation?.state])

      const run = async (method) => {
        setView((current) => ({ ...current, message: t('working'), error: false }))
        try {
          const result = unwrap(await api[method](), method)
          setView((current) => ({ ...current, message: result.accepted ? t('accepted') : '', error: result.success === false }))
          await refresh()
        } catch (error) {
          setView((current) => ({ ...current, message: `${t('actionFailed')}: ${String(error.message || error)}`, error: true }))
        }
      }

      if (view.phase === 'loading') return jsx('p', { className: 'foggy-message', children: t('loading') })
      if (view.phase === 'error') return jsxs('div', { className: 'foggy-settings', children: [
        jsx('p', { className: 'foggy-message', 'data-error': true, children: `${t('failed')} ${view.message}` }),
        jsx('button', { className: 'foggy-button', type: 'button', onClick: refresh, children: t('retry') }),
      ] })

      const status = view.status
      const busy = status.operation?.state === 'running'
      const operationError = status.operation?.state === 'failed'
        ? status.operation.error || status.operation.result?.error?.message || t('actionFailed')
        : ''
      const progress = busy ? progressPanel(status.operation?.progress, t) : null
      const stateLabels = { 'not-installed': 'notInstalled', degraded: 'degraded', ready: 'ready', running: 'running' }
      return jsxs('section', { className: 'foggy-settings', children: [
        jsxs('div', { className: 'foggy-hero', children: [
          jsxs('div', { className: 'foggy-title-row', children: [jsx('h3', { children: t('title') }), jsx('span', { className: 'foggy-beta', children: t('beta') })] }),
          jsx('p', { className: 'foggy-intro', children: t('intro') }),
        ] }),
        jsxs('div', { className: 'foggy-toolbar', children: [
          jsxs('div', { className: 'foggy-state', children: [jsx('span', { className: 'foggy-dot', 'data-state': status.state }), jsx('span', { children: t(stateLabels[status.state] || 'notInstalled') })] }),
          jsxs('div', { className: 'foggy-actions', children: [
            jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: refresh, children: t('refresh') }),
            !status.installed ? jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => run('initialize'), children: t('initialize') }) : null,
            status.installed ? jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: () => run('repair'), children: t('repair') }) : null,
            status.installed && !status.running && status.components.java.available ? jsx('button', { className: 'foggy-button foggy-button-primary', type: 'button', disabled: busy, onClick: () => run('runtimeStart'), children: t('start') }) : null,
            status.running ? jsx('button', { className: 'foggy-button', type: 'button', disabled: busy, onClick: () => run('runtimeStop'), children: t('stop') }) : null,
          ] }),
        ] }),
        progress,
        busy || operationError || view.message ? jsx('p', { className: 'foggy-message', 'data-error': operationError || view.error ? 'true' : undefined, children: busy ? t('working') : operationError || view.message }) : null,
        jsxs('div', { className: 'foggy-grid', children: [
          componentCard(t('python'), status.components.python, 'tool', t),
          componentCard(t('java'), status.components.java, 'tool', t),
          componentCard(t('cli'), status.components.cli, 'runtime', t),
          componentCard(t('launcher'), status.components.launcher, 'runtime', t),
          componentCard(t('analysisSkill'), status.components.analysisSkill, 'runtime', t),
        ] }),
        jsxs('div', { className: 'foggy-paths', children: [
          jsx('h4', { children: t('roots') }),
          jsxs('dl', { children: [
            jsx('dt', { children: t('installRoot') }), jsx('dd', { children: status.roots.installRoot }),
            jsx('dt', { children: t('dataRoot') }), jsx('dd', { children: status.roots.dataRoot }),
            jsx('dt', { children: t('projectRoot') }), jsx('dd', { children: status.projectRoot }),
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
