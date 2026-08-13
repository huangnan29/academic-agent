import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { WorkspaceState } from '../shared/contracts'
import { runProjectQualityChecks } from '../electron/services/pipeline'

async function main() {
  const [workspacePath, projectId] = process.argv.slice(2)
  if (!workspacePath || !projectId) {
    throw new Error('用法：tsx qa/quality-smoke.ts <workspace.json> <projectId>')
  }

  const state = JSON.parse(await readFile(resolve(workspacePath), 'utf8')) as WorkspaceState
  const report = runProjectQualityChecks(state, projectId)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误'
  process.stderr.write(`质量检查失败：${message}\n`)
  process.exitCode = 1
})
