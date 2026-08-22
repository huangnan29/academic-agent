import type { ChatStreamEvent, SectionStreamEvent } from '../../shared/contracts'

const listeners = new Set<(event: ChatStreamEvent) => void>()
const sectionListeners = new Set<(event: SectionStreamEvent) => void>()

export const chatTimers = new Map<string, number[]>()

export function emit(event: ChatStreamEvent): void {
  listeners.forEach((listener) => listener(event))
}

export function emitSection(event: SectionStreamEvent): void {
  sectionListeners.forEach((listener) => listener(event))
}

export function subscribeChat(listener: (event: ChatStreamEvent) => void): () => boolean {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function subscribeSection(listener: (event: SectionStreamEvent) => void): () => boolean {
  sectionListeners.add(listener)
  return () => sectionListeners.delete(listener)
}
