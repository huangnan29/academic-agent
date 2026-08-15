import { chmod, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(desktopRoot, 'native/AcademicSpeechHelper.swift')
const output = resolve(desktopRoot, 'native/bin/academic-speech-helper')

await mkdir(dirname(output), { recursive: true })

await new Promise((resolveBuild, rejectBuild) => {
  const compiler = spawn('xcrun', [
    'swiftc',
    '-swift-version', '5',
    '-O',
    '-framework', 'Foundation',
    '-framework', 'Speech',
    '-framework', 'AVFAudio',
    source,
    '-o', output,
  ], { stdio: 'inherit' })
  compiler.once('error', rejectBuild)
  compiler.once('exit', (code) => {
    if (code === 0) resolveBuild()
    else rejectBuild(new Error(`macOS 语音辅助程序编译失败（退出码 ${code ?? '未知'}）。`))
  })
})

await chmod(output, 0o755)
