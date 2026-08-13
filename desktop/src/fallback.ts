import type {
  AgentRun,
  ChatMessage,
  ChatStreamEvent,
  Conversation,
  LiteratureRecord,
  ManuscriptSection,
  OutlineNode,
  Project,
  ProviderProfile,
  SkillDefinition,
  SkillInput,
  WorkspaceState,
} from '../shared/contracts'
import { SKILL_LIMITS } from '../shared/contracts'
import {
  saveSectionContentInState,
  synchronizeDerivedSections,
} from '../shared/sectionContent'

type PaperAgentApi = Window['paperAgent']

const STORAGE_KEY = 'aiwritepaper-browser-demo-v1'

const now = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function validateSkillInput(input: SkillInput): SkillInput {
  const allowedKeys = new Set(['id', 'name', 'description', 'instructions', 'enabled'])
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new Error('Skill 仅支持名称、说明、指令和启用状态。')
  }
  const name = input.name?.trim()
  const description = input.description?.trim() ?? ''
  const instructions = input.instructions?.trim()
  if (!name || name.length > SKILL_LIMITS.name) throw new Error('Skill 名称无效或过长。')
  if (description.length > SKILL_LIMITS.description) throw new Error('Skill 说明过长。')
  if (!instructions || instructions.length > SKILL_LIMITS.instructions) {
    throw new Error('Skill 指令不能为空或过长。')
  }
  if ([name, description, instructions].some((value) => value.includes('\u0000'))) {
    throw new Error('Skill 文本包含无效字符。')
  }
  if (typeof input.enabled !== 'boolean') throw new Error('Skill 启用状态无效。')
  return { id: input.id, name, description, instructions, enabled: input.enabled }
}

const demoLiterature: LiteratureRecord[] = [
  {
    id: 'lit-openalex-01',
    projectId: 'project-demo',
    title: 'Generative Artificial Intelligence in Higher Education: Evidence and Emerging Practices',
    authors: ['L. Chen', 'M. Rossi'],
    year: 2024,
    venue: 'Computers & Education: Artificial Intelligence',
    abstract: '围绕生成式人工智能在高等教育中的应用场景、教学收益与学术诚信风险进行综述。',
    source: 'demo',
    included: true,
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'lit-openalex-02',
    projectId: 'project-demo',
    title: 'Human–AI Collaborative Writing: A Systematic Review of Learning Outcomes',
    authors: ['S. Patel', 'Y. Wang', 'A. Martin'],
    year: 2023,
    venue: 'Educational Technology Research and Development',
    abstract: '梳理人机协同写作对反馈效率、写作信心和高阶认知活动的影响。',
    source: 'demo',
    included: true,
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'lit-openalex-03',
    projectId: 'project-demo',
    title: 'Academic Integrity in the Age of Large Language Models',
    authors: ['R. Williams', 'J. K. Lee'],
    year: 2024,
    venue: 'Assessment & Evaluation in Higher Education',
    abstract: '讨论大语言模型带来的作者身份、引用真实性和过程性评价问题。',
    source: 'demo',
    included: false,
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  },
]

