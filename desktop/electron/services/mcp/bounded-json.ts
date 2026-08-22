import { MAX_JSON_DEPTH } from './constants.js'
import { McpManagerError } from './errors.js'
import { isPlainRecord } from './validation.js'

function formatByteLimit(bytes: number): string {
  if (bytes >= 1_024 * 1_024) return `${bytes / (1_024 * 1_024)} MiB`
  return `${Math.ceil(bytes / 1_024)} KiB`
}

export function cloneBoundedJson<T>(
  value: unknown,
  label: string,
  maxBytes: number,
  serverId: string,
  invalidCode: string,
  tooLargeCode: string,
): T {
  let estimatedBytes = 0
  const ancestors = new WeakSet<object>()

  const addEstimatedBytes = (amount: number): void => {
    estimatedBytes += amount
    if (estimatedBytes > maxBytes) {
      throw new McpManagerError(
        tooLargeCode,
        `${label}超过安全上限 ${formatByteLimit(maxBytes)}`,
        serverId,
      )
    }
  }

  const inspect = (current: unknown, depth: number): void => {
    if (depth > MAX_JSON_DEPTH) {
      throw new McpManagerError(
        invalidCode,
        `${label}的嵌套层级超过 ${MAX_JSON_DEPTH} 层`,
        serverId,
      )
    }

    if (current === null) {
      addEstimatedBytes(4)
      return
    }
    if (typeof current === 'string') {
      addEstimatedBytes(Buffer.byteLength(current, 'utf8') + 2)
      return
    }
    if (typeof current === 'boolean') {
      addEstimatedBytes(current ? 4 : 5)
      return
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new McpManagerError(invalidCode, `${label}包含无效数字`, serverId)
      }
      addEstimatedBytes(32)
      return
    }
    if (typeof current !== 'object') {
      throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
    }
    if (ancestors.has(current)) {
      throw new McpManagerError(invalidCode, `${label}不能包含循环引用`, serverId)
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        addEstimatedBytes(current.length + 2)
        for (const item of current) inspect(item, depth + 1)
        return
      }
      if (!isPlainRecord(current) || Object.getOwnPropertySymbols(current).length > 0) {
        throw new McpManagerError(invalidCode, `${label}必须由普通 JSON 对象组成`, serverId)
      }

      addEstimatedBytes(2)
      for (const [key, item] of Object.entries(current)) {
        addEstimatedBytes(Buffer.byteLength(key, 'utf8') + 4)
        inspect(item, depth + 1)
      }
    } finally {
      ancestors.delete(current)
    }
  }

  try {
    inspect(value, 0)
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
    }
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new McpManagerError(
        tooLargeCode,
        `${label}超过安全上限 ${formatByteLimit(maxBytes)}`,
        serverId,
      )
    }
    return JSON.parse(serialized) as T
  } catch (error) {
    if (error instanceof McpManagerError) throw error
    // 不附带原始异常，避免 getter 或自定义对象把敏感内容带入错误链。
    throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
  }
}

export function cloneToolInputSchema(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) return undefined
  try {
    return cloneBoundedJson<Record<string, unknown>>(
      value,
      'MCP 工具输入结构',
      64 * 1_024,
      'discovery',
      'MCP_INVALID_TOOL_SCHEMA',
      'MCP_TOOL_SCHEMA_TOO_LARGE',
    )
  } catch {
    // 单个服务返回异常 schema 时仍保留工具名称与说明，但不允许自动推断参数。
    return undefined
  }
}
