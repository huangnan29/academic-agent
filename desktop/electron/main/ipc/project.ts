import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { IPC } from '../../../shared/ipc'
import { researchBriefSchema } from '../schemas'
import { assertId, safeResearchFolderName } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerProjectHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository } = dependencies

  register(IPC.projectCreate, async (_event, payload: unknown) => {
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

  register(IPC.projectSetActive, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.setActiveProject(projectId)
  })

  register(IPC.projectSetPinned, async (_event, projectId: unknown, pinned: unknown) => {
    assertId(projectId, '项目')
    if (typeof pinned !== 'boolean') throw new Error('项目置顶状态无效。')
    return repository.setProjectPinned(projectId, pinned)
  })

  register(IPC.projectDelete, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.deleteProject(projectId)
  })

  register(IPC.projectChooseFolder, async (event) => {
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

  register(IPC.projectRevealFolder, async (_event, projectId: unknown) => {
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
}
