const secretPatterns = [
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /(api[-_ ]?key["'=:\s]+)[^\s,"'}]+/gi,
  /(authorization["'=:\s]+)[^\s,"'}]+/gi,
  /(token["'=:\s]+)[^\s,"'}]+/gi,
]

export function redactSecrets(value: string): string {
  return secretPatterns.reduce((result, pattern) => result.replace(pattern, '$1[已隐藏]'), value)
}
export function toUserMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  if (!(error instanceof Error)) return fallback
  const message = redactSecrets(error.message).trim()
  return message && message.length <= 600 ? message : fallback
}
