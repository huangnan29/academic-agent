// 对话标题展示与手动排序的辅助函数；从 App.tsx 抽出。
export function conversationDisplayTitle(title: string, projectTitle: string): string {
  return ['新的研究任务', projectTitle].includes(title) ? '研究对话' : title
}

export function moveIdBefore(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids
  const next = ids.filter((id) => id !== draggedId)
  const index = next.indexOf(targetId)
  next.splice(index < 0 ? next.length : index, 0, draggedId)
  return next
}
