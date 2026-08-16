// 模型提供商配置页；从 App.tsx 抽出。
import { Activity, Bot, KeyRound, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { ProviderProfile, ProviderProtocol } from '../../shared/contracts'
import { IconButton, StatusBadge } from '../components/common'
import { paperAgent } from '../fallback'

export function ProviderSettings({
  providers,
  onRefresh,
  onToast,
}: {
  providers: ProviderProfile[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string | 'new'>(providers[0]?.id ?? 'new')
  const selected = providers.find((item) => item.id === selectedId)
  const [form, setForm] = useState({
    name: '',
    protocol: 'openai-compatible' as ProviderProtocol,
    baseUrl: '',
    apiKey: '',
    models: '',
    defaultModel: '',
    enabled: true,
  })
  const [busy, setBusy] = useState<'save' | 'test' | ''>('')

  useEffect(() => {
    setForm(
      selected
        ? {
            name: selected.name,
            protocol: selected.protocol,
            baseUrl: selected.baseUrl,
            apiKey: '',
            models: selected.models.join(', '),
            defaultModel: selected.defaultModel,
            enabled: selected.enabled,
          }
        : {
            name: '',
            protocol: 'openai-compatible',
            baseUrl: '',
            apiKey: '',
            models: '',
            defaultModel: '',
            enabled: true,
          },
    )
  }, [selectedId, selected?.updatedAt])

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    const models = form.models.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)
    if (!form.name.trim() || !form.baseUrl.trim() || models.length === 0) return undefined
    setBusy('save')
    try {
      const saved = await paperAgent.provider.save({
        id: selected?.id,
        name: form.name.trim(),
        protocol: form.protocol,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey || undefined,
        models,
        defaultModel: form.defaultModel.trim() || models[0],
        enabled: form.enabled,
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast('模型提供商已保存')
      return saved
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存失败', 'error')
      return undefined
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const saved = selected ?? (await save())
      if (!saved) return
      const result = await paperAgent.provider.test(saved.id)
      await onRefresh()
      onToast(result.message, result.ok ? 'success' : 'error')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '连接测试失败', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="settings-workbench">
      <aside className="settings-list">
        <div className="settings-list-head">
          <strong>模型提供商</strong>
          <IconButton icon={Plus} label="新增提供商" onClick={() => setSelectedId('new')} />
        </div>
        <button type="button" className={selectedId === 'new' ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId('new')}>
          <span className="settings-row-icon"><Plus size={15} /></span>
          <span><strong>添加提供商</strong><small>OpenAI 兼容或 Anthropic</small></span>
        </button>
        {providers.map((provider) => (
          <button type="button" key={provider.id} className={selectedId === provider.id ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId(provider.id)}>
            <span className="settings-row-icon"><Bot size={15} /></span>
            <span><strong>{provider.name}</strong><small>{provider.defaultModel}</small></span>
            <span className={`connection-dot ${provider.lastHealth === 'connected' ? 'is-connected' : provider.lastHealth === 'failed' ? 'is-failed' : ''}`} />
          </button>
        ))}
      </aside>
      <main className="settings-detail">
        <div className="settings-detail-head">
          <div>
            <h2>{selected ? selected.name : '添加模型提供商'}</h2>
            <p>配置仅保存在本机。API Key 由安装版写入系统安全存储，不会显示在页面或日志中。</p>
          </div>
          {selected && <StatusBadge status={selected.lastHealth ?? 'untested'}>{selected.lastHealth === 'connected' ? '连接正常' : selected.lastHealth === 'failed' ? '连接失败' : '尚未测试'}</StatusBadge>}
        </div>
        <form className="settings-form" onSubmit={save}>
          <label className="field"><span>配置名称</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：OpenAI、DeepSeek 或本地网关" /></label>
          <label className="field">
            <span>接口协议</span>
            <select
              value={form.protocol}
              onChange={(event) => setForm({ ...form, protocol: event.target.value as ProviderProtocol })}
            >
              <option value="openai-compatible">OpenAI 兼容接口</option>
              <option value="anthropic">Anthropic Messages API</option>
            </select>
          </label>
          <label className="field"><span>Base URL</span><input required value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" spellCheck={false} /></label>
          <label className="field"><span>API Key {selected?.hasCredential && <small>已安全保存，留空则保持不变</small>}</span><div className="input-with-icon"><KeyRound size={16} /><input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={selected?.hasCredential ? '••••••••••••••••' : '输入 API Key'} autoComplete="new-password" /></div></label>
          <label className="field"><span>模型列表</span><textarea required value={form.models} onChange={(event) => setForm({ ...form, models: event.target.value })} placeholder="gpt-5.4, deepseek-chat" /></label>
          <label className="field"><span>默认模型</span><input value={form.defaultModel} onChange={(event) => setForm({ ...form, defaultModel: event.target.value })} placeholder="留空则使用列表第一项" /></label>
          <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>启用此提供商</strong><small>启用后会出现在对话框左下角的模型选择器中</small></span></label>
          <div className="settings-form-actions">
            {selected && (
              <button type="button" className="danger-button" onClick={async () => {
                await paperAgent.provider.delete(selected.id)
                setSelectedId('new')
                await onRefresh()
                onToast('提供商已删除')
              }}><Trash2 size={15} /> 删除</button>
            )}
            <span />
            <button type="button" className="secondary-button" onClick={test} disabled={Boolean(busy)}>{busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <Activity size={15} />} 测试连接</button>
            <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} 保存配置</button>
          </div>
        </form>
      </main>
    </div>
  )
}
