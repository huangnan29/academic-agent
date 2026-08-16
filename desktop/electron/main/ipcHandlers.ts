import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  AgentRun,
  AppearanceSettings,
  ChatContextReference,
  ChatStartInput,
  LiteratureRecord,
  McpResourceReadResult,
  McpServerConfig,
  McpToolCallResult,
  SystemPermissionKind,
  WorkspaceState,
} from '../../shared/contracts'
import {
  appearancePatchFromThemeDocument,
  createAppearanceThemeDocument,
} from '../../shared/appearance'
import { IPC } from '../../shared/ipc'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../../shared/defaultMcp'
import { LiteratureService } from '../services/literature'
import { createProviderAdapter } from '../services/providers'
import {
  analyzeOutlineArchitecture,
  runOutlineQualityChecks,
  sanitizeMcpText,
} from '../services/pipeline'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'
import { ChatCoordinator, type ChatMcpToolPlan } from './chatCoordinator'
import { extractConversationAttachment } from './attachments'
import { ConfigurationService } from './configuration'
import { toUserMessage } from './errors'
import { ExportCoordinator } from './exportCoordinator'
import { PaperCoordinator } from './paperCoordinator'
import {
  chatStartSchema,
  appearanceSettingsInputSchema,
  appearanceThemeDocumentSchema,
  conversationUpdateSchema,
  literatureSearchSchema,
  literatureAddFromMessageSchema,
  literatureDeleteSchema,
  literatureSetProjectSchema,
  mcpServerInputSchema,
  outlineGenerateSchema,
  outlineSchema,
  providerInputSchema,
  researchBriefSchema,
  sectionGenerateSchema,
  sidebarPreferencesSchema,
  skillInputSchema,
} from './schemas'
import { isAllowedExternalUrl } from './window'
import { SystemPermissionService } from './systemPermissions'
import { VoiceInputService } from './voiceInput'
import { executeArxivSearchWithRetry, planArxivSearchQueries } from './arxivSearch'
import { extractMcpLiteratureCandidates } from './mcpLiterature'

export interface McpTestResult {
  tools: McpServerConfig['tools']
  resources: McpServerConfig['resources']
}

interface PreparedSlashToolInput {
  input: ChatStartInput
  argumentTextByReference: Map<string, string>
}

function prepareSlashToolReferences(
  state: WorkspaceState,
  input: ChatStartInput,
): PreparedSlashToolInput {
  const references = [...(input.contextReferences ?? [])]
  const argumentTextByReference = new Map<string, string>()
  const direct = /^\/([A-Za-z0-9_.:-]+)(?:\s+([\s\S]*))?$/.exec(input.content.trim())

  if (direct) {
    const requestedToolName = direct[1]
    const selectedMatches = references
      .filter((reference): reference is Extract<ChatContextReference, { kind: 'mcp-tool' }> => (
        reference.kind === 'mcp-tool'
        && matchesRequestedSlashTool(reference.serverId, reference.toolName, requestedToolName)
      ))
      .flatMap((reference) => {
        const server = state.mcpServers.find((item) => item.id === reference.serverId && item.enabled)
        const tool = server?.tools.find((item) => item.name === reference.toolName)
        return server && tool ? [{ server, tool }] : []
      })
    const discoveredMatches = state.mcpServers
      .filter((server) => server.enabled)
      .flatMap((server) => server.tools
        .filter((tool) => matchesRequestedSlashTool(server.id, tool.name, requestedToolName))
        .map((tool) => ({ server, tool })))
    const matches = selectedMatches.length > 0 ? [selectedMatches[selectedMatches.length - 1]] : discoveredMatches
    if (matches.length === 0) throw new Error(`没有找到已启用的 MCP 工具 /${requestedToolName}。`)
    if (matches.length > 1) throw new Error(`多个 MCP 服务提供 /${requestedToolName}，请从“/”菜单选择具体服务。`)
    const match = matches[0]
    const reference: ChatContextReference = {
      kind: 'mcp-tool',
      serverId: match.server.id,
      toolName: match.tool.name,
    }
    if (selectedMatches.length > 1) {
      for (let index = references.length - 1; index >= 0; index -= 1) {
        const item = references[index]
        if (
          item.kind === 'mcp-tool'
          && matchesRequestedSlashTool(item.serverId, item.toolName, requestedToolName)
          && referenceIdentity(item) !== referenceIdentity(reference)
        ) references.splice(index, 1)
      }
    }
    if (!references.some((item) => referenceIdentity(item) === referenceIdentity(reference))) {
      references.push(reference)
    }
    argumentTextByReference.set(referenceIdentity(reference), direct[2]?.trim() ?? '')
  }

  return {
    input: { ...input, contextReferences: references },
    argumentTextByReference,
  }
}

