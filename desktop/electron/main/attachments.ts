import { randomUUID } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import type { ConversationAttachment, Origin, VerificationStatus } from '../../shared/contracts'

const MAX_FILES_PER_FOLDER = 20
const MAX_FILE_BYTES = 256 * 1024
const MAX_TEXT_CHARS = 600_000
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'release', '.next'])
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.yaml', '.yml', '.tex', '.html', '.htm',
  '.xml', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.sql', '.css',
])

interface AttachmentOwner {
  projectId: string
  conversationId: string
  origin: Origin
  verificationStatus: VerificationStatus
}

interface ExtractedFile {
  absolutePath: string
  relativePath: string
  text: string
  bytes: number
}

function cleanText(buffer: Buffer): string | undefined {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
  if (sample.includes(0)) return undefined
  return buffer.toString('utf8').replace(/\u0000/g, '').trim()
}

async function readSupportedFile(absolutePath: string, relativePath: string): Promise<ExtractedFile | undefined> {
  if (!TEXT_EXTENSIONS.has(extname(absolutePath).toLowerCase())) return undefined
  const metadata = await lstat(absolutePath)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_FILE_BYTES) return undefined
  const buffer = await readFile(absolutePath)
  const text = cleanText(buffer)
  if (!text) return undefined
  return { absolutePath, relativePath, text, bytes: metadata.size }
}

async function collectFolderFiles(rootPath: string): Promise<ExtractedFile[]> {
  const collected: ExtractedFile[] = []

  const visit = async (currentPath: string, depth: number): Promise<void> => {
    if (depth > 5 || collected.length >= MAX_FILES_PER_FOLDER) return
    const entries = await readdir(currentPath, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    for (const entry of entries) {
      if (collected.length >= MAX_FILES_PER_FOLDER) break
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue
      const absolutePath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath, depth + 1)
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        const file = await readSupportedFile(absolutePath, relative(rootPath, absolutePath))
        if (file) collected.push(file)
      }
    }
  }

  await visit(rootPath, 0)
  return collected
}

function joinExtractedFiles(files: ExtractedFile[]): string {
  let remaining = MAX_TEXT_CHARS
  const chunks: string[] = []
  for (const file of files) {
    if (remaining <= 0) break
    const header = `【附件文件：${file.relativePath}】\n`
    const body = file.text.slice(0, Math.max(0, remaining - header.length))
    chunks.push(`${header}${body}`)
    remaining -= header.length + body.length
  }
  return chunks.join('\n\n')
}

export async function extractConversationAttachment(
  selectedPath: string,
  owner: AttachmentOwner,
): Promise<ConversationAttachment> {
  const metadata = await lstat(selectedPath)
  const timestamp = new Date().toISOString()
  const common = {
    id: randomUUID(),
    projectId: owner.projectId,
    conversationId: owner.conversationId,
    name: basename(selectedPath),
    path: selectedPath,
    origin: owner.origin,
    verificationStatus: owner.verificationStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as const

  if (metadata.isDirectory()) {
    const files = await collectFolderFiles(selectedPath)
    return {
      ...common,
      kind: 'folder',
      extractedText: joinExtractedFiles(files),
      fileCount: files.length,
      byteCount: files.reduce((sum, file) => sum + file.bytes, 0),
      warning: files.length === 0
        ? '该文件夹中没有可读取的文本文件。'
        : files.length >= MAX_FILES_PER_FOLDER
          ? `已读取前 ${MAX_FILES_PER_FOLDER} 个文本文件。`
          : undefined,
    }
  }

  const file = await readSupportedFile(selectedPath, basename(selectedPath))
  return {
    ...common,
    kind: 'file',
    extractedText: file ? joinExtractedFiles([file]) : '',
    fileCount: file ? 1 : 0,
    byteCount: metadata.size,
    warning: file ? undefined : '当前格式、大小或编码暂不支持提取正文。',
  }
}
