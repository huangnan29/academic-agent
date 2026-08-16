// Skills 管理页；从 App.tsx 抽出。
import { CircleDot, LoaderCircle, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { SkillDefinition, SkillInput } from '../../shared/contracts'
import { SKILL_LIMITS } from '../../shared/contracts'
import { IconButton } from '../components/common'
import { paperAgent } from '../fallback'

function emptySkillInput(): SkillInput {
  return {
    name: '',
    description: '',
    instructions: '',
    enabled: true,
  }
}

export function SkillsPage({
  skills,
  onRefresh,
  onToast,
}: {
  skills: SkillDefinition[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string>('new')
  const [form, setForm] = useState<SkillInput>(emptySkillInput)
  const [busy, setBusy] = useState<'save' | 'delete'>()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const selected = skills.find((skill) => skill.id === selectedId)
  const enabledCount = skills.filter((skill) => skill.enabled).length

  useEffect(() => {
    if (!selected) {
      if (selectedId !== 'new' && skills.length > 0) {
        setSelectedId(skills[0].id)
      } else if (selectedId === 'new' && skills.length === 0) {
        setSelectedId('new')
        setForm(emptySkillInput())
      }
      return
    }
    setForm({
      id: selected.id,
      name: selected.name,
      description: selected.description,
      instructions: selected.instructions,
      enabled: selected.enabled,
    })
  }, [selectedId, selected, skills])

  const startNew = () => {
    setSelectedId('new')
    setForm(emptySkillInput())
    setDeleteConfirmOpen(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.instructions.trim()) {
      onToast('请填写 Skill 名称和指令', 'error')
      return
    }
    setBusy('save')
    try {
      const saved = await paperAgent.skill.save({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        instructions: form.instructions.trim(),
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast(form.id ? 'Skill 已更新' : 'Skill 已添加')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存 Skill 失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  const remove = async () => {
    if (!selected) return
    setBusy('delete')
    try {
      await paperAgent.skill.delete(selected.id)
      const nextSkill = skills.find((skill) => skill.id !== selected.id)
      setSelectedId(nextSkill?.id ?? 'new')
      if (!nextSkill) setForm(emptySkillInput())
      await onRefresh()
      setDeleteConfirmOpen(false)
      onToast('Skill 已删除')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '删除 Skill 失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="route-page skills-page">
      <header className="route-header skills-route-header">
        <div>
          <span className="route-kicker">应用内能力</span>
          <h1>Skills</h1>
          <p>把固定的研究方法、写作规范和输出偏好保存为可复用指令；启用后用于新的提纲、章节和对话请求。</p>
        </div>
        <span className="skills-count">{enabledCount} 个启用 · {skills.length} 个已添加</span>
      </header>

      <div className="settings-workbench skills-workbench">
        <aside className="settings-list skills-list" aria-label="应用内 Skills">
          <div className="settings-list-head">
            <strong>我的 Skills</strong>
            <IconButton icon={Plus} label="添加 Skill" onClick={startNew} />
          </div>
          {skills.length === 0 ? (
            <button type="button" className="skills-empty-list" onClick={startNew}>
              <Sparkles size={18} aria-hidden="true" />
              <span><strong>尚未添加 Skill</strong><small>从右侧创建第一条应用内指令</small></span>
            </button>
          ) : (
            skills.map((skill) => (
              <button
                type="button"
                className={`settings-row${selectedId === skill.id ? ' is-active' : ''}`}
                key={skill.id}
                onClick={() => {
                  setSelectedId(skill.id)
                  setDeleteConfirmOpen(false)
                }}
                aria-pressed={selectedId === skill.id}
              >
                <span className="settings-row-icon"><Sparkles size={16} aria-hidden="true" /></span>
                <span><strong>{skill.name}</strong><small>{skill.description || '未填写说明'}</small></span>
                <span className={`skill-enabled-state${skill.enabled ? ' is-enabled' : ''}`} aria-label={skill.enabled ? '已启用' : '未启用'}>
                  <CircleDot size={10} aria-hidden="true" />
                </span>
              </button>
            ))
          )}
        </aside>

        <main className="settings-detail skills-detail">
          <div className="settings-detail-head">
            <div>
              <h2>{selected ? `编辑 ${selected.name}` : '添加 Skill'}</h2>
              <p>Skill 是纯文本指令。应用只会在你主动发起生成或对话时，把启用项加入当前请求上下文。</p>
            </div>
          </div>

          <div className="skill-isolation-note" role="note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span><strong>与系统配置完全隔离</strong><small>仅保存在学术 Agent 工作区，不读取 ~/.codex、系统 Skills、其他应用 Skills 或系统 MCP 配置。</small></span>
          </div>

          <form className="settings-form skills-form" onSubmit={submit}>
            <label className="field">
              <span>名称 <small>{form.name.length}/{SKILL_LIMITS.name}</small></span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={SKILL_LIMITS.name}
                placeholder="例如：中文学术写作规范"
                required
              />
            </label>
            <label className="field">
              <span>说明 <small>{form.description.length}/{SKILL_LIMITS.description}</small></span>
              <input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                maxLength={SKILL_LIMITS.description}
                placeholder="说明这条 Skill 适合什么任务"
              />
            </label>
            <label className="field skill-instructions-field">
              <span>指令 <small>{form.instructions.length}/{SKILL_LIMITS.instructions}</small></span>
              <textarea
                value={form.instructions}
                onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                maxLength={SKILL_LIMITS.instructions}
                placeholder={'写下希望 Agent 持续遵循的研究或写作规则。\n例如：章节先说明研究问题，再组织可核验文献证据；不把摘要信息表述为全文结论。'}
                required
              />
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              <span><strong>启用此 Skill</strong><small>关闭后仍保存在本机，但不会加入模型上下文</small></span>
            </label>
            <div className="settings-form-actions">
              {selected ? (
                deleteConfirmOpen ? (
                  <span className="skill-delete-confirm" role="group" aria-label={`确认删除 ${selected.name}`}>
                    <button type="button" className="secondary-button" onClick={() => setDeleteConfirmOpen(false)} disabled={Boolean(busy)}>取消</button>
                    <button type="button" className="danger-button" onClick={remove} disabled={Boolean(busy)}>
                      {busy === 'delete' ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
                      确认删除
                    </button>
                  </span>
                ) : (
                  <button type="button" className="danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={Boolean(busy)}>
                    <Trash2 size={15} /> 删除
                  </button>
                )
              ) : <span />}
              <span />
              <button type="button" className="secondary-button" onClick={startNew} disabled={Boolean(busy)}>清空</button>
              <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>
                {busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                {selected ? '保存修改' : '添加 Skill'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </section>
  )
}
