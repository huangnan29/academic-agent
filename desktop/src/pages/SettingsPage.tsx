// 设置路由页：配置（模型/MCP/本地数据）、语音、常规、归档与“计划中”分区；从 App.tsx 抽出。
import {
  Activity,
  Archive,
  ArchiveRestore,
  Bot,
  Camera,
  CircleAlert,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  Mic,
  Monitor,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  AppearanceSettingsInput,
  SystemPermissionKind,
  SystemPermissionSnapshot,
  VoiceRecognitionStatus,
  WorkspaceState,
} from '../../shared/contracts'
import { StatusBadge } from '../components/common'
import { isNativeBridge, paperAgent } from '../fallback'
import { appIconUrl, darkDockIconUrl } from '../lib/assets'
import { conversationDisplayTitle } from '../lib/conversation'
import { formatTime } from '../lib/format'
import { permissionStatusLabels } from '../lib/labels'
import type { SettingsSection } from '../lib/ui'
import { AppearanceSettingsPage } from './AppearanceSettingsPage'
import { McpSettings } from './McpSettings'
import { ProviderSettings } from './ProviderSettings'

type SettingsTab = 'providers' | 'mcp' | 'local'

function ConfigurationSettings({
  workspace,
  onRefresh,
  onToast,
}: {
  workspace: WorkspaceState
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [tab, setTab] = useState<SettingsTab>('providers')
  return (
    <section className="route-page settings-page">
      <header className="route-header settings-route-header">
        <div><span className="route-kicker">应用设置</span><h1>模型、工具与本地数据</h1><p>所有服务都由你主动配置；论文项目和过程数据默认保存在本机。</p></div>
      </header>
      <nav className="settings-tabs">
        <button type="button" className={tab === 'providers' ? 'is-active' : ''} onClick={() => setTab('providers')}><Bot size={16} /> 模型提供商</button>
        <button type="button" className={tab === 'mcp' ? 'is-active' : ''} onClick={() => setTab('mcp')}><PlugZap size={16} /> MCP 服务</button>
        <button type="button" className={tab === 'local' ? 'is-active' : ''} onClick={() => setTab('local')}><Database size={16} /> 本地数据</button>
      </nav>
      {tab === 'providers' && <ProviderSettings providers={workspace.providers} onRefresh={onRefresh} onToast={onToast} />}
      {tab === 'mcp' && <McpSettings servers={workspace.mcpServers} onRefresh={onRefresh} onToast={onToast} />}
      {tab === 'local' && (
        <div className="local-settings">
          <div className="local-setting-row"><span className="settings-row-icon"><Database size={17} /></span><div><strong>本机优先存储</strong><p>项目、对话、文稿和检索记录默认保存在当前 Mac，不自动上传到学术 Agent 服务器。</p></div><StatusBadge status="connected">已启用</StatusBadge></div>
          <div className="local-setting-row"><span className="settings-row-icon"><ShieldCheck size={17} /></span><div><strong>凭证安全存储</strong><p>安装版使用 macOS 系统安全存储保存 API Key；界面只显示是否已配置。</p></div><StatusBadge status={isNativeBridge ? 'connected' : 'demo'}>{isNativeBridge ? '系统安全存储' : '浏览器演示'}</StatusBadge></div>
          <div className="local-setting-row"><span className="settings-row-icon"><FolderOpen size={17} /></span><div><strong>项目数据</strong><p>{workspace.projects.length} 个项目 · {workspace.literature.length} 条文献记录 · {workspace.artifacts.length} 个导出产物</p></div></div>
        </div>
      )}
    </section>
  )
}

const settingsSectionDescriptions: Record<Exclude<SettingsSection, 'configuration' | 'archived'>, { title: string; eyebrow: string; description: string }> = {
  general: { title: '常规', eyebrow: '个人', description: '管理应用权限、本机研究目录和当前工作区状态。' },
  appearance: { title: '外观', eyebrow: '个人', description: '调整学术 Agent 的显示方式与阅读密度。' },
  voice: { title: '语音输入', eyebrow: '个人', description: '管理麦克风输入和语音转写入口。' },
  personalization: { title: '个性化', eyebrow: '个人', description: '通过应用内 Skills 固定你的研究方法、写作习惯和输出偏好。' },
  shortcuts: { title: '键盘快捷键', eyebrow: '个人', description: '查看当前工作区已经支持的键盘操作。' },
  'app-snapshot': { title: '应用快照', eyebrow: '集成', description: '规划通过连续按两次 Command 捕获当前应用画面并加入对话。' },
  browser: { title: '浏览器', eyebrow: '集成', description: '为研究任务连接受控的网页浏览能力。' },
  'computer-control': { title: '电脑控制', eyebrow: '集成', description: '为用户明确发起的任务连接本机应用操作能力。' },
  hooks: { title: '钩子', eyebrow: '编码', description: '在研究任务关键阶段触发应用内自动化。' },
  connections: { title: '连接', eyebrow: '编码', description: '管理后续可用于隔离执行的远程或本机连接。' },
  git: { title: 'Git', eyebrow: '编码', description: '管理研究项目与版本仓库之间的连接方式。' },
  environment: { title: '环境', eyebrow: '编码', description: '查看后续任务执行环境与变量隔离策略。' },
  worktrees: { title: 'Worktrees', eyebrow: '编码', description: '为并行研究或代码任务规划独立工作树。' },
}

function SettingsSectionHeader({ section }: { section: Exclude<SettingsSection, 'configuration' | 'archived'> }) {
  const metadata = settingsSectionDescriptions[section]
  return (
    <header className="settings-hub-header">
      <span>{metadata.eyebrow}</span>
      <h1>{metadata.title}</h1>
      <p>{metadata.description}</p>
    </header>
  )
}

function PlannedSetting({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="settings-card-row">
      <span className="settings-card-icon"><Icon size={17} aria-hidden="true" /></span>
      <span className="settings-card-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="settings-planned-badge">计划中</span>
      <button type="button" className="secondary-button compact" onClick={onAction}>{actionLabel}</button>
    </div>
  )
}

function VoiceSettings({
  systemPermissions,
  onRequestMicrophone,
  onRefreshPermissions,
  onOpenSystemSettings,
  onToast,
}: {
  systemPermissions?: SystemPermissionSnapshot
  onRequestMicrophone: () => Promise<SystemPermissionSnapshot>
  onRefreshPermissions: () => Promise<SystemPermissionSnapshot>
  onOpenSystemSettings: (kind: SystemPermissionKind) => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [busy, setBusy] = useState<'request' | 'refresh'>()
  const [recognitionStatus, setRecognitionStatus] = useState<VoiceRecognitionStatus>()
  const microphoneStatus = systemPermissions?.microphone ?? 'unknown'
  const platformSupported = systemPermissions?.platform !== 'unsupported'

  useEffect(() => {
    let active = true
    void paperAgent.voice.status()
      .then((status) => { if (active) setRecognitionStatus(status) })
      .catch(() => {
        if (active) setRecognitionStatus({
          available: false,
          authorization: 'unknown',
          locale: 'zh-CN',
          onDevice: false,
          message: '无法读取 macOS 语音识别状态。',
        })
      })
    return () => { active = false }
  }, [])

  const requestMicrophone = async () => {
    if (busy) return
    setBusy('request')
    try {
      const next = await onRequestMicrophone()
      const status = await paperAgent.voice.status()
      setRecognitionStatus(status)
      if (next.microphone === 'granted') onToast('麦克风权限已授权，可以在输入框使用语音输入')
      else onToast('麦克风权限尚未授予，请在系统设置中允许学术 Agent 使用麦克风', 'error')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '申请麦克风权限失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  const refreshPermissions = async () => {
    if (busy) return
    setBusy('refresh')
    try {
      const next = await onRefreshPermissions()
      const status = await paperAgent.voice.status()
      setRecognitionStatus(status)
      onToast(next.microphone === 'granted' ? '麦克风权限已确认' : '麦克风权限仍未授予', next.microphone === 'granted' ? 'success' : 'error')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '重新检查麦克风权限失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="settings-hub-page">
      <SettingsSectionHeader section="voice" />
      <div className="settings-content-column">
        <h2>语音输入</h2>
        <section className="settings-card voice-settings-card">
          <div className="settings-card-row">
            <span className="settings-card-icon"><Mic size={17} /></span>
            <span className="settings-card-copy"><strong>麦克风权限</strong><small>{systemPermissions ? `当前状态：${permissionStatusLabels[microphoneStatus]}` : '正在读取 macOS 麦克风授权状态。'}</small></span>
            <StatusBadge status={microphoneStatus === 'granted' ? 'connected' : microphoneStatus === 'unsupported' ? 'demo' : 'failed'}>{permissionStatusLabels[microphoneStatus]}</StatusBadge>
            <button type="button" className="secondary-button compact" onClick={() => void requestMicrophone()} disabled={Boolean(busy) || !platformSupported}>
              {busy === 'request' ? <LoaderCircle size={14} className="spin" /> : <Mic size={14} />} 请求权限
            </button>
          </div>
          <div className="settings-card-row">
            <span className="settings-card-icon"><Activity size={17} /></span>
            <span className="settings-card-copy"><strong>macOS 原生语音识别</strong><small>{recognitionStatus?.message ?? (recognitionStatus?.onDevice ? '支持本机识别；文本只会插入输入框，不会自动发送。' : '当前语言可能需要 Apple 语音服务与网络；文本不会自动发送。')}</small></span>
            <StatusBadge status={recognitionStatus?.available ? 'connected' : recognitionStatus ? 'failed' : 'demo'}>{recognitionStatus ? (recognitionStatus.available ? (recognitionStatus.onDevice ? '本机可用' : '服务可用') : '不可用') : '检查中'}</StatusBadge>
          </div>
          <div className="settings-card-row">
            <span className="settings-card-icon"><FileText size={17} /></span>
            <span className="settings-card-copy"><strong>默认语言</strong><small>首次使用会由 macOS 请求语音识别授权，识别过程中保留实时中间结果。</small></span>
            <span className="voice-language-value">简体中文（zh-CN）</span>
          </div>
        </section>
        <div className="voice-settings-actions">
          <button type="button" className="secondary-button" onClick={() => void refreshPermissions()} disabled={Boolean(busy)}>
            {busy === 'refresh' ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} 重新检查
          </button>
          <button type="button" className="secondary-button" onClick={() => { void onOpenSystemSettings('microphone') }} disabled={!platformSupported || Boolean(busy)}>
            <ExternalLink size={15} /> 打开系统设置
          </button>
        </div>
        <div className="settings-boundary-note"><CircleAlert size={16} /><span>语音按钮只在获得真实麦克风授权且当前环境支持语音识别时启动；权限被拒绝、设备不可用或识别服务出错时，应用会保留已有文字并显示错误提示。</span></div>
      </div>
    </section>
  )
}

export function SettingsPage({
  section,
  workspace,
  systemPermissions,
  choosingFolder,
  onRefresh,
  onRefreshPermissions,
  onToast,
  onManagePermissions,
  onRequestMicrophone,
  onOpenSystemSettings,
  onChooseFolder,
  onOpenSkills,
  onAppearanceChange,
  onAppearanceImport,
  onAppearanceCopy,
  onRestoreConversation,
  onRestoreAndOpen,
}: {
  section: SettingsSection
  workspace: WorkspaceState
  systemPermissions?: SystemPermissionSnapshot
  choosingFolder: boolean
  onRefresh: () => Promise<void>
  onRefreshPermissions: () => Promise<SystemPermissionSnapshot>
  onToast: (message: string, tone?: 'success' | 'error') => void
  onManagePermissions: () => void
  onRequestMicrophone: () => Promise<SystemPermissionSnapshot>
  onOpenSystemSettings: (kind: SystemPermissionKind) => Promise<void>
  onChooseFolder: () => void
  onOpenSkills: () => void
  onAppearanceChange: (input: AppearanceSettingsInput) => Promise<void>
  onAppearanceImport: () => Promise<void>
  onAppearanceCopy: () => Promise<void>
  onRestoreConversation: (conversationId: string) => Promise<void>
  onRestoreAndOpen: (projectId: string, conversationId: string) => Promise<void>
}) {
  if (section === 'configuration') {
    return <ConfigurationSettings workspace={workspace} onRefresh={onRefresh} onToast={onToast} />
  }

  if (section === 'appearance') {
    return (
      <AppearanceSettingsPage
        appearance={workspace.settings.appearance}
        appIconUrl={appIconUrl}
        darkDockIconUrl={darkDockIconUrl}
        onChange={onAppearanceChange}
        onImport={onAppearanceImport}
        onCopy={onAppearanceCopy}
        onToast={onToast}
      />
    )
  }

  if (section === 'voice') {
    return (
      <VoiceSettings
        systemPermissions={systemPermissions}
        onRequestMicrophone={onRequestMicrophone}
        onRefreshPermissions={onRefreshPermissions}
        onOpenSystemSettings={onOpenSystemSettings}
        onToast={onToast}
      />
    )
  }

  if (section === 'archived') {
    const archivedConversations = [...workspace.conversations]
      .filter((conversation) => conversation.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
    return (
      <section className="settings-hub-page archived-settings-page">
        <header className="settings-hub-header">
          <span>已归档</span>
          <h1>已归档的对话</h1>
          <p>从侧栏归档的对话会保留全部消息和项目关联，可在这里恢复。</p>
        </header>
        <div className="settings-content-column">
          {archivedConversations.length === 0 ? (
            <div className="settings-empty-state"><Archive size={24} /><strong>没有已归档的对话</strong><small>对话菜单中的“归档聊天”会把内容移动到这里。</small></div>
          ) : (
            <section className="settings-card archived-conversation-list" aria-label="已归档的对话">
              {archivedConversations.map((conversation) => {
                const project = projectById.get(conversation.projectId)
                return (
                  <article className="archived-conversation-row" key={conversation.id}>
                    <span className="settings-card-icon"><Archive size={16} /></span>
                    <span className="settings-card-copy">
                      <strong>{conversationDisplayTitle(conversation.title, project?.title ?? '')}</strong>
                      <small>{project?.title ?? '原研究已移除'} · {conversation.messageIds.length} 条消息 · {formatTime(conversation.updatedAt)}</small>
                    </span>
                    <button type="button" className="secondary-button compact" onClick={() => { void onRestoreConversation(conversation.id) }}><ArchiveRestore size={14} /> 恢复</button>
                    {project && <button type="button" className="primary-button compact" onClick={() => { void onRestoreAndOpen(project.id, conversation.id) }}>恢复并打开</button>}
                  </article>
                )
              })}
            </section>
          )}
        </div>
      </section>
    )
  }

  if (section === 'general') {
    const accessReady = systemPermissions?.fullAccessReady === true
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="general" />
        <div className="settings-content-column">
          <h2>权限</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><ShieldCheck size={17} /></span>
              <span className="settings-card-copy"><strong>系统操作权限</strong><small>辅助功能与完全磁盘访问均由 macOS 授予，应用不会绕过系统确认。</small></span>
              <StatusBadge status={accessReady ? 'connected' : 'failed'}>{accessReady ? '已满足' : '需要检查'}</StatusBadge>
              <button type="button" className="secondary-button compact" onClick={onManagePermissions}>管理权限</button>
            </div>
          </section>
          <h2>常规</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><FolderOpen size={17} /></span>
              <span className="settings-card-copy"><strong>默认研究文件夹</strong><small>{workspace.settings.researchRootPath || '未设置时使用“文稿/学术 Agent”'}</small></span>
              <button type="button" className="secondary-button compact" onClick={onChooseFolder} disabled={choosingFolder}>{choosingFolder ? <LoaderCircle size={14} className="spin" /> : <FolderOpen size={14} />} 选择</button>
            </div>
            <div className="settings-card-row">
              <span className="settings-card-icon"><Database size={17} /></span>
              <span className="settings-card-copy"><strong>本机优先存储</strong><small>{workspace.projects.length} 个研究 · {workspace.conversations.length} 个对话 · 数据默认不上传到学术 Agent 服务器。</small></span>
              <StatusBadge status="connected">已启用</StatusBadge>
            </div>
          </section>
        </div>
      </section>
    )
  }

  if (section === 'personalization') {
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="personalization" />
        <div className="settings-content-column">
          <h2>应用内个性化</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><Sparkles size={17} /></span>
              <span className="settings-card-copy"><strong>Skills</strong><small>{workspace.skills.filter((skill) => skill.enabled).length} 个已启用；只读取学术 Agent 自己维护的 Skills。</small></span>
              <button type="button" className="primary-button compact" onClick={onOpenSkills}>管理 Skills</button>
            </div>
          </section>
        </div>
      </section>
    )
  }

  if (section === 'shortcuts') {
    const shortcuts = [
      ['发送消息', 'Enter'],
      ['输入框换行', 'Shift', 'Enter'],
      ['关闭菜单或弹窗', 'Esc'],
      ['微调已聚焦的侧栏宽度', '←', '→'],
      ['恢复侧栏默认宽度', 'Home'],
    ]
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="shortcuts" />
        <div className="settings-content-column"><h2>当前快捷键</h2><section className="settings-card shortcut-list">
          {shortcuts.map(([label, ...keys]) => <div className="settings-card-row" key={label}><span className="settings-card-copy"><strong>{label}</strong></span><span className="shortcut-keys">{keys.map((key) => <kbd key={key}>{key}</kbd>)}</span></div>)}
        </section></div>
      </section>
    )
  }

  const plannedAction = (name: string) => onToast(`${name}入口已经建立，系统能力将在后续版本接入`)
  const plannedContent: Record<Exclude<SettingsSection, 'general' | 'appearance' | 'voice' | 'configuration' | 'personalization' | 'shortcuts' | 'archived'>, Array<[LucideIcon, string, string]>> = {
    'app-snapshot': [[Camera, '连续按两次 Command', '计划捕获当前应用窗口并作为本轮对话附件；当前不会监听全局键盘或截取屏幕。']],
    browser: [[ExternalLink, '受控浏览器', '计划由用户明确启动网页研究任务；当前不会读取浏览器历史或标签页。']],
    'computer-control': [[Monitor, '电脑控制', '计划复用真实 macOS 权限中心；当前不会自动点击、输入或控制其他应用。']],
    hooks: [[PlugZap, '任务钩子', '计划为检索完成、提纲完成和导出完成等阶段提供应用内触发器。']],
    connections: [[ExternalLink, '执行连接', '计划管理隔离的本机与远程执行连接，不读取系统或 Codex 的连接配置。']],
    git: [[GitBranch, 'Git 仓库', '计划让研究项目选择性连接仓库；当前不会修改任何仓库。']],
    environment: [[Database, '任务环境', '计划显示可用运行环境与显式环境变量，不读取系统敏感变量。']],
    worktrees: [[FolderOpen, '独立工作树', '计划为并行任务创建受控工作树；当前不会创建或删除目录。']],
  }
  const plannedItems = plannedContent[section]
  return (
    <section className="settings-hub-page">
      <SettingsSectionHeader section={section} />
      <div className="settings-content-column">
        {section === 'app-snapshot' && <div className="snapshot-shortcut-preview" aria-label="连续按两次 Command"><kbd>⌘</kbd><span>再按一次</span><kbd>⌘</kbd></div>}
        <h2>{['appearance', 'voice'].includes(section) ? '设置' : '能力'}</h2>
        <section className="settings-card">
          {plannedItems.map(([Icon, title, description]) => (
            <PlannedSetting key={title} icon={Icon} title={title} description={description} actionLabel="查看状态" onAction={() => plannedAction(title)} />
          ))}
        </section>
        <div className="settings-boundary-note"><CircleAlert size={16} /><span>这是可操作的设置入口，不代表系统能力已经启用。接入完成前，应用不会静默申请权限或执行相关操作。</span></div>
      </div>
    </section>
  )
}
