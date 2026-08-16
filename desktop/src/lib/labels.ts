// 界面展示用的状态文案映射；从 App.tsx 抽出。
import type {
  LiteratureRecord,
  ManuscriptSection,
  PaperStructurePattern,
  SystemPermissionSnapshot,
} from '../../shared/contracts'

export const verificationLabels: Record<LiteratureRecord['verificationStatus'], string> = {
  'verified-metadata': '来源元数据已记录',
  'abstract-only': '仅检索到摘要',
  unverified: '尚未核验',
  unavailable: '来源不可访问',
  demo: '演示数据，不可引用',
}

export const projectStatusLabels: Record<string, string> = {
  draft: '准备中',
  researching: '检索中',
  'outline-review': '待确认大纲',
  writing: '写作中',
  reviewing: '核验中',
  completed: '已完成',
  stopped: '已停止',
}

export const outlinePatternLabels: Record<PaperStructurePattern, string> = {
  'empirical-imrad': '实证研究 / IMRaD',
  'system-engineering': '系统设计 / 工程实现',
  'thematic-review': '主题式文献综述',
  'theoretical-normative': '理论 / 规范分析',
  'case-study': '案例研究',
  'policy-management': '政策 / 管理研究',
}

export const permissionStatusLabels: Record<SystemPermissionSnapshot['accessibility'], string> = {
  granted: '已授权',
  denied: '未授权',
  'not-determined': '尚未询问',
  restricted: '受系统限制',
  unknown: '无法确认',
  unsupported: '当前环境不支持',
}

const sectionStatusLabels: Record<ManuscriptSection['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  draft: '草稿',
  verified: '已核验',
  error: '生成失败',
}

export function sectionStatusLabel(section: ManuscriptSection): string {
  if (section.derivedFromSectionId && ['draft', 'verified'].includes(section.status)) {
    return section.status === 'verified' ? '随父章节同步 · 已核验' : '已随父章节生成'
  }
  return sectionStatusLabels[section.status]
}