function buildSlashMcpPlans(
  state: WorkspaceState,
  input: ChatStartInput,
  argumentTextByReference: Map<string, string>,
  configuration: ConfigurationService,
  callTool: IpcDependencies['callMcpTool'],
): ChatMcpToolPlan[] {
  const toolReferences = (input.contextReferences ?? [])
    .filter((reference): reference is Extract<ChatContextReference, { kind: 'mcp-tool' }> => reference.kind === 'mcp-tool')
  const unique = new Map(toolReferences.map((reference) => [referenceIdentity(reference), reference]))
  if (unique.size > 3) throw new Error('单条消息最多执行 3 个 MCP 工具。')

  const plans: ChatMcpToolPlan[] = []
  for (const reference of unique.values()) {
    const server = configuration.resolvedMcpServer(reference.serverId)
    if (!server.enabled) throw new Error(`MCP 服务 ${server.name} 已停用。`)
    const tool = server.tools.find((item) => item.name === reference.toolName)
    if (!tool) throw new Error(`MCP 工具 ${reference.toolName} 不存在，请先重新测试服务。`)
    const argumentText = argumentTextByReference.get(referenceIdentity(reference)) ?? input.content.trim()
    const originalArguments = buildSlashToolArguments(server.id, tool.name, tool.inputSchema, argumentText)
    let resolvedArguments = originalArguments
    plans.push({
      serverId: server.id,
      serverName: server.name,
      toolName: tool.name,
      get arguments() {
        return resolvedArguments
      },
      async execute(signal) {
        let result: McpToolCallResult
        if (
          server.id === DEFAULT_ARXIV_MCP_SERVER_ID
          && (tool.name === 'search_papers' || tool.name === 'semantic_search')
          && typeof originalArguments.query === 'string'
        ) {
          const profile = state.providers.find((item) => item.id === input.providerId && item.enabled)
          const project = state.projects.find((item) => item.id === input.projectId)
          if (!profile) throw new Error('无法使用当前模型规划 arXiv 英文检索式。')
          const queries = await planArxivSearchQueries({
            request: originalArguments.query,
            projectTitle: project?.title,
            projectBrief: project
              ? [
                  project.brief.paperType,
                  project.brief.discipline,
                  project.brief.requirements,
                  project.brief.keywords.join('、'),
                ].filter(Boolean).join('；')
              : undefined,
            profile,
            apiKey: configuration.providerSecret(profile.id),
            model: input.model,
            signal,
          })
          const attempted = await executeArxivSearchWithRetry(
            originalArguments,
            queries,
            (arguments_) => callTool(server, tool.name, arguments_, signal),
            (arguments_) => {
              // 在真实外部调用前更新 getter，失败或取消时审计也能读取本次英文查询。
              resolvedArguments = arguments_
            },
          )
          resolvedArguments = attempted.arguments
          result = attempted.result
        } else {
          result = await callTool(server, tool.name, originalArguments, signal)
        }
        if (result.isError) {
          throw new Error(`${server.name} / ${tool.name} 返回错误：${mcpResultSummary(result)}`)
        }
        return result
      },
    })
  }
  return plans
}

