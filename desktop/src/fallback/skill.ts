import type { SkillDefinition, SkillInput } from '../../shared/contracts'
import { SKILL_LIMITS } from '../../shared/contracts'
import { clone, makeId, mutate, now, readState } from './state'

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

export const skillApi: Window['paperAgent']['skill'] = {
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
}
