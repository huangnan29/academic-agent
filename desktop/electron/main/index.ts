import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu } from 'electron'
import { ChatCoordinator } from './chatCoordinator'
import { ConfigurationService } from './configuration'
import { ExportCoordinator } from './exportCoordinator'
import { registerIpcHandlers } from './ipcHandlers'
import { PaperCoordinator } from './paperCoordinator'
import { createMainWindow } from './window'
import { LiteratureService } from '../services/literature'
import { McpManager } from '../services/mcp'
import { CredentialStore } from '../services/storage/credentialStore'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

let mainWindow: BrowserWindow | null = null
let chatCoordinator: ChatCoordinator | null = null
let mcpManager: McpManager | null = null
let cleanupStarted = false
let cleanupCompleted = false

// 内部名称决定 macOS safeStorage 的钥匙串服务名；为了兼容旧版已保存凭证，此处不改名。
app.setName('AIWritePaper Agent')

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

if (hasLock) void startApplication()

async function startApplication(): Promise<void> {
  await app.whenReady()
  try {
    const userDataPath = app.getPath('userData')
    const repository = new WorkspaceRepository(join(userDataPath, 'workspace.json'))
    const credentials = new CredentialStore(join(userDataPath, 'credentials.json'))
    await Promise.all([repository.initialize(), credentials.initialize()])

    const configuration = new ConfigurationService(repository, credentials)
    chatCoordinator = new ChatCoordinator(repository, configuration)
    const paperCoordinator = new PaperCoordinator(repository, configuration)
    const exporter = new ExportCoordinator(repository)
    const literature = new LiteratureService({ timeoutMs: 18_000 })
    mcpManager = new McpManager([], { requestTimeoutMs: 15_000, maxListPages: 20 })

    const dependencies = {
      rendererWebContentsId: 0,
      repository,
      configuration,
      chat: chatCoordinator,
      paper: paperCoordinator,
      exporter,
      literature,
      async testMcp(server: Parameters<typeof prepareMcpManager>[1]) {
        if (!mcpManager) throw new Error('MCP 管理器尚未初始化。')
        await prepareMcpManager(mcpManager, { ...server, enabled: true })
        const tested = await mcpManager.test(server.id)
        return { tools: tested.tools, resources: tested.resources }
      },
      async callMcpTool(
        server: Parameters<typeof prepareMcpManager>[1],
        name: string,
        args: Record<string, unknown>,
      ) {
        if (!mcpManager) throw new Error('MCP 管理器尚未初始化。')
        await prepareMcpManager(mcpManager, server)
        return mcpManager.callTool(server.id, name, args)
      },
      async readMcpResource(server: Parameters<typeof prepareMcpManager>[1], uri: string) {
        if (!mcpManager) throw new Error('MCP 管理器尚未初始化。')
        await prepareMcpManager(mcpManager, server)
        return mcpManager.readResource(server.id, uri)
      },
      async disconnectMcp(serverId: string) {
        if (!mcpManager) return
        await mcpManager.deleteConfig(serverId)
      },
    }

    const openWindow = () => {
      const createdWindow = createMainWindow()
      mainWindow = createdWindow
      dependencies.rendererWebContentsId = createdWindow.webContents.id
      registerIpcHandlers(dependencies)
      createdWindow.on('closed', () => {
        mainWindow = null
      })
    }

    app.setAboutPanelOptions({
      applicationName: '学术 Agent',
      applicationVersion: app.getVersion(),
      copyright: '© 2026 学术 Agent Contributors',
    })
    installApplicationMenu()
    openWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知初始化错误'
    dialog.showErrorBox('学术 Agent 无法启动', message.slice(0, 1_000))
    app.quit()
  }
}

app.on('before-quit', (event) => {
  if (cleanupCompleted) return
  event.preventDefault()
  if (cleanupStarted) return
  cleanupStarted = true
  chatCoordinator?.cancelAll()
  void (mcpManager?.disconnectAll() ?? Promise.resolve())
    .catch(() => undefined)
    .finally(() => {
      cleanupCompleted = true
      app.quit()
    })
})

async function prepareMcpManager(manager: McpManager, server: Parameters<McpManager['saveConfig']>[0] & { id: string }): Promise<void> {
  await manager.saveConfig({
    id: server.id,
    name: server.name,
    transport: server.transport,
    enabled: server.enabled,
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function installApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '学术 Agent',
      submenu: [
        { role: 'about', label: '关于学术 Agent' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏学术 Agent' },
        { role: 'hideOthers', label: '隐藏其他应用' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出学术 Agent' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