function buildSlashToolArguments(
  serverId: string,
  toolName: string,
  inputSchema: Record<string, unknown> | undefined,
  argumentText: string,
): Record<string, unknown> {
  const trimmed = argumentText.trim()
  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error(`/${toolName} 后的 JSON 参数无法解析。`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`/${toolName} 的 JSON 参数必须是对象。`)
    }
    const arguments_ = parsed as Record<string, unknown>
    return serverId === DEFAULT_ARXIV_MCP_SERVER_ID && toolName === 'search_papers'
      ? validateArxivSearchArguments(arguments_)
      : arguments_
  }

  if (serverId === DEFAULT_ARXIV_MCP_SERVER_ID) {
    if (toolName === 'search_papers' || toolName === 'semantic_search') {
      if (!trimmed) throw new Error(`请在 /${toolName} 后输入检索词。`)
      return { query: trimmed, max_results: extractRequestedPaperCount(trimmed) ?? 5 }
    }
    if (toolName === 'download_paper' || toolName === 'read_paper' || toolName === 'citation_graph') {
      const paperId = extractArxivPaperId(trimmed)
      if (!paperId) throw new Error(`请在 /${toolName} 后输入 arXiv 论文 ID。`)
      return { paper_id: paperId }
    }
    if (toolName === 'get_abstract' || toolName === 'get_paper_latex' || toolName === 'list_paper_latex_sections') {
      const paperId = extractArxivPaperId(trimmed)
      if (!paperId) throw new Error(`请在 /${toolName} 后输入 arXiv 论文 ID。`)
      return { paper_id: paperId }
    }
    if (toolName === 'list_papers') return {}
    if (toolName === 'watch_topic') {
      if (!trimmed) throw new Error('请在 /watch_topic 后输入关注主题。')
      return { topic: trimmed, max_results: 10 }
    }
    if (toolName === 'check_alerts') return trimmed ? { topic: trimmed } : {}
    if (toolName === 'reindex') return {}
  }

  const properties = inputSchema?.properties
  const propertyMap = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {}
  const required = Array.isArray(inputSchema?.required)
    ? inputSchema.required.filter((item): item is string => typeof item === 'string')
    : []
  if (required.length === 0 && !trimmed) return {}
  const preferred = ['query', 'topic', 'text', 'prompt', 'paper_id']
    .find((name) => name in propertyMap && (required.length === 0 || required.includes(name)))
  const soleRequired = required.length === 1 ? required[0] : undefined
  const argumentName = preferred ?? soleRequired
  if (argumentName && trimmed) {
    return { [argumentName]: argumentName === 'paper_id' ? extractArxivPaperId(trimmed) ?? trimmed : trimmed }
  }
  throw new Error(`/${toolName} 需要结构化参数，请在命令后输入 JSON 对象。`)
}

function extractArxivPaperId(value: string): string | undefined {
  return value.match(/(?:arxiv:\s*|arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?)/i)?.[1]
}

function matchesRequestedSlashTool(serverId: string, actualName: string, requestedName: string): boolean {
  if (actualName.toLocaleLowerCase() === requestedName.toLocaleLowerCase()) return true
  return serverId === DEFAULT_ARXIV_MCP_SERVER_ID
    && requestedName.toLocaleLowerCase() === 'paper_search'
    && actualName === DEFAULT_ARXIV_MCP_TOOL_NAME
}

function extractRequestedPaperCount(value: string): number | undefined {
  const matched = /(?:搜索|检索|查找|找)?\s*(\d+)\s*篇/u.exec(value)
  if (!matched) return undefined
  return Math.min(50, Math.max(1, Number(matched[1])))
}

function validateArxivSearchArguments(arguments_: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(['query', 'max_results', 'date_from', 'date_to', 'categories', 'sort_by'])
  const unknown = Object.keys(arguments_).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`/search_papers 不支持参数 ${unknown}。`)
  if (typeof arguments_.query !== 'string' || !arguments_.query.trim()) {
    throw new Error('/search_papers 的 query 必须是非空字符串。')
  }
  if (
    arguments_.max_results !== undefined
    && (
      typeof arguments_.max_results !== 'number'
      || !Number.isInteger(arguments_.max_results)
      || arguments_.max_results < 1
      || arguments_.max_results > 50
    )
  ) throw new Error('/search_papers 的 max_results 必须是 1–50 的整数。')
  for (const field of ['date_from', 'date_to'] as const) {
    const value = arguments_[field]
    if (value !== undefined && (typeof value !== 'string' || !isValidIsoDate(value))) {
      throw new Error(`/search_papers 的 ${field} 必须使用 YYYY-MM-DD。`)
    }
  }
  if (
    arguments_.categories !== undefined
    && (!Array.isArray(arguments_.categories) || !arguments_.categories.every((item) => typeof item === 'string' && item.trim()))
  ) throw new Error('/search_papers 的 categories 必须是非空字符串数组。')
  if (arguments_.sort_by !== undefined && arguments_.sort_by !== 'relevance' && arguments_.sort_by !== 'date') {
    throw new Error('/search_papers 的 sort_by 只能是 relevance 或 date。')
  }
  return {
    ...arguments_,
    query: arguments_.query.trim(),
    max_results: arguments_.max_results ?? 5,
  }
}

function isValidIsoDate(value: string): boolean {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!matched) return false
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function referenceIdentity(reference: ChatContextReference): string {
  if (reference.kind === 'skill') return `skill:${reference.skillId}`
  if (reference.kind === 'mcp-tool') return `mcp-tool:${reference.serverId}:${reference.toolName}`
  return `mcp:${reference.serverId}`
}

