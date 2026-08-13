import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'

type SecretMap = Record<string, string>

export class CredentialStore {
  private secrets: SecretMap = {}
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      this.secrets = JSON.parse(await readFile(this.filePath, 'utf8')) as SecretMap
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      this.secrets = {}
    }
  }

  has(key: string): boolean {
    return Boolean(this.secrets[key])
  }

  get(key: string): string | undefined {
    const encrypted = this.secrets[key]
    if (!encrypted) return undefined
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储暂不可用，无法读取凭证。')
    }
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }

  async set(key: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全存储暂不可用，凭证未保存。')
    }
    this.secrets[key] = safeStorage.encryptString(value).toString('base64')
    await this.persist()
  }

  async delete(key: string): Promise<void> {
    delete this.secrets[key]
    await this.persist()
  }

  private async persist(): Promise<void> {
    const serialized = `${JSON.stringify(this.secrets, null, 2)}\n`
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    const operation = this.writeQueue.catch(() => undefined).then(async () => {
      await writeFile(temporary, serialized, {
        encoding: 'utf8',
        mode: 0o600,
      })
      await rename(temporary, this.filePath)
    })
    this.writeQueue = operation
    await operation
  }
}
