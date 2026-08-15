import { z } from 'zod'
import { SKILL_LIMITS, type OutlineNode } from '../../shared/contracts'
import { DEFAULT_ARXIV_MCP_SERVER_ID } from '../../shared/defaultMcp'

const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, '只允许 HTTP 或 HTTPS 地址。')

const secureServiceUrl = httpUrl.refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' || isLoopbackHost(url.hostname)
}, '远程服务必须使用 HTTPS；HTTP 只允许本机回环地址。')

export const researchBriefSchema = z.object({
  title: z.string().trim().min(2).max(200),
  paperType: z.string().trim().min(1).max(80),
  discipline: z.string().trim().min(1).max(80),
  language: z.enum(['zh-CN', 'en']),
  targetWords: z.number().int().min(1000).max(100000),
  requirements: z.string().trim().max(5000),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20),
})

export const sidebarPreferencesSchema = z.object({
  viewMode: z.enum(['projects', 'list']).optional(),
  chatSort: z.enum(['priority', 'recent', 'manual']).optional(),
  expandedProjectIds: z.array(z.string().min(1).max(200)).max(10_000).optional(),
  showArchived: z.boolean().optional(),
  sidebarWidth: z.number().int().min(240).max(520).optional(),
  rightPanelWidth: z.number().int().min(320).max(620).optional(),
  projectOrder: z.array(z.string().min(1).max(200)).max(10_000).optional(),
  conversationOrder: z.array(z.string().min(1).max(200)).max(50_000).optional(),
}).strict()

const appearanceColorSchema = z.string().regex(
  /^#[0-9a-f]{6}$/i,
  '颜色必须使用 #RRGGBB 格式。',
).transform((value) => value.toLowerCase())

const appearancePaletteSchema = z.object({
  accent: appearanceColorSchema,
  background: appearanceColorSchema,
  foreground: appearanceColorSchema,
}).strict()

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  palettes: z.object({
    light: appearancePaletteSchema,
    dark: appearancePaletteSchema,
  }).strict(),
  uiFont: z.enum(['system', 'inter', 'serif', 'monospace']),
  translucentSidebar: z.boolean(),
  contrast: z.number().int().min(0).max(100),
  pointerCursor: z.boolean(),
  dockIcon: z.enum(['academic', 'assistant']),
  reducedMotion: z.enum(['system', 'on', 'off']),
  uiFontSize: z.number().int().min(12).max(20),
  diffStyle: z.enum(['color', 'symbol']),
  fontSmoothing: z.boolean(),
}).strict()

export const appearanceSettingsInputSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  palettes: z.object({
    light: appearancePaletteSchema.partial().strict().optional(),
    dark: appearancePaletteSchema.partial().strict().optional(),
  }).strict().optional(),
  uiFont: z.enum(['system', 'inter', 'serif', 'monospace']).optional(),
  translucentSidebar: z.boolean().optional(),
  contrast: z.number().int().min(0).max(100).optional(),
  pointerCursor: z.boolean().optional(),
  dockIcon: z.enum(['academic', 'assistant']).optional(),
  reducedMotion: z.enum(['system', 'on', 'off']).optional(),
  uiFontSize: z.number().int().min(12).max(20).optional(),
  diffStyle: z.enum(['color', 'symbol']).optional(),
  fontSmoothing: z.boolean().optional(),
}).strict()

/** 导入文件只接受应用自己复制出的版本化外观文档。 */
export const appearanceThemeDocumentSchema = z.object({
  version: z.literal(1),
  presetName: z.string().trim().min(1).max(80).optional(),
  palettes: z.object({
    light: appearancePaletteSchema,
    dark: appearancePaletteSchema,
  }).strict(),
  uiFont: z.enum(['system', 'inter', 'serif', 'monospace']),
  translucentSidebar: z.boolean(),
  contrast: z.number().int().min(0).max(100),
}).strict()

export const conversationUpdateSchema = z.object({
  conversationId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  unread: z.boolean().optional(),
  goal: z.string().trim().max(2000).optional(),
  planMode: z.boolean().optional(),
  accessMode: z.enum(['ask', 'full']).optional(),
}).strict()

