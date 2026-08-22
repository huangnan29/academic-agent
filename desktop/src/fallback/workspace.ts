import { clone, mutate, readState } from './state'

export const workspaceApi: Window['paperAgent']['workspace'] = {
  async get() {
    return clone(readState())
  },
  async setActiveModel(providerId, model) {
    const provider = readState().providers.find((item) => item.id === providerId)
    if (!provider || !provider.enabled) throw new Error('未找到可用的模型提供商')
    if (!provider.models.includes(model)) throw new Error('所选模型不在该提供商的模型列表中')

    const next = mutate((draft) => {
      draft.settings.activeProviderId = providerId
      draft.settings.activeModel = model
    })
    return clone(next)
  },
  async setSidebarPreferences(input) {
    const next = mutate((draft) => {
      if (input.viewMode) draft.settings.sidebarViewMode = input.viewMode
      if (input.chatSort) draft.settings.sidebarChatSort = input.chatSort
      if (input.expandedProjectIds) {
        const known = new Set(draft.projects.map((project) => project.id))
        draft.settings.sidebarExpandedProjectIds = [...new Set(input.expandedProjectIds)].filter((id) => known.has(id))
      }
      if (input.showArchived !== undefined) draft.settings.sidebarShowArchived = input.showArchived
      if (input.sidebarWidth !== undefined) draft.settings.sidebarWidth = input.sidebarWidth
      if (input.rightPanelWidth !== undefined) draft.settings.rightPanelWidth = input.rightPanelWidth
      if (input.projectOrder) {
        const order = new Map(input.projectOrder.map((id, index) => [id, index]))
        draft.projects.forEach((project, index) => {
          project.manualOrder = order.get(project.id) ?? input.projectOrder!.length + index
        })
      }
      if (input.conversationOrder) {
        const order = new Map(input.conversationOrder.map((id, index) => [id, index]))
        draft.conversations.forEach((conversation, index) => {
          conversation.manualOrder = order.get(conversation.id) ?? input.conversationOrder!.length + index
        })
      }
    })
    return clone(next)
  },
}