function mcpResultSummary(result: McpToolCallResult): string {
  const text = result.content
    .map((item) => item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).text
      : undefined)
    .find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return sanitizeMcpText(text ?? '工具未提供详细错误').replace(/\s+/g, ' ').slice(0, 500)
}

export interface IpcDependencies {
  rendererWebContentsId: number
  repository: WorkspaceRepository
  configuration: ConfigurationService
  chat: ChatCoordinator
  paper: PaperCoordinator
  exporter: ExportCoordinator
  literature: LiteratureService
  systemPermissions: SystemPermissionService
  voiceInput: VoiceInputService
  applyAppearance(appearance: AppearanceSettings): void | Promise<void>
  testMcp(server: McpServerConfig): Promise<McpTestResult>
  callMcpTool(
    server: McpServerConfig,
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult>
  readMcpResource(server: McpServerConfig, uri: string): Promise<McpResourceReadResult>
  disconnectMcp(serverId: string): Promise<void>
}

let trustedRendererWebContentsId: number | undefined

export function registerIpcHandlers(dependencies: IpcDependencies): void {
  const { repository, configuration, chat, paper, exporter, literature } = dependencies
  trustedRendererWebContentsId = dependencies.rendererWebContentsId

  handle(IPC.workspaceGet, () => repository.snapshot())

  handle(IPC.workspaceSetActiveModel, async (_event, providerId: unknown, model: unknown) => {
    assertId(providerId, '模型服务')
    assertId(model, '模型')
    return repository.setActiveModel(providerId, model)
  })

  handle(IPC.workspaceSetSidebarPreferences, async (_event, payload: unknown) => {
    return repository.setSidebarPreferences(sidebarPreferencesSchema.parse(payload))
  })

  handle(IPC.appearanceUpdate, async (_event, payload: unknown) => {
    const next = await repository.setAppearance(appearanceSettingsInputSchema.parse(payload))
    await dependencies.applyAppearance(next.settings.appearance)
    return next
  })

  handle(IPC.appearanceImportTheme, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '导入外观主题',
      buttonLabel: '导入',
      filters: [{ name: '学术 Agent 主题', extensions: ['json'] }],
      properties: ['openFile'],
      message: '仅导入由学术 Agent 复制的版本化 JSON 外观主题。',
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return repository.snapshot()

    const selectedPath = result.filePaths[0]
    const metadata = await stat(selectedPath)
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 64 * 1024) {
      throw new Error('主题文件必须是小于 64 KB 的非空 JSON 文件。')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(selectedPath, 'utf8'))
    } catch {
      throw new Error('主题文件不是有效的 JSON。')
    }
    const document = appearanceThemeDocumentSchema.parse(parsed)
    const next = await repository.setAppearance(appearancePatchFromThemeDocument(document))
    await dependencies.applyAppearance(next.settings.appearance)
    return next
  })

  handle(IPC.appearanceCopyTheme, () => {
    const document = createAppearanceThemeDocument(repository.snapshot().settings.appearance)
    const serialized = `${JSON.stringify(document, null, 2)}\n`
    clipboard.writeText(serialized)
    return serialized
  })

  handle(IPC.projectCreate, async (_event, payload) => {
    const brief = researchBriefSchema.parse(payload)
    const project = await repository.createProject(brief)
    const rootPath =
      repository.snapshot().settings.researchRootPath ??
      join(app.getPath('documents'), '学术 Agent')
    const folderPath = join(
      rootPath,
      `${safeResearchFolderName(project.title)}-${project.id.slice(0, 8)}`,
    )
    try {
      await mkdir(folderPath, { recursive: true })
      const next = await repository.setProjectResearchFolder(project.id, folderPath)
      return next.projects.find((item) => item.id === project.id) ?? project
    } catch {
      // 目录不可写时不应让已创建的研究项目丢失，导出时仍可由用户选择位置。
      return project
    }
  })

  handle(IPC.projectSetActive, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.setActiveProject(projectId)
  })

  handle(IPC.projectSetPinned, async (_event, projectId: unknown, pinned: unknown) => {
    assertId(projectId, '项目')
    if (typeof pinned !== 'boolean') throw new Error('项目置顶状态无效。')
    return repository.setProjectPinned(projectId, pinned)
  })

  handle(IPC.projectDelete, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.deleteProject(projectId)
  })

  handle(IPC.projectChooseFolder, async (event) => {
    const currentRoot = repository.snapshot().settings.researchRootPath
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '设置默认研究文件夹',
      buttonLabel: '使用此文件夹',
      defaultPath: currentRoot ?? join(app.getPath('documents'), '学术 Agent'),
      properties: ['openDirectory', 'createDirectory'],
      message: '今后新建的研究将保存在此位置，现有项目不会被搬移。',
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return repository.snapshot()
    return repository.setResearchRootPath(result.filePaths[0])
  })

  handle(IPC.projectRevealFolder, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    const project = repository.snapshot().projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在或已经被移除。')
    let folderPath = project.researchFolderPath
    if (!folderPath) {
      const rootPath =
        repository.snapshot().settings.researchRootPath ??
        join(app.getPath('documents'), '学术 Agent')
      folderPath = join(
        rootPath,
        `${safeResearchFolderName(project.title)}-${project.id.slice(0, 8)}`,
      )
      try {
        await mkdir(folderPath, { recursive: true })
        await repository.setProjectResearchFolder(project.id, folderPath)
      } catch {
        throw new Error('无法在默认位置建立研究文件夹，请先设置一个可写目录。')
      }
    }
    try {
      const metadata = await stat(folderPath)
      if (!metadata.isDirectory()) throw new Error('研究文件夹路径不是目录。')
    } catch {
      throw new Error('研究文件夹已移动或当前无法访问。')
    }
    shell.showItemInFolder(folderPath)
  })

  handle(IPC.conversationCreate, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.createConversation(projectId)
  })

  handle(
    IPC.conversationSetActive,
    async (_event, projectId: unknown, conversationId: unknown) => {
      assertId(projectId, '项目')
      assertId(conversationId, '对话')
      return repository.setActiveConversation(projectId, conversationId)
    },
  )

  handle(IPC.conversationUpdate, async (_event, payload: unknown) => {
    const input = conversationUpdateSchema.parse(payload)
    if (input.accessMode === 'full') {
      const permissions = await dependencies.systemPermissions.snapshot()
      if (!permissions.fullAccessReady) {
        throw new Error('尚未完成 macOS 辅助功能与完全磁盘访问授权。')
      }
    }
    return repository.updateConversation(input)
  })

  handle(IPC.systemPermissionsGet, () => dependencies.systemPermissions.snapshot())

  handle(IPC.systemPermissionsRequestFullAccess, () =>
    dependencies.systemPermissions.requestFullAccess(),
  )

  handle(IPC.systemPermissionsRequestMicrophone, () =>
    dependencies.systemPermissions.requestMicrophone(),
  )

  handle(IPC.systemPermissionsOpenSettings, async (_event, kind: unknown) => {
    if (!isSystemPermissionKind(kind)) throw new Error('系统权限类型无效。')
    await dependencies.systemPermissions.openSettings(kind)
  })

  handle(IPC.voiceInputStatus, () => dependencies.voiceInput.status())

  handle(IPC.voiceInputStart, async (event) => {
    const permissions = await dependencies.systemPermissions.snapshot()
    if (permissions.microphone !== 'granted') {
      throw new Error('macOS 尚未允许学术 Agent 使用麦克风，请先完成系统授权。')
    }
    return dependencies.voiceInput.start(event.sender)
  })

  handle(IPC.voiceInputStop, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 100) {
      throw new Error('语音识别会话无效。')
    }
    await dependencies.voiceInput.stop(sessionId)
  })

  handle(
    IPC.conversationMove,
    async (_event, conversationId: unknown, targetProjectId: unknown) => {
      assertId(conversationId, '对话')
      assertId(targetProjectId, '目标研究')
      return repository.moveConversation(conversationId, targetProjectId)
    },
  )

  handle(IPC.conversationCopyId, async (_event, conversationId: unknown) => {
    assertId(conversationId, '对话')
    const conversation = repository.snapshot().conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('对话不存在或已经被移除。')
    clipboard.writeText(conversation.id)
  })

  handle(IPC.conversationChooseAttachments, async (event, conversationId: unknown) => {
    assertId(conversationId, '对话')
    const snapshot = repository.snapshot()
    const conversation = snapshot.conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('对话不存在或已经被移除。')
    const project = snapshot.projects.find((item) => item.id === conversation.projectId)
    if (!project) throw new Error('对话所属研究不存在。')
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '添加到当前对话',
      buttonLabel: '添加',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      message: '文本文件会在本机提取内容并加入当前对话上下文。',
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return snapshot
    if (result.filePaths.length > 10) throw new Error('每次最多添加 10 个文件或文件夹。')
    const attachments = await Promise.all(
      result.filePaths.map((selectedPath) => extractConversationAttachment(selectedPath, {
        projectId: project.id,
        conversationId: conversation.id,
        origin: project.origin,
        verificationStatus: project.verificationStatus,
      })),
    )
    return repository.addConversationAttachments(conversation.id, attachments)
  })

  handle(IPC.conversationRemoveAttachment, async (_event, attachmentId: unknown) => {
    assertId(attachmentId, '附件')
    return repository.removeConversationAttachment(attachmentId)
  })

  handle(IPC.providerSave, async (_event, payload) => {
    const input = providerInputSchema.parse(payload)
    return configuration.saveProvider(input)
  })

  handle(IPC.providerDelete, async (_event, providerId: unknown) => {
    assertId(providerId, '模型服务')
    await configuration.deleteProvider(providerId)
  })

  handle(IPC.providerTest, async (_event, providerId: unknown) => {
    assertId(providerId, '模型服务')
    const profile = repository.getProvider(providerId)
    if (!profile) throw new Error('模型服务不存在。')
    await repository.updateProviderHealth(providerId, 'checking')
    const adapter = createProviderAdapter(profile, configuration.providerSecret(providerId), {
      requestTimeoutMs: 15_000,
    })
    const result = await adapter.testConnection()
    await repository.updateProviderHealth(
      providerId,
      result.ok ? 'connected' : 'failed',
      result.ok ? undefined : result.message,
      result.models,
    )
    return { ok: result.ok, message: result.message, models: result.models }
  })

  handle(IPC.literatureSearch, async (_event, payload) => {
    const input = literatureSearchSchema.parse(payload)
    const run = input.projectId
      ? createRun(input.projectId, 'research', '检索公开文献', `正在检索“${input.query}”`)
      : undefined
    if (run) await repository.saveRun(run)
    try {
      const records = input.mcp
        ? await searchLiteratureWithMcp(dependencies, configuration, input)
        : await literature.search(input)
      const saved = await repository.addLiterature(records, input.projectId)
      if (run) {
        await repository.updateRun(run.id, {
          status: 'completed',
          verificationStatus: 'verified-metadata',
          steps: [{
            ...run.steps[0],
            detail: `${input.mcp ? 'MCP 文献工具' : 'OpenAlex / Crossref'} 返回并归一化后共 ${saved.length} 条记录`,
            status: 'completed',
            completedAt: new Date().toISOString(),
          }],
        })
      }
      return saved
    } catch (error) {
      if (run) {
        const message = toUserMessage(error, '公开文献检索失败。')
        await repository.updateRun(run.id, {
          status: 'error',
          error: message,
          steps: [{
            ...run.steps[0],
            detail: message,
            status: 'error',
            completedAt: new Date().toISOString(),
          }],
        })
      }
      throw error
    }
  })

  handle(
    IPC.literatureToggle,
    async (_event, projectId: unknown, literatureId: unknown, included: unknown) => {
      assertId(projectId, '项目')
      assertId(literatureId, '文献')
      if (typeof included !== 'boolean') throw new Error('文献选择状态无效。')
      return repository.toggleLiterature(projectId, literatureId, included)
    },
  )

  handle(IPC.literatureAddFromMessage, async (_event, payload) => {
    const input = literatureAddFromMessageSchema.parse(payload)
    return repository.addLiteratureFromMessage(input.messageId, input.candidateIds)
  })

  handle(IPC.literatureSetProject, async (_event, payload) => {
    const input = literatureSetProjectSchema.parse(payload)
    return repository.setLiteratureProject(
      input.literatureId,
      input.sourceProjectId,
      input.targetProjectId,
    )
  })

  handle(IPC.literatureDelete, async (_event, payload) => {
    const input = literatureDeleteSchema.parse(payload)
    return repository.deleteLiterature(input.literatureId, input.sourceProjectId)
  })

  handle(IPC.outlineGenerate, async (_event, payload) => {
    return paper.generateOutline(outlineGenerateSchema.parse(payload))
  })

  handle(IPC.outlineSave, async (_event, projectId: unknown, payload: unknown) => {
    assertId(projectId, '项目')
    const outline = outlineSchema.parse(payload)
    assertOutlineBounds(outline)
    const state = repository.snapshot()
    const project = state.projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在或已经被移除。')
    const projectLiterature = state.literature.filter(
      (item) => item.projectId === projectId && item.included && item.origin !== 'demo',
    )
    const allowedCitationIds = new Set(
      projectLiterature.map((item) => item.id),
    )
    const sanitized = outline.map((node) => sanitizeOutlineNode(node, allowedCitationIds))
    const architecture = state.outlineArchitectures?.[projectId] ?? {
      ...analyzeOutlineArchitecture(project.brief, projectLiterature),
      projectId,
    }
    const quality = runOutlineQualityChecks(sanitized, {
      brief: project.brief,
      architecture,
      allowedCitationIds,
    })
    await repository.saveOutline(projectId, sanitized, architecture, quality)
    await repository.createSectionsFromOutline(projectId, sanitized)
    return sanitized
  })

  handle(IPC.sectionGenerate, async (event, payload) => {
    await paper.generateSection(sectionGenerateSchema.parse(payload), event.sender)
  })

  handle(IPC.sectionSave, async (_event, sectionId: unknown, content: unknown) => {
    assertId(sectionId, '章节')
    if (typeof content !== 'string' || content.length > 2_000_000) {
      throw new Error('章节内容无效或过长。')
    }
    await repository.saveSection(sectionId, content)
  })

  handle(IPC.sectionSetActive, async (_event, sectionId: unknown) => {
    assertId(sectionId, '章节')
    return repository.setActiveSection(sectionId)
  })

  handle(IPC.sectionSelectVersion, async (_event, sectionId: unknown, versionId: unknown) => {
    assertId(sectionId, '章节')
    assertId(versionId, '章节版本')
    return repository.selectSectionVersion(sectionId, versionId)
  })

  handle(IPC.chatStart, async (event, payload) => {
    const parsed = chatStartSchema.parse(payload)
    const prepared = prepareSlashToolReferences(repository.snapshot(), parsed)
    const mcpPlans = buildSlashMcpPlans(
      repository.snapshot(),
      prepared.input,
      prepared.argumentTextByReference,
      configuration,
      dependencies.callMcpTool,
    )
    return chat.start(prepared.input, event.sender, mcpPlans)
  })

  handle(IPC.chatCancel, async (_event, runId: unknown) => {
    assertId(runId, '运行任务')
    chat.cancel(runId)
  })

  handle(IPC.mcpSave, async (_event, payload) => {
    return configuration.saveMcpServer(mcpServerInputSchema.parse(payload))
  })

  handle(IPC.mcpDelete, async (_event, serverId: unknown) => {
    assertId(serverId, 'MCP 服务')
    await dependencies.disconnectMcp(serverId)
    await configuration.deleteMcpServer(serverId)
  })

  handle(IPC.mcpTest, async (_event, serverId: unknown) => {
    assertId(serverId, 'MCP 服务')
    const stored = repository.getMcpServer(serverId)
    if (!stored) throw new Error('MCP 服务不存在。')
    await repository.saveMcpServer({
      ...stored,
      status: 'connecting',
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    })
    try {
      const result = await dependencies.testMcp(configuration.resolvedMcpServer(serverId))
      return repository.saveMcpServer({
        ...stored,
        // test() 是一次性探测，完成后没有常驻连接。
        status: 'disconnected',
        tools: result.tools,
        resources: result.resources,
        lastError: undefined,
        verificationStatus: 'verified-metadata',
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      const message = toUserMessage(error, 'MCP 服务连接失败。')
      await repository.saveMcpServer({
        ...stored,
        status: 'failed',
        lastError: message,
        updatedAt: new Date().toISOString(),
      })
      throw new Error(message)
    }
  })

  handle(IPC.mcpCallTool, async (_event, serverId: unknown, name: unknown, args: unknown) => {
    assertId(serverId, 'MCP 服务')
    if (typeof name !== 'string' || !name.trim() || name.length > 256) {
      throw new Error('MCP 工具名称无效。')
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('MCP 工具参数必须是 JSON 对象。')
    }
    return dependencies.callMcpTool(
      configuration.resolvedMcpServer(serverId),
      name.trim(),
      args as Record<string, unknown>,
    )
  })

  handle(IPC.mcpReadResource, async (_event, serverId: unknown, uri: unknown) => {
    assertId(serverId, 'MCP 服务')
    if (typeof uri !== 'string' || !uri.trim() || uri.length > 8_192) {
      throw new Error('MCP 资源 URI 无效。')
    }
    return dependencies.readMcpResource(
      configuration.resolvedMcpServer(serverId),
      uri.trim(),
    )
  })

  handle(IPC.skillSave, async (_event, payload) => {
    return repository.saveSkill(skillInputSchema.parse(payload))
  })

  handle(IPC.skillDelete, async (_event, skillId: unknown) => {
    assertId(skillId, 'Skill')
    await repository.deleteSkill(skillId)
  })

  handle(IPC.exportProject, async (event, projectId: unknown, format: unknown) => {
    assertId(projectId, '项目')
    if (format !== 'md' && format !== 'docx') throw new Error('不支持该导出格式。')
    return exporter.exportProject(
      projectId,
      format,
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
    )
  })

  handle(IPC.artifactReveal, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('文件路径无效。')
    exporter.reveal(path)
  })

  handle(IPC.externalOpen, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
      throw new Error('外部链接无效。')
    }
    await shell.openExternal(url)
  })

  handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
  }))
}

