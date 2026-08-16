// MCP 服务配置页与能力调试面板；从 App.tsx 抽出。
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Database,
  LoaderCircle,
  Plus,
  PlugZap,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import type { McpServerConfig } from '../../shared/contracts'
import { IconButton, StatusBadge } from '../components/common'
import { paperAgent } from '../fallback'

function CapabilityOutput({
  result,
}: {
  result: { text?: string; error?: string }
}) {
  const hasError = Boolean(result.error)
  return (
    <div className={`capability-output${hasError ? ' is-error' : ''}`} aria-live="polite">
      <div>
        {hasError ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
        <strong>{hasError ? '调用失败' : '返回结果'}</strong>
      </div>
      <pre>{result.error ?? result.text ?? '没有返回内容'}</pre>
    </div>
  )
}

export function McpSettings({
  servers,
  onRefresh,
  onToast,
}: {
  servers: McpServerConfig[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string | 'new'>(servers[0]?.id ?? 'new')
  const selected = servers.find((item) => item.id === selectedId)
  const [form, setForm] = useState({
    name: '',
    type: 'streamable-http' as 'stdio' | 'streamable-http',
    endpoint: '',
    args: '',
    env: '',
    headers: '',
    enabled: true,
  })
  const [busy, setBusy] = useState<'save' | 'test' | ''>('')
  const [activeToolName, setActiveToolName] = useState<string>()
  const [toolArgs, setToolArgs] = useState('{}')
  const [capabilityBusy, setCapabilityBusy] = useState<string>()
  const [capabilityResult, setCapabilityResult] = useState<{
    key: string
    text?: string
    error?: string
  }>()

  useEffect(() => {
    setForm(
      selected
        ? {
            name: selected.name,
            type: selected.transport.type,
            endpoint: selected.transport.type === 'stdio' ? selected.transport.command : selected.transport.url,
            args: selected.transport.type === 'stdio' ? selected.transport.args.join('\n') : '',
            env:
              selected.transport.type === 'stdio'
                ? Object.entries(selected.transport.env ?? {})
                    .map(([key, value]) => `${key}=${value}`)
                    .join('\n')
                : '',
            headers:
              selected.transport.type === 'streamable-http'
                ? Object.entries(selected.transport.headers ?? {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n')
                : '',
            enabled: selected.enabled,
          }
        : {
            name: '',
            type: 'streamable-http',
            endpoint: '',
            args: '',
            env: '',
            headers: '',
            enabled: true,
          },
    )
    setActiveToolName(undefined)
    setToolArgs('{}')
    setCapabilityResult(undefined)
  }, [selectedId, selected?.updatedAt])

  const formatCapabilityResult = (value: unknown) => {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const callTool = async (toolName: string) => {
    if (!selected) return
    let parsed: unknown
    try {
      parsed = JSON.parse(toolArgs)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('参数必须是 JSON 对象')
      }
    } catch (error) {
      setCapabilityResult({
        key: `tool:${toolName}`,
        error: error instanceof Error ? error.message : 'JSON 参数格式无效',
      })
      return
    }
    const key = `tool:${toolName}`
    setCapabilityBusy(key)
    setCapabilityResult(undefined)
    try {
      const result = await paperAgent.mcp.callTool(
        selected.id,
        toolName,
        parsed as Record<string, unknown>,
      )
      setCapabilityResult({ key, text: formatCapabilityResult(result) })
    } catch (error) {
      setCapabilityResult({
        key,
        error: error instanceof Error ? error.message : 'MCP 工具调用失败',
      })
    } finally {
      setCapabilityBusy(undefined)
    }
  }

  const readResource = async (uri: string) => {
    if (!selected) return
    const key = `resource:${uri}`
    setActiveToolName(undefined)
    setCapabilityBusy(key)
    setCapabilityResult(undefined)
    try {
      const result = await paperAgent.mcp.readResource(selected.id, uri)
      setCapabilityResult({ key, text: formatCapabilityResult(result) })
    } catch (error) {
      setCapabilityResult({
        key,
        error: error instanceof Error ? error.message : 'MCP 资源读取失败',
      })
    } finally {
      setCapabilityBusy(undefined)
    }
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!form.name.trim() || !form.endpoint.trim()) return undefined
    let env: Record<string, string> | undefined
    let headers: Record<string, string> | undefined
    try {
      const parseLines = (value: string, kind: 'env' | 'header') => {
        const output: Record<string, string> = {}
        value.split('\n').forEach((rawLine, index) => {
          const line = rawLine.trim()
          if (!line) return
          const separator = kind === 'env' ? '=' : ':'
          const separatorIndex = line.indexOf(separator)
          if (separatorIndex <= 0) {
            throw new Error(
              kind === 'env'
                ? `环境变量第 ${index + 1} 行格式错误，应为 KEY=VALUE`
                : `请求头第 ${index + 1} 行格式错误，应为 名称: 值`,
            )
          }
          const key = line.slice(0, separatorIndex).trim()
          const itemValue = line.slice(separatorIndex + 1).trim()
          if (!key || !itemValue) {
            throw new Error(
              kind === 'env'
                ? `环境变量第 ${index + 1} 行的名称或值为空`
                : `请求头第 ${index + 1} 行的名称或值为空`,
            )
          }
          output[key] = itemValue
        })
        return Object.keys(output).length > 0 ? output : undefined
      }
      if (form.type === 'stdio') env = parseLines(form.env, 'env')
      else headers = parseLines(form.headers, 'header')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'MCP 凭证格式错误', 'error')
      return undefined
    }
    setBusy('save')
    try {
      const saved = await paperAgent.mcp.save({
        id: selected?.id,
        name: form.name.trim(),
        enabled: form.enabled,
        transport:
          form.type === 'stdio'
            ? {
                type: 'stdio',
                command: form.endpoint.trim(),
                args: form.args.split('\n').map((item) => item.trim()).filter(Boolean),
                env,
              }
            : { type: 'streamable-http', url: form.endpoint.trim(), headers },
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast('MCP 服务已保存')
      return saved
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存失败', 'error')
      return undefined
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    const saved = await save()
    if (!saved) return
    setBusy('test')
    try {
      const tested = await paperAgent.mcp.test(saved.id)
      await onRefresh()
      const demoSuccess = tested.origin === 'demo' && !tested.lastError
      const ok = tested.verificationStatus === 'verified-metadata' && !tested.lastError
      onToast(
        demoSuccess
          ? '浏览器演示连接成功：未连接真实 MCP 服务，仅展示模拟能力。'
          : ok
            ? `连接成功，发现 ${tested.tools.length} 个工具`
            : tested.lastError || '连接测试未通过',
        demoSuccess || ok ? 'success' : 'error',
      )
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'MCP 连接失败', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="settings-workbench">
      <aside className="settings-list">
        <div className="settings-list-head"><strong>MCP 服务</strong><IconButton icon={Plus} label="新增 MCP" onClick={() => setSelectedId('new')} /></div>
        <button type="button" className={selectedId === 'new' ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId('new')}><span className="settings-row-icon"><Plus size={15} /></span><span><strong>添加 MCP 服务</strong><small>stdio 或 Streamable HTTP</small></span></button>
        {servers.map((server) => (
          <button type="button" key={server.id} className={selectedId === server.id ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId(server.id)}>
            <span className="settings-row-icon"><PlugZap size={15} /></span><span><strong>{server.name}</strong><small>{server.tools.length} 个工具 · {server.transport.type}</small></span><span className={`connection-dot ${server.status === 'connected' ? 'is-connected' : server.status === 'failed' ? 'is-failed' : ''}`} />
          </button>
        ))}
      </aside>
      <main className="settings-detail">
        <div className="settings-detail-head">
          <div><h2>{selected ? selected.name : '添加 MCP 服务'}</h2><p>连接低门槛文献门户或其他标准 MCP 服务。敏感环境变量不会在界面中回显。</p></div>
          {selected && <StatusBadge status={selected.status}>{selected.status === 'connected' ? '已连接' : selected.status === 'failed' ? '连接失败' : '未连接'}</StatusBadge>}
        </div>
        <form className="settings-form" onSubmit={save}>
          <label className="field"><span>服务名称</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：公开文献检索" /></label>
          <label className="field"><span>传输方式</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as 'stdio' | 'streamable-http' })}><option value="streamable-http">Streamable HTTP</option><option value="stdio">stdio（本机进程）</option></select></label>
          <label className="field"><span>{form.type === 'stdio' ? '命令' : '服务 URL'}</span><input required value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder={form.type === 'stdio' ? '例如：npx' : 'https://example.com/mcp'} spellCheck={false} /></label>
          {form.type === 'stdio' && <label className="field"><span>参数 <small>每行一项</small></span><textarea value={form.args} onChange={(event) => setForm({ ...form, args: event.target.value })} placeholder={'-y\n@scope/literature-mcp'} /></label>}
          {form.type === 'stdio' ? (
            <label className="field">
              <span>环境变量 <small>每行 KEY=VALUE</small></span>
              <textarea
                value={form.env}
                onChange={(event) => setForm({ ...form, env: event.target.value })}
                placeholder={'SEMANTIC_SCHOLAR_API_KEY=••••••••\nLOG_LEVEL=info'}
                spellCheck={false}
              />
            </label>
          ) : (
            <label className="field">
              <span>请求头 <small>每行 名称: 值</small></span>
              <textarea
                value={form.headers}
                onChange={(event) => setForm({ ...form, headers: event.target.value })}
                placeholder={'Authorization: Bearer ••••••••\nX-Workspace: research'}
                spellCheck={false}
              />
            </label>
          )}
          <div className="credential-note">
            <ShieldCheck size={15} />
            <span>敏感环境变量和请求头由安装版写入系统安全存储；再次编辑时仅回显掩码值。这里的服务只属于学术 Agent，不读取系统或其他应用的 MCP 配置。</span>
          </div>
          <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>启用此服务</strong><small>Agent 只会调用已启用且连接正常的服务</small></span></label>
          {selected && (selected.tools.length > 0 || selected.resources.length > 0) && (
            <section className="capability-list">
              {selected.tools.length > 0 && (
                <>
                  <h3>可用工具</h3>
                  {selected.tools.map((tool) => {
                    const key = `tool:${tool.name}`
                    const isOpen = activeToolName === tool.name
                    return (
                      <div className="capability-item" key={tool.name}>
                        <span className="capability-icon"><PlugZap size={14} /></span>
                        <p><strong>{tool.name}</strong><small>{tool.description || '未提供描述'}</small></p>
                        <button
                          type="button"
                          className="capability-action"
                          onClick={() => {
                            setActiveToolName(isOpen ? undefined : tool.name)
                            setToolArgs('{}')
                            setCapabilityResult(undefined)
                          }}
                        >
                          {isOpen ? '收起' : '调用'}
                        </button>
                        {isOpen && (
                          <div className="capability-runner">
                            <label>
                              <span>JSON 参数</span>
                              <textarea
                                value={toolArgs}
                                onChange={(event) => setToolArgs(event.target.value)}
                                spellCheck={false}
                                aria-label={`${tool.name} 的 JSON 参数`}
                              />
                            </label>
                            <div className="capability-runner-actions">
                              <small>参数必须是 JSON 对象</small>
                              <button
                                type="button"
                                className="primary-button compact"
                                onClick={() => callTool(tool.name)}
                                disabled={Boolean(capabilityBusy)}
                              >
                                {capabilityBusy === key ? <LoaderCircle size={14} className="spin" /> : <PlugZap size={14} />}
                                执行工具
                              </button>
                            </div>
                            {capabilityResult?.key === key && (
                              <CapabilityOutput result={capabilityResult} />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {selected.resources.length > 0 && (
                <>
                  <h3 className="capability-subheading">可用资源</h3>
                  {selected.resources.map((resource) => {
                    const key = `resource:${resource.uri}`
                    return (
                      <div className="capability-item" key={resource.uri}>
                        <span className="capability-icon"><Database size={14} /></span>
                        <p><strong>{resource.name}</strong><small>{resource.description || resource.uri}</small></p>
                        <button
                          type="button"
                          className="capability-action"
                          onClick={() => readResource(resource.uri)}
                          disabled={Boolean(capabilityBusy)}
                        >
                          {capabilityBusy === key ? <LoaderCircle size={14} className="spin" /> : null}
                          读取
                        </button>
                        {capabilityResult?.key === key && (
                          <div className="capability-inline-output">
                            <CapabilityOutput result={capabilityResult} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </section>
          )}
          <div className="settings-form-actions">
            {selected && <button type="button" className="danger-button" onClick={async () => { await paperAgent.mcp.delete(selected.id); setSelectedId('new'); await onRefresh(); onToast('MCP 服务已删除') }}><Trash2 size={15} /> 删除</button>}
            <span />
            <button type="button" className="secondary-button" onClick={test} disabled={Boolean(busy)}>{busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <Activity size={15} />} 测试连接</button>
            <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} 保存服务</button>
          </div>
        </form>
      </main>
    </div>
  )
}
