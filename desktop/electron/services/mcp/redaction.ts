import type { McpServerConfig } from '../../../shared/contracts.js'

import { SENSITIVE_NAME_PATTERN } from './constants.js'

export function safeEndpoint(config: McpServerConfig): string {
  if (config.transport.type === 'stdio') return config.name
  try {
    const url = new URL(config.transport.url)
    url.search = ''
    url.hash = ''
    return `${url.origin}${url.pathname}`
  } catch {
    return config.name
  }
}

function secretValues(config: McpServerConfig): string[] {
  if (config.transport.type === 'stdio') {
    return Object.entries(config.transport.env ?? {})
      .filter(([name]) => SENSITIVE_NAME_PATTERN.test(name))
      .map(([, value]) => value)
      .filter((value) => value.length >= 4)
  }

  const values = Object.values(config.transport.headers ?? {}).filter((value) => value.length >= 4)
  try {
    const url = new URL(config.transport.url)
    for (const [name, value] of url.searchParams) {
      if (SENSITIVE_NAME_PATTERN.test(name) && value.length >= 4) {
        values.push(value)
      }
    }
  } catch {
    // 地址已在保存时校验；这里只做防御性处理。
  }
  return values
}

export function redactDiagnostic(value: string, config: McpServerConfig): string {
  let result = value
  for (const secret of secretValues(config)) {
    result = result.split(secret).join('[已隐藏]')
  }

  if (config.transport.type === 'streamable-http') {
    result = result.split(config.transport.url).join(safeEndpoint(config))
  }

  return result
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [已隐藏]')
    .replace(/((?:api[-_ ]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200)
}

export function describeConnectionError(
  error: unknown,
  config: McpServerConfig,
  stderrText = '',
): string {
  const rawMessage = error instanceof Error ? error.message : '未知错误'
  const message = redactDiagnostic(rawMessage, config)
  const endpoint = safeEndpoint(config)
  let description: string

  if (/ENOENT|not found|cannot find/i.test(message)) {
    description = `无法启动 MCP 服务“${config.name}”：找不到启动命令`
  } else if (/timed?\s*out|timeout|RequestTimeout/i.test(message)) {
    description = `连接 MCP 服务“${config.name}”超时`
  } else if (/401|403|unauthorized|forbidden/i.test(message)) {
    description = `MCP 服务“${config.name}”拒绝访问，请检查凭证或权限`
  } else if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    description = `无法连接 MCP 服务“${config.name}”（${endpoint}）：${message}`
  } else {
    description = `MCP 服务“${config.name}”连接失败：${message || '未知错误'}`
  }

  const stderr = redactDiagnostic(stderrText, config)
  return stderr ? `${description}；服务进程输出：${stderr}` : description
}

export function describeOperationError(
  error: unknown,
  config: McpServerConfig,
  operation: string,
): string {
  const rawMessage = error instanceof Error ? error.message : ''
  const message = redactDiagnostic(rawMessage, config)

  if (/timed?\s*out|timeout|RequestTimeout|操作超过/i.test(message)) {
    return `${operation}超时，请稍后重试`
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return `${operation}失败：服务拒绝访问，请检查凭证或权限`
  }
  if (/ECONNREFUSED/i.test(message)) {
    return `${operation}失败：无法连接 ${safeEndpoint(config)}`
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return `${operation}失败：无法解析服务地址 ${safeEndpoint(config)}`
  }
  if (/fetch failed|network|socket|connection.*closed|transport.*closed/i.test(message)) {
    return `${operation}失败：MCP 网络连接已中断`
  }
  if (/-32601|method not found|not supported/i.test(message)) {
    return `${operation}失败：MCP 服务未提供该能力`
  }
  if (/-32602|invalid params|invalid arguments/i.test(message)) {
    return `${operation}失败：MCP 服务拒绝了请求参数`
  }

  // 服务端异常可能回显工具参数或资源内容，因此未知错误不透传原始详情。
  return `${operation}失败：MCP 服务返回错误，原始详情已隐藏`
}
