// 输入框右下角的模型选择器；从 App.tsx 抽出。
import { Bot, Check, ChevronDown, Settings, X } from 'lucide-react'
import { useEffect } from 'react'
import type { ProviderProfile } from '../../shared/contracts'

export function ModelPicker({
  providers,
  activeProviderId,
  activeModel,
  open,
  onToggle,
  onSelect,
  onSettings,
}: {
  providers: ProviderProfile[]
  activeProviderId?: string
  activeModel?: string
  open: boolean
  onToggle: () => void
  onSelect: (providerId: string, model: string) => void
  onSettings: () => void
}) {
  const provider = providers.find((item) => item.id === activeProviderId)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onToggle])

  return (
    <div className="model-picker">
      <button type="button" className="model-picker-trigger" onClick={onToggle} aria-expanded={open} aria-haspopup="menu">
        <span className={`connection-dot ${provider?.lastHealth === 'connected' ? 'is-connected' : ''}`} />
        <span className="model-picker-label">
          <strong>{activeModel ?? '选择模型'}</strong>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="model-menu" role="menu">
          <div className="model-menu-head">
            <strong>选择下一条消息使用的模型</strong>
            <button type="button" onClick={onToggle} aria-label="关闭模型菜单">
              <X size={15} />
            </button>
          </div>
          <div className="model-menu-list">
            {providers.filter((item) => item.enabled && (item.lastHealth === 'connected' || item.origin === 'demo')).map((item) => (
              <div className="model-provider-group" key={item.id} role="group" aria-label={item.name}>
                <span>{item.name}</span>
                {item.models.map((model) => {
                  const selected = item.id === activeProviderId && model === activeModel
                  return (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      key={model}
                      className={selected ? 'is-selected' : ''}
                      onClick={() => onSelect(item.id, model)}
                    >
                      <Bot size={15} />
                      <span>{model}</span>
                      {selected && <Check size={15} />}
                    </button>
                  )
                })}
              </div>
            ))}
            {providers.filter((item) => item.enabled && (item.lastHealth === 'connected' || item.origin === 'demo')).length === 0 && <p className="menu-empty">没有已测试可用的模型</p>}
          </div>
          <button type="button" role="menuitem" className="model-settings-link" onClick={onSettings}>
            <Settings size={15} /> 管理模型提供商
          </button>
        </div>
      )}
    </div>
  )
}
