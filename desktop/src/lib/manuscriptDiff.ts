// 章节编辑态的逐行差异计算；从 App.tsx 抽出。
export type ManuscriptDiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** 编辑时生成有界的逐行差异，避免大稿件让渲染线程承担无上限计算。 */
export function buildManuscriptDiff(original: string, next: string): ManuscriptDiffLine[] {
  const left = original.split('\n').slice(0, 240)
  const right = next.split('\n').slice(0, 240)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const lines: ManuscriptDiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', text: left[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: left[i++] })
    } else {
      lines.push({ kind: 'added', text: right[j++] })
    }
  }
  while (i < left.length) lines.push({ kind: 'removed', text: left[i++] })
  while (j < right.length) lines.push({ kind: 'added', text: right[j++] })
  return lines
}