async function searchLiteratureWithMcp(
  dependencies: IpcDependencies,
  configuration: ConfigurationService,
  input: ReturnType<typeof literatureSearchSchema.parse>,
): Promise<LiteratureRecord[]> {
  if (!input.mcp) return []
  const server = configuration.resolvedMcpServer(input.mcp.serverId)
  if (!server.enabled) throw new Error('所选 MCP 服务尚未启用。')
  const resultLimit = Math.min(20, Math.max(1, input.limit ?? 20))
  const isBuiltInArxivSearch = server.id === DEFAULT_ARXIV_MCP_SERVER_ID
    && input.mcp.toolName === DEFAULT_ARXIV_MCP_TOOL_NAME
  const result = await dependencies.callMcpTool(
    server,
    input.mcp.toolName,
    {
      [input.mcp.queryArgument ?? 'query']: input.query,
      // arXiv MCP 使用 max_results；其他通用文献 MCP 延续 limit 参数。
      [isBuiltInArxivSearch ? 'max_results' : 'limit']: resultLimit,
    },
  )
  const candidates = extractMcpLiteratureCandidates(result)
  if (candidates.length === 0) {
    throw new Error('MCP 工具未返回可识别的文献记录。')
  }
  const timestamp = new Date().toISOString()
  return candidates.slice(0, input.limit ?? 20).map((candidate) => ({
    id: randomUUID(),
    projectId: input.projectId,
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    venue: candidate.venue,
    abstract: candidate.abstract,
    doi: candidate.doi,
    url: candidate.url,
    source: 'mcp',
    included: false,
    origin: 'live',
    // 第三方工具返回值仍需用户复核，不能冒充元数据已经核验。
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim()
}

function handle(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrustedIpcSender(event)) throw new Error('已拒绝非受信页面的应用请求。')
      return await listener(event, ...args)
    } catch (error) {
      throw new Error(toUserMessage(error))
    }
  })
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  if (!trustedRendererWebContentsId || event.sender.id !== trustedRendererWebContentsId) return false
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame) return false
  try {
    const url = new URL(frame.url)
    if (app.isPackaged) {
      return url.protocol === 'file:' && decodeURIComponent(url.pathname).endsWith('/dist/index.html')
    }
    const configured = process.env.ELECTRON_RENDERER_URL
    return Boolean(configured && url.origin === new URL(configured).origin)
  } catch {
    return false
  }
}

