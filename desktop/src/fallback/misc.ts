import { readState } from './state'

export const exportApi: Window['paperAgent']['export'] = {
  async project(projectId, format) {
    const project = readState().projects.find((item) => item.id === projectId)
    if (!project) return null
    const content = `# ${project.title}\n\n此文件由浏览器演示模式生成，不包含真实模型或文献检索结果。`
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${project.title}.${format === 'md' ? 'md' : 'txt'}`
    anchor.click()
    URL.revokeObjectURL(url)
    return null
  },
  async reveal() {},
}

export const externalApi: Window['paperAgent']['external'] = {
  async open(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}

export const appApi: Window['paperAgent']['app'] = {
  async info() {
    return { version: 'browser-demo', platform: navigator.platform, packaged: false }
  },
}
