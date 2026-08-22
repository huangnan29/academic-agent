export class McpManagerError extends Error {
  readonly code: string
  readonly serverId?: string

  constructor(code: string, message: string, serverId?: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'McpManagerError'
    this.code = code
    this.serverId = serverId
  }
}