const demoOutline: OutlineNode[] = [
  {
    id: 'outline-01',
    title: '一、绪论',
    level: 1,
    objective: '说明研究背景、问题与研究价值',
    targetWords: 1200,
    citationIds: ['lit-openalex-01'],
    children: [
      {
        id: 'outline-01-01',
        title: '1.1 研究背景与问题提出',
        level: 2,
        objective: '交代高校写作教学的数字化转型背景并提出核心问题',
        targetWords: 650,
        citationIds: ['lit-openalex-01'],
        children: [
          {
            id: 'outline-01-01-01',
            title: '1.1.1 高校写作教学的数字化转型',
            level: 3,
            objective: '说明写作教学从结果评价向过程支持转变的现实需求',
            targetWords: 320,
            citationIds: ['lit-openalex-01'],
            children: [],
          },
          {
            id: 'outline-01-01-02',
            title: '1.1.2 生成式 AI 带来的新问题',
            level: 3,
            objective: '提出反馈效率、写作主体性和学术诚信之间的张力',
            targetWords: 330,
            citationIds: ['lit-openalex-01', 'lit-openalex-03'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-01-02',
        title: '1.2 研究目标与研究价值',
        level: 2,
        objective: '明确研究问题、理论价值与实践价值',
        targetWords: 550,
        citationIds: ['lit-openalex-01'],
        children: [
          {
            id: 'outline-01-02-01',
            title: '1.2.1 研究问题与分析思路',
            level: 3,
            objective: '说明研究围绕作用机制、风险边界与治理路径展开',
            targetWords: 280,
            citationIds: [],
            children: [],
          },
          {
            id: 'outline-01-02-02',
            title: '1.2.2 理论价值与实践价值',
            level: 3,
            objective: '说明研究对人机协同写作理论和教学设计的意义',
            targetWords: 270,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'outline-02',
    title: '二、理论基础与研究现状',
    level: 1,
    objective: '界定人机协同写作并总结已有研究',
    targetWords: 1800,
    citationIds: ['lit-openalex-01', 'lit-openalex-02'],
    children: [
      {
        id: 'outline-02-01',
        title: '2.1 核心概念界定',
        level: 2,
        objective: '界定生成式人工智能与人机协同写作',
        targetWords: 600,
        citationIds: ['lit-openalex-01', 'lit-openalex-02'],
        children: [
          {
            id: 'outline-02-01-01',
            title: '2.1.1 生成式人工智能',
            level: 3,
            objective: '界定生成式人工智能在教学情境中的能力边界',
            targetWords: 300,
            citationIds: ['lit-openalex-01'],
            children: [],
          },
          {
            id: 'outline-02-01-02',
            title: '2.1.2 人机协同写作',
            level: 3,
            objective: '区分辅助写作、协同写作与替代写作',
            targetWords: 300,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-02-02',
        title: '2.2 理论基础',
        level: 2,
        objective: '构建解释生成式 AI 教学作用的理论框架',
        targetWords: 650,
        citationIds: ['lit-openalex-02'],
        children: [
          {
            id: 'outline-02-02-01',
            title: '2.2.1 学习支架理论',
            level: 3,
            objective: '解释提示、示例和反馈如何形成动态学习支架',
            targetWords: 330,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
          {
            id: 'outline-02-02-02',
            title: '2.2.2 自我调节学习理论',
            level: 3,
            objective: '解释目标设定、监控与反思在写作过程中的作用',
            targetWords: 320,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-02-03',
        title: '2.3 国内外研究述评',
        level: 2,
        objective: '总结现有研究进展并识别证据缺口',
        targetWords: 550,
        citationIds: ['lit-openalex-01', 'lit-openalex-02', 'lit-openalex-03'],
        children: [
          {
            id: 'outline-02-03-01',
            title: '2.3.1 研究进展与主要发现',
            level: 3,
            objective: '归纳生成式 AI 在反馈与写作支持方面的已有证据',
            targetWords: 280,
            citationIds: ['lit-openalex-01', 'lit-openalex-02'],
            children: [],
          },
          {
            id: 'outline-02-03-02',
            title: '2.3.2 现有研究的不足',
            level: 3,
            objective: '指出长期效果、主体性和过程证据方面的不足',
            targetWords: 270,
            citationIds: ['lit-openalex-03'],
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'outline-03',
    title: '三、生成式 AI 介入高校写作的作用机制',
    level: 1,
    objective: '分析反馈、支架与反思三个作用路径',
    targetWords: 2400,
    citationIds: ['lit-openalex-02'],
    children: [
      {
        id: 'outline-03-01',
        title: '3.1 即时反馈机制',
        level: 2,
        objective: '分析生成式 AI 如何缩短反馈循环',
        targetWords: 800,
        citationIds: ['lit-openalex-02'],
        children: [
          {
            id: 'outline-03-01-01',
            title: '3.1.1 语言表达反馈',
            level: 3,
            objective: '说明语言层面反馈对修订效率的影响',
            targetWords: 400,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
          {
            id: 'outline-03-01-02',
            title: '3.1.2 论证结构反馈',
            level: 3,
            objective: '说明结构反馈如何支持论点与证据对齐',
            targetWords: 400,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-03-02',
        title: '3.2 认知支架机制',
        level: 2,
        objective: '分析问题分解、材料组织和论证提示的支架作用',
        targetWords: 800,
        citationIds: ['lit-openalex-01', 'lit-openalex-02'],
        children: [
          {
            id: 'outline-03-02-01',
            title: '3.2.1 复杂任务分解',
            level: 3,
            objective: '说明任务分解如何降低写作过程中的认知负荷',
            targetWords: 400,
            citationIds: ['lit-openalex-01'],
            children: [],
          },
          {
            id: 'outline-03-02-02',
            title: '3.2.2 材料组织与论证提示',
            level: 3,
            objective: '说明材料组织提示如何辅助形成可检验论证',
            targetWords: 400,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-03-03',
        title: '3.3 元认知反思机制',
        level: 2,
        objective: '分析比较、质疑与迭代如何促进写作反思',
        targetWords: 800,
        citationIds: ['lit-openalex-02'],
        children: [
          {
            id: 'outline-03-03-01',
            title: '3.3.1 多方案比较与判断',
            level: 3,
            objective: '说明多方案比较如何促进判断标准显性化',
            targetWords: 400,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
          {
            id: 'outline-03-03-02',
            title: '3.3.2 修订过程中的自我监控',
            level: 3,
            objective: '说明过程记录如何支持自我监控与反思',
            targetWords: 400,
            citationIds: ['lit-openalex-02'],
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'outline-04',
    title: '四、风险、边界与教学治理',
    level: 1,
    objective: '讨论引用、学术诚信与评价机制',
    targetWords: 1800,
    citationIds: ['lit-openalex-03'],
    children: [
      {
        id: 'outline-04-01',
        title: '4.1 主要风险与使用边界',
        level: 2,
        objective: '识别引用失真、能力替代和隐私等风险',
        targetWords: 900,
        citationIds: ['lit-openalex-03'],
        children: [
          {
            id: 'outline-04-01-01',
            title: '4.1.1 引用失真与事实幻觉',
            level: 3,
            objective: '分析不可追溯引用和事实错误的形成与后果',
            targetWords: 450,
            citationIds: ['lit-openalex-03'],
            children: [],
          },
          {
            id: 'outline-04-01-02',
            title: '4.1.2 写作主体性与能力替代',
            level: 3,
            objective: '分析过度依赖对写作判断与能力发展的影响',
            targetWords: 450,
            citationIds: ['lit-openalex-03'],
            children: [],
          },
        ],
      },
      {
        id: 'outline-04-02',
        title: '4.2 教学治理路径',
        level: 2,
        objective: '提出过程留痕、引用核验与多元评价策略',
        targetWords: 900,
        citationIds: ['lit-openalex-03'],
        children: [
          {
            id: 'outline-04-02-01',
            title: '4.2.1 过程留痕与引用核验',
            level: 3,
            objective: '建立写作过程记录和引用证据核验机制',
            targetWords: 450,
            citationIds: ['lit-openalex-03'],
            children: [],
          },
          {
            id: 'outline-04-02-02',
            title: '4.2.2 人机协同评价机制',
            level: 3,
            objective: '构建兼顾结果、过程与反思质量的评价方式',
            targetWords: 450,
            citationIds: ['lit-openalex-03'],
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'outline-05',
    title: '五、结论与展望',
    level: 1,
    objective: '总结发现并提出后续研究方向',
    targetWords: 800,
    citationIds: [],
    children: [
      {
        id: 'outline-05-01',
        title: '5.1 研究结论',
        level: 2,
        objective: '归纳作用机制、风险边界与治理建议',
        targetWords: 450,
        citationIds: [],
        children: [
          {
            id: 'outline-05-01-01',
            title: '5.1.1 主要发现',
            level: 3,
            objective: '回应研究问题并概括主要发现',
            targetWords: 450,
            citationIds: [],
            children: [],
          },
        ],
      },
      {
        id: 'outline-05-02',
        title: '5.2 研究局限与未来展望',
        level: 2,
        objective: '说明证据边界并提出未来实证研究方向',
        targetWords: 350,
        citationIds: [],
        children: [
          {
            id: 'outline-05-02-01',
            title: '5.2.1 局限与后续研究方向',
            level: 3,
            objective: '提出长期追踪、跨学科比较和真实教学实验方向',
            targetWords: 350,
            citationIds: [],
            children: [],
          },
        ],
      },
    ],
  },
]

function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)])
}

function findOutlineNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findOutlineNode(node.children, nodeId)
    if (child) return child
  }
  return undefined
}

function cloneOutlineWithFreshIds(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.map((node) => ({
    ...node,
    id: makeId('outline'),
    citationIds: [...node.citationIds],
    children: cloneOutlineWithFreshIds(node.children),
  }))
}

function createSectionsFromOutline(
  outline: OutlineNode[],
  projectId: string,
  useStableDemoIds = false,
): ManuscriptSection[] {
  return flattenOutline(outline).map((item, index) => {
    const hasIntro = useStableDemoIds && index === 0
    const createdAt = now()
    return {
      id: useStableDemoIds ? `section-${index + 1}` : makeId('section'),
      projectId,
      outlineNodeId: item.id,
      title: item.title,
      level: item.level,
      content: hasIntro
        ? `## ${item.title}\n\n生成式人工智能正在从单一的文本生成工具转变为写作过程中的认知协作者。对高校写作而言，真正值得讨论的并非“是否使用”，而是如何把即时反馈、材料组织与反思提示嵌入教学流程，同时保留学生对论证与证据的责任。\n\n本研究拟从学习支架、反馈效率和学术诚信三个维度分析其作用机制，并以可追溯引用作为基本质量边界。当前内容为浏览器演示稿，所列文献尚未连接真实门户，不可直接用于正式引用。`
        : '',
      status: hasIntro ? 'draft' : 'pending',
      wordCount: hasIntro ? 176 : 0,
      version: 1,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
  })
}

const demoSections: ManuscriptSection[] = createSectionsFromOutline(demoOutline, 'project-demo', true)

const initialWorkspace = (): WorkspaceState => {
  const project: Project = {
    id: 'project-demo',
    title: '生成式 AI 赋能高校写作教学研究',
    status: 'outline-review',
    brief: {
      title: '生成式 AI 赋能高校写作教学研究',
      paperType: '课程论文',
      discipline: '教育学',
      language: 'zh-CN',
      targetWords: 8000,
      requirements: '分析作用机制、教学风险与治理路径，引用必须可追溯。',
      keywords: ['生成式人工智能', '高校写作', '人机协同', '学术诚信'],
    },
    activeConversationId: 'conversation-demo',
    activeSectionId: 'section-1',
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const conversation: Conversation = {
    id: 'conversation-demo',
    projectId: project.id,
    title: '生成式 AI 赋能高校写作教学研究',
    messageIds: ['message-user-01', 'message-assistant-01'],
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const messages: ChatMessage[] = [
    {
      id: 'message-user-01',
      projectId: project.id,
      conversationId: conversation.id,
      role: 'user',
      content: '请围绕生成式 AI 如何赋能高校写作教学，先检索文献并形成可继续修改的论文框架。',
      status: 'completed',
      contextScope: 'project',
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'message-assistant-01',
      projectId: project.id,
      conversationId: conversation.id,
      role: 'assistant',
      content:
        '我已把任务拆分为“检索—筛选—大纲—分章写作—引用核验”五个阶段。\n\n### 当前进展\n\n已形成 5 个一级章节，重点覆盖学习支架、反馈效率、写作主体性和学术诚信治理。右侧文献均为浏览器演示数据，尚未连接真实门户，因此不会被标记为已核验。\n\n下一步可以确认大纲，或告诉我需要调整的章节。',
      status: 'completed',
      providerId: 'provider-demo',
      model: 'demo-research-agent',
      contextScope: 'project',
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt: now(),
      updatedAt: now(),
    },
  ]

  const provider: ProviderProfile = {
    id: 'provider-demo',
    name: '浏览器演示',
    protocol: 'openai-compatible',
    baseUrl: 'https://example.invalid/v1',
    models: ['demo-research-agent', 'demo-writing-agent'],
    defaultModel: 'demo-research-agent',
    enabled: true,
    hasCredential: true,
    lastHealth: 'connected',
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const run: AgentRun = {
    id: 'run-demo',
    projectId: project.id,
    kind: 'outline',
    status: 'completed',
    steps: [
      { id: 'step-1', label: '解析研究要求', detail: '识别题目、篇幅、学科与引用约束', status: 'completed' },
      { id: 'step-2', label: '检索候选文献', detail: '浏览器演示数据，未访问真实文献门户', status: 'warning' },
      { id: 'step-3', label: '形成论文大纲', detail: '已生成 5 个一级章节', status: 'completed' },
      { id: 'step-4', label: '等待大纲确认', detail: '确认后可按章节继续生成', status: 'running' },
    ],
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  return {
    schemaVersion: 1,
    projects: [project],
    conversations: [conversation],
    messages,
    providers: [provider],
    literature: demoLiterature,
    outlines: { [project.id]: demoOutline },
    sections: demoSections,
    citations: [],
    runs: [run],
    mcpServers: [
      {
        id: 'mcp-demo',
        name: '公开文献门户（演示）',
        transport: { type: 'streamable-http', url: 'https://example.invalid/mcp' },
        enabled: false,
        status: 'disconnected',
        tools: [
          { name: 'search_literature', description: '按关键词检索公开文献' },
          { name: 'resolve_doi', description: '核验 DOI 与书目信息' },
        ],
        resources: [],
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: now(),
        updatedAt: now(),
      },
    ],
    skills: [],
    artifacts: [],
    settings: {
      activeProjectId: project.id,
      activeProviderId: provider.id,
      activeModel: provider.defaultModel,
      demoMode: true,
    },
  }
}

let memoryState: WorkspaceState | null = null
const listeners = new Set<(event: ChatStreamEvent) => void>()
const chatTimers = new Map<string, number[]>()

function restoreActiveModelIfNeeded(state: WorkspaceState) {
  const selectedProvider = state.providers.find(
    (provider) =>
      provider.id === state.settings.activeProviderId &&
      provider.enabled &&
      provider.models.includes(state.settings.activeModel ?? ''),
  )
  if (selectedProvider) return

  const fallbackProvider =
    state.providers.find((provider) => provider.enabled && provider.lastHealth === 'connected') ??
    state.providers.find((provider) => provider.enabled)
  state.settings.activeProviderId = fallbackProvider?.id
  state.settings.activeModel = fallbackProvider?.models.includes(fallbackProvider.defaultModel)
    ? fallbackProvider.defaultModel
    : fallbackProvider?.models[0]
}

function migrateDefaultDemoOutline(state: WorkspaceState): WorkspaceState {
  const storedOutline = state.outlines['project-demo'] ?? []
  if (flattenOutline(storedOutline).some((node) => node.level === 3)) return state

  const demoProject = state.projects.find((project) => project.id === 'project-demo')
  if (!demoProject) return state

  const migrated = clone(state)
  migrated.outlines['project-demo'] = clone(demoOutline)
  migrated.sections = [
    ...migrated.sections.filter((section) => section.projectId !== 'project-demo'),
    ...clone(demoSections),
  ]
  const migratedProject = migrated.projects.find((project) => project.id === 'project-demo')
  if (migratedProject) migratedProject.activeSectionId = demoSections[0]?.id
  return migrated
}

function readState(): WorkspaceState {
  if (memoryState) return memoryState
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? (JSON.parse(stored) as WorkspaceState) : initialWorkspace()
    const normalized = {
      ...parsed,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    }
    memoryState = migrateDefaultDemoOutline(normalized)
    synchronizeDerivedSections(memoryState)
  } catch {
    memoryState = initialWorkspace()
  }
  return memoryState
}

function writeState(next: WorkspaceState) {
  memoryState = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 浏览器隐私模式下仅保留当前会话状态。
  }
}

function mutate(mutator: (draft: WorkspaceState) => void): WorkspaceState {
  const draft = clone(readState())
  mutator(draft)
  writeState(draft)
  return draft
}

function emit(event: ChatStreamEvent) {
  listeners.forEach((listener) => listener(event))
}

const fallbackApi: PaperAgentApi = {
  workspace: {
    async get() {
      return clone(readState())
    },
    async setActiveModel(providerId, model) {
      const provider = readState().providers.find((item) => item.id === providerId)
      if (!provider || !provider.enabled) throw new Error('未找到可用的模型提供商')
      if (!provider.models.includes(model)) throw new Error('所选模型不在该提供商的模型列表中')

      const next = mutate((draft) => {
        draft.settings.activeProviderId = providerId
        draft.settings.activeModel = model
      })
      return clone(next)
    },
  },
  project: {
    async create(brief) {
      const projectId = makeId('project')
      const conversationId = makeId('conversation')
      const createdAt = now()
      const project: Project = {
        id: projectId,
        title: brief.title,
        status: 'draft',
        brief,
        activeConversationId: conversationId,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt,
        updatedAt: createdAt,
      }
      const conversation: Conversation = {
        id: conversationId,
        projectId,
        title: brief.title,
        messageIds: [],
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt,
        updatedAt: createdAt,
      }
      mutate((draft) => {
        draft.projects.unshift(project)
        draft.conversations.unshift(conversation)
        draft.outlines[projectId] = []
        draft.settings.activeProjectId = projectId
        draft.settings.demoMode = true
        restoreActiveModelIfNeeded(draft)
      })
      return clone(project)
    },
    async setActive(projectId) {
      const next = mutate((draft) => {
        draft.settings.activeProjectId = projectId
        const project = draft.projects.find((item) => item.id === projectId)
        if (project) draft.settings.demoMode = project.origin === 'demo'
        restoreActiveModelIfNeeded(draft)
      })
      return clone(next)
    },
    async delete(projectId) {
      const next = mutate((draft) => {
        const project = draft.projects.find((item) => item.id === projectId)
        if (!project) throw new Error('项目不存在或已经被移除')
        if (
          draft.runs.some(
            (run) => run.projectId === projectId && ['queued', 'running'].includes(run.status),
          )
        ) {
          throw new Error('当前研究仍有任务运行，请停止生成后再删除')
        }
        const conversationIds = new Set(
          draft.conversations
            .filter((item) => item.projectId === projectId)
            .map((item) => item.id),
        )
        const sectionIds = new Set(
          draft.sections.filter((item) => item.projectId === projectId).map((item) => item.id),
        )
        draft.projects = draft.projects.filter((item) => item.id !== projectId)
        draft.conversations = draft.conversations.filter((item) => item.projectId !== projectId)
        draft.messages = draft.messages.filter(
          (item) => item.projectId !== projectId && !conversationIds.has(item.conversationId),
        )
        draft.literature = draft.literature.filter((item) => item.projectId !== projectId)
        draft.sections = draft.sections.filter((item) => item.projectId !== projectId)
        draft.citations = draft.citations.filter(
          (item) => item.projectId !== projectId && !sectionIds.has(item.sectionId),
        )
        draft.runs = draft.runs.filter((item) => item.projectId !== projectId)
        draft.artifacts = draft.artifacts.filter((item) => item.projectId !== projectId)
        delete draft.outlines[projectId]
        if (draft.settings.activeProjectId === projectId) {
          const fallback = draft.projects.find((item) => item.origin !== 'demo') ?? draft.projects[0]
          draft.settings.activeProjectId = fallback?.id
          draft.settings.demoMode = fallback?.origin === 'demo'
        }
        restoreActiveModelIfNeeded(draft)
      })
      return clone(next)
    },
    async chooseFolder() {
      const next = mutate((draft) => {
        draft.settings.researchRootPath = '浏览器演示/学术 Agent'
      })
      return clone(next)
    },
    async revealFolder(projectId) {
      const project = readState().projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除')
      throw new Error('浏览器演示无法打开 Finder，请使用桌面应用。')
    },
  },
  provider: {
    async save(input) {
      const id = input.id ?? makeId('provider')
      const existing = readState().providers.find((item) => item.id === id)
      const saved: ProviderProfile = {
        id,
        name: input.name,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        models: input.models,
        defaultModel: input.defaultModel,
        enabled: input.enabled,
        hasCredential: Boolean(input.apiKey) || existing?.hasCredential === true,
        lastHealth: 'untested',
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      }
      mutate((draft) => {
        const index = draft.providers.findIndex((item) => item.id === id)
        if (index >= 0) draft.providers[index] = saved
        else draft.providers.push(saved)
        if (!draft.settings.activeProviderId) {
          draft.settings.activeProviderId = id
          draft.settings.activeModel = saved.defaultModel
        }
      })
      return clone(saved)
    },
    async delete(providerId) {
      mutate((draft) => {
        draft.providers = draft.providers.filter((item) => item.id !== providerId)
        if (draft.settings.activeProviderId === providerId) {
          const next = draft.providers.find((item) => item.enabled)
          draft.settings.activeProviderId = next?.id
          draft.settings.activeModel = next?.defaultModel
        }
      })
    },
    async test(providerId) {
      const provider = readState().providers.find((item) => item.id === providerId)
      if (!provider) return { ok: false, message: '未找到该提供商配置' }
      mutate((draft) => {
        const target = draft.providers.find((item) => item.id === providerId)
        if (target) target.lastHealth = 'connected'
      })
      return {
        ok: true,
        message: '浏览器演示连接正常，未访问真实模型服务',
        models: provider.models,
      }
    },
  },
  literature: {
    async search(input) {
      const query = input.query.trim().toLowerCase()
      const matches = demoLiterature.filter((item) =>
        [item.title, item.abstract, ...item.authors].filter(Boolean).join(' ').toLowerCase().includes(query),
      )
      const results = (matches.length > 0 ? matches : demoLiterature).slice(0, input.limit ?? 20).map((item) => ({
        ...item,
        id: input.projectId ? `${item.id}-${input.projectId}` : item.id,
        projectId: input.projectId,
        included: false,
        updatedAt: now(),
      }))
      mutate((draft) => {
        const ids = new Set(results.map((item) => item.id))
        draft.literature = [...draft.literature.filter((item) => !ids.has(item.id)), ...results]
      })
      return clone(results)
    },
    async toggle(projectId, literatureId, included) {
      let updated: LiteratureRecord | undefined
      mutate((draft) => {
        const target = draft.literature.find((item) => item.id === literatureId)
        if (target) {
          target.projectId = projectId
          target.included = included
          target.updatedAt = now()
          updated = target
        }
      })
      if (!updated) throw new Error('未找到文献记录')
      return clone(updated)
    },
  },
  outline: {
    async generate(input) {
      const generated = cloneOutlineWithFreshIds(demoOutline)
      mutate((draft) => {
        draft.outlines[input.projectId] = generated
        draft.sections = draft.sections.filter((item) => item.projectId !== input.projectId)
        draft.sections.push(...createSectionsFromOutline(generated, input.projectId))
        const project = draft.projects.find((item) => item.id === input.projectId)
        if (project) {
          project.status = 'outline-review'
          project.activeSectionId = draft.sections.find(
            (item) => item.projectId === input.projectId,
          )?.id
        }
      })
      return clone(generated)
    },
    async save(projectId, outline) {
      mutate((draft) => {
        draft.outlines[projectId] = outline
      })
      return clone(outline)
    },
  },
  section: {
    async generate(input) {
      const outline = readState().outlines[input.projectId] ?? []
      const sourceSection = readState().sections.find(
        (item) => item.id === input.sectionId || item.outlineNodeId === input.sectionId,
      )
      const outlineNodeId = sourceSection?.outlineNodeId ?? input.sectionId
      const target = findOutlineNode(outline, outlineNodeId)
      mutate((draft) => {
        const existing = draft.sections.find(
          (item) => item.id === input.sectionId || item.outlineNodeId === input.sectionId,
        )
        if (existing) {
          existing.status = 'draft'
          existing.content = `## ${existing.title}\n\n这是根据当前大纲生成的浏览器演示章节。真实应用会使用所选模型和已纳入文献逐段写作，并在右侧标记引用证据的核验状态。\n\n当前结果未连接真实模型与文献门户，不可作为正式论文内容。`
          existing.wordCount = 86
          existing.updatedAt = now()
        } else if (target) {
          draft.sections.push({
            id: makeId('section'),
            projectId: input.projectId,
            outlineNodeId,
            title: target.title,
            level: target.level,
            content: `## ${target.title}\n\n这是浏览器演示章节，尚未调用真实模型。`,
            status: 'draft',
            wordCount: 28,
            version: 1,
            origin: 'demo',
            verificationStatus: 'demo',
            createdAt: now(),
            updatedAt: now(),
          })
        }
        synchronizeDerivedSections(draft, input.projectId, now())
      })
    },
    async save(sectionId, content) {
      mutate((draft) => {
        saveSectionContentInState(draft, sectionId, content, now())
      })
    },
    async setActive(sectionId) {
      const next = mutate((draft) => {
        const section = draft.sections.find((item) => item.id === sectionId)
        if (!section) throw new Error('未找到对应章节')

        const project = draft.projects.find((item) => item.id === section.projectId)
        if (!project) throw new Error('未找到章节所属项目')

        project.activeSectionId = section.id
        project.updatedAt = now()
        draft.settings.activeProjectId = project.id
        draft.settings.demoMode = project.origin === 'demo'
        restoreActiveModelIfNeeded(draft)
      })
      return clone(next)
    },
  },
  chat: {
    async start(input) {
      const runId = makeId('run')
      const userId = makeId('message')
      const assistantId = makeId('message')
      const createdAt = now()
      const userMessage: ChatMessage = {
        id: userId,
        projectId: input.projectId,
        conversationId: input.conversationId,
        role: 'user',
        content: input.content,
        status: 'completed',
        providerId: input.providerId,
        model: input.model,
        contextScope: input.contextScope,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt,
        updatedAt: createdAt,
      }
      const assistant: ChatMessage = {
        id: assistantId,
        projectId: input.projectId,
        conversationId: input.conversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        providerId: input.providerId,
        model: input.model,
        contextScope: input.contextScope,
        runId,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt,
        updatedAt: createdAt,
      }
      const fullText =
        '我已收到你的要求。当前运行在浏览器演示模式，因此这次回复不会访问真实模型或文献门户。\n\n我会保留项目上下文，并按“明确修改目标—定位相关段落—检查引用状态—生成修订稿”的流程处理。安装版配置模型后，同一输入框会切换为真实流式生成。'
      const deltas = fullText.match(/.{1,8}/gs) ?? [fullText]
      mutate((draft) => {
        draft.messages.push(userMessage, assistant)
        const conversation = draft.conversations.find((item) => item.id === input.conversationId)
        conversation?.messageIds.push(userId, assistantId)
      })
      window.setTimeout(() => emit({ runId, type: 'started', message: clone(assistant) }), 0)
      const timers: number[] = []
      deltas.forEach((delta, index) => {
        timers.push(
          window.setTimeout(() => {
            mutate((draft) => {
              const message = draft.messages.find((item) => item.id === assistantId)
              if (message) message.content += delta
            })
            emit({ runId, type: 'text-delta', delta })
            if (index === deltas.length - 1) {
              const completed = mutate((draft) => {
                const message = draft.messages.find((item) => item.id === assistantId)
                if (message) message.status = 'completed'
              }).messages.find((item) => item.id === assistantId)
              if (completed) emit({ runId, type: 'completed', message: clone(completed) })
              chatTimers.delete(runId)
            }
          }, 80 + index * 36),
        )
      })
      chatTimers.set(runId, timers)
      return { runId }
    },
    async cancel(runId) {
      chatTimers.get(runId)?.forEach((timer) => window.clearTimeout(timer))
      chatTimers.delete(runId)
      const cancelled = mutate((draft) => {
        const message = draft.messages.find((item) => item.runId === runId)
        if (message) message.status = 'cancelled'
      }).messages.find((item) => item.runId === runId)
      if (cancelled) emit({ runId, type: 'cancelled', message: clone(cancelled) })
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  },
  mcp: {
    async save(input) {
      const id = input.id ?? makeId('mcp')
      const existing = readState().mcpServers.find((item) => item.id === id)
      const saved = {
        id,
        name: input.name,
        transport: input.transport,
        enabled: input.enabled,
        status: 'disconnected' as const,
        tools: existing?.tools ?? [],
        resources: existing?.resources ?? [],
        origin: 'demo' as const,
        verificationStatus: 'demo' as const,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      }
      mutate((draft) => {
        const index = draft.mcpServers.findIndex((item) => item.id === id)
        if (index >= 0) draft.mcpServers[index] = saved
        else draft.mcpServers.push(saved)
      })
      return clone(saved)
    },
    async delete(serverId) {
      mutate((draft) => {
        draft.mcpServers = draft.mcpServers.filter((item) => item.id !== serverId)
      })
    },
    async test(serverId) {
      const next = mutate((draft) => {
        const server = draft.mcpServers.find((item) => item.id === serverId)
        if (server) {
          server.status = 'connected'
          server.tools = [
            { name: 'search_literature', description: '浏览器演示工具，未连接真实 MCP 服务' },
            { name: 'resolve_metadata', description: '浏览器演示工具，未连接真实 MCP 服务' },
          ]
        }
      })
      const server = next.mcpServers.find((item) => item.id === serverId)
      if (!server) throw new Error('未找到 MCP 服务')
      return clone(server)
    },
    async callTool(serverId, name, args) {
      const server = readState().mcpServers.find((item) => item.id === serverId)
      if (!server) throw new Error('未找到 MCP 服务')
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              demo: true,
              server: server.name,
              tool: name,
              arguments: args,
              message: '浏览器演示结果：未调用真实 MCP 工具。',
            }, null, 2),
          },
        ],
        structuredContent: {
          demo: true,
          message: '浏览器演示结果：未调用真实 MCP 工具。',
        },
      }
    },
    async readResource(serverId, uri) {
      const server = readState().mcpServers.find((item) => item.id === serverId)
      if (!server) throw new Error('未找到 MCP 服务')
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `浏览器演示结果：未读取真实 MCP 资源。\n服务：${server.name}\n资源：${uri}`,
          },
        ],
      }
    },
  },
  skill: {
    async save(input) {
      const normalized = validateSkillInput(input)
      const id = normalized.id ?? makeId('skill')
      const existing = readState().skills.find((item) => item.id === id)
      if (normalized.id && !existing) throw new Error('Skill 不存在或已经被移除。')
      const saved: SkillDefinition = {
        id,
        name: normalized.name,
        description: normalized.description,
        instructions: normalized.instructions,
        enabled: normalized.enabled,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
      }
      mutate((draft) => {
        const index = draft.skills.findIndex((item) => item.id === id)
        if (index >= 0) draft.skills[index] = saved
        else draft.skills.push(saved)
      })
      return clone(saved)
    },
    async delete(skillId) {
      mutate((draft) => {
        if (!draft.skills.some((item) => item.id === skillId)) {
          throw new Error('Skill 不存在或已经被移除。')
        }
        draft.skills = draft.skills.filter((item) => item.id !== skillId)
      })
    },
  },
  export: {
    async project(projectId, format) {
      const project = readState().projects.find((item) => item.id === projectId)
      if (!project) return null
      const content = `# ${project.title}\n\n此文件由浏览器演示模式生成，不包含真实模型或文献检索结果。`
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${project.title}.${format === 'md' ? 'md' : 'txt'}`
      anchor.click()
      URL.revokeObjectURL(url)
      return null
    },
    async reveal() {},
  },
  external: {
    async open(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  },
  app: {
    async info() {
      return { version: 'browser-demo', platform: navigator.platform, packaged: false }
    },
  },
}

export const isNativeBridge = typeof window !== 'undefined' && Boolean(window.paperAgent)

export const paperAgent: PaperAgentApi = isNativeBridge ? window.paperAgent : fallbackApi