function createRun(
  projectId: string,
  kind: AgentRun['kind'],
  label: string,
  detail: string,
): AgentRun {
  const timestamp = new Date().toISOString()
  return {
    id: randomUUID(),
    projectId,
    kind,
    status: 'running',
    steps: [{ id: randomUUID(), label, detail, status: 'running', startedAt: timestamp }],
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`${label}标识无效。`)
  }
}

function isSystemPermissionKind(value: unknown): value is SystemPermissionKind {
  return (
    value === 'accessibility' ||
    value === 'full-disk-access' ||
    value === 'screen-recording' ||
    value === 'microphone'
  )
}

function safeResearchFolderName(title: string): string {
  const normalized = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 72)
  return normalized || '未命名研究'
}

function assertOutlineBounds(outline: import('../../shared/contracts').OutlineNode[]): void {
  let count = 0
  const visit = (nodes: import('../../shared/contracts').OutlineNode[], depth: number) => {
    // 三级叶节点的空 children 会以 depth=4 进入；只有实际存在第四级节点才应拒绝。
    if (nodes.length > 0 && depth > 3) throw new Error('提纲最多支持三级层级。')
    for (const node of nodes) {
      count += 1
      if (count > 160) throw new Error('提纲节点数量超过安全上限。')
      visit(node.children, depth + 1)
    }
  }
  visit(outline, 1)
}

function sanitizeOutlineNode(
  node: import('../../shared/contracts').OutlineNode,
  allowedCitationIds: Set<string>,
): import('../../shared/contracts').OutlineNode {
  return {
    ...node,
    citationIds: node.citationIds.filter((id) => allowedCitationIds.has(id)),
    children: node.children.map((child) => sanitizeOutlineNode(child, allowedCitationIds)),
  }
}
