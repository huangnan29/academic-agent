export const voiceApi: Window['paperAgent']['voice'] = {
  async status() {
    return {
      available: false,
      authorization: 'unsupported' as const,
      locale: 'zh-CN',
      onDevice: false,
      message: '浏览器演示不提供 macOS 原生语音识别。',
    }
  },
  async start() {
    throw new Error('浏览器演示无法使用 macOS 原生语音识别，请打开桌面应用。')
  },
  async stop() {},
  onEvent() {
    return () => undefined
  },
}
