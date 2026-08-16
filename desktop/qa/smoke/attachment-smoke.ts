import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { extractConversationAttachment } from '../../electron/main/attachments'

const root = await mkdtemp(join(tmpdir(), 'academic-agent-attachment-'))
const folder = join(root, '研究资料')
await mkdir(folder)
await writeFile(join(folder, '笔记.md'), '# 研究笔记\n\n这是用户主动添加的本机文本。', 'utf8')
await writeFile(join(folder, '数据.json'), '{"sample": 12}', 'utf8')

const attachment = await extractConversationAttachment(folder, {
  projectId: 'project-smoke',
  conversationId: 'conversation-smoke',
  origin: 'live',
  verificationStatus: 'unverified',
})

if (
  attachment.kind !== 'folder' ||
  attachment.fileCount !== 2 ||
  !attachment.extractedText.includes('研究笔记') ||
  !attachment.extractedText.includes('"sample": 12')
) {
  throw new Error('附件文件夹提取结果不符合预期。')
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  kind: attachment.kind,
  fileCount: attachment.fileCount,
  byteCount: attachment.byteCount,
  containsMarkdown: attachment.extractedText.includes('研究笔记'),
  containsJson: attachment.extractedText.includes('"sample": 12'),
}, null, 2)}\n`)