export const providerInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  protocol: z.enum(['openai-compatible', 'anthropic']),
  baseUrl: secureServiceUrl,
  apiKey: z.string().trim().max(1000).optional(),
  models: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  defaultModel: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
})

export const literatureSearchSchema = z.object({
  projectId: z.string().optional(),
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(50).optional(),
  mcp: z.object({
    serverId: z.string().min(1).max(200),
    toolName: z.string().trim().min(1).max(256),
    queryArgument: z.string().trim().min(1).max(100).optional(),
  }).optional(),
})

const stdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().trim().min(1).max(1000),
  args: z.array(z.string().max(2000)).max(100),
  cwd: z.string().trim().max(2000).optional(),
  env: z.record(z.string().max(5000)).optional(),
})

const httpTransportSchema = z.object({
  type: z.literal('streamable-http'),
  url: secureServiceUrl,
  headers: z.record(z.string().max(5000)).optional(),
})

export const mcpServerInputSchema = z.object({
  // 用户添加的 MCP 使用 UUID；内置 arXiv MCP 使用稳定 ID，便于旧工作区升级与默认来源引用。
  id: z.union([z.string().uuid(), z.literal(DEFAULT_ARXIV_MCP_SERVER_ID)]).optional(),
  name: z.string().trim().min(1).max(100),
  transport: z.discriminatedUnion('type', [stdioTransportSchema, httpTransportSchema]),
  enabled: z.boolean(),
})

const skillTextSchema = (minChars: number, maxChars: number) =>
  z.string().trim().min(minChars).max(maxChars)
    .refine((value) => !value.includes('\u0000'), '文本包含无效字符。')

/** Skill 仅接受文本字段，不允许携带路径、命令或其他运行配置。 */
export const skillInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: skillTextSchema(1, SKILL_LIMITS.name),
  description: skillTextSchema(0, SKILL_LIMITS.description),
  instructions: skillTextSchema(1, SKILL_LIMITS.instructions),
  enabled: z.boolean(),
}).strict()

export const chatStartSchema = z.object({
  projectId: z.string().min(1),
  conversationId: z.string().min(1),
  content: z.string().trim().min(1).max(100000),
  providerId: z.string().min(1),
  model: z.string().trim().min(1).max(200),
  contextScope: z.enum(['project', 'manuscript', 'section', 'selection']),
  selectedText: z.string().max(100000).optional(),
  contextReferences: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('skill'), skillId: z.string().min(1).max(200) }).strict(),
    z.object({ kind: z.literal('mcp'), serverId: z.string().min(1).max(200) }).strict(),
    z.object({
      kind: z.literal('mcp-tool'),
      serverId: z.string().min(1).max(200),
      toolName: z.string().trim().min(1).max(256),
    }).strict(),
  ])).max(12).optional(),
}).strict()

export const literatureAddFromMessageSchema = z.object({
  messageId: z.string().min(1).max(200),
  candidateIds: z.array(z.string().min(1).max(200)).min(1).max(50),
}).strict()

export const literatureSetProjectSchema = z.object({
  literatureId: z.string().min(1).max(200),
  sourceProjectId: z.string().min(1).max(200).nullable().optional(),
  targetProjectId: z.string().min(1).max(200).optional(),
}).strict()

export const literatureDeleteSchema = z.object({
  literatureId: z.string().min(1).max(200),
  sourceProjectId: z.string().min(1).max(200).nullable().optional(),
}).strict()

export const outlineGenerateSchema = z.object({
  projectId: z.string().min(1),
  providerId: z.string().min(1),
  model: z.string().trim().min(1),
})

export const sectionGenerateSchema = z.object({
  projectId: z.string().min(1),
  sectionId: z.string().min(1),
  providerId: z.string().min(1),
  model: z.string().trim().min(1),
})

export const outlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    objective: z.string().trim().max(3000),
    targetWords: z.number().int().min(100).max(100000),
    citationIds: z.array(z.string().min(1).max(200)).max(100),
    children: z.array(outlineNodeSchema).max(100),
  }),
)

export const outlineSchema = z.array(outlineNodeSchema).max(100)

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return value === 'localhost' || value.endsWith('.localhost') || value === '::1' || /^127(?:\.\d{1,3}){3}$/.test(value)
}
