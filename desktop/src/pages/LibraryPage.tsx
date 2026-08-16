// 文献库页面：检索、按项目筛选与详情查看；从 App.tsx 抽出。
import { Folder, Library, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LiteratureRecord, WorkspaceState } from '../../shared/contracts'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../../shared/defaultMcp'
import { StatusBadge } from '../components/common'
import { LiteratureDetail } from '../components/LiteratureDetail'
import { LiteratureList } from '../components/LiteratureList'
import { paperAgent } from '../fallback'

export function LibraryPage({
  workspace,
  activeProjectId,
  initialSelected,
  onRefresh,
  onToast,
}: {
  workspace: WorkspaceState
  activeProjectId?: string
  initialSelected?: LiteratureRecord
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const mcpSources = workspace.mcpServers
    .filter((server) => server.enabled && server.tools.length > 0)
    .flatMap((server) =>
      server.tools
        .filter((tool) => /search|literature|papers/i.test(tool.name))
        .map((tool) => ({
          key: `mcp:${server.id}:${tool.name}`,
          label: server.id === DEFAULT_ARXIV_MCP_SERVER_ID
            && tool.name === DEFAULT_ARXIV_MCP_TOOL_NAME
            ? 'arXiv MCP（默认）'
            : `${server.name} / ${tool.name}`,
          serverId: server.id,
          toolName: tool.name,
        })),
    )
  const defaultArxivSource = mcpSources.find(
    (source) => source.serverId === DEFAULT_ARXIV_MCP_SERVER_ID
      && source.toolName === DEFAULT_ARXIV_MCP_TOOL_NAME,
  )
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<LiteratureRecord | undefined>(initialSelected)
  const [filter, setFilter] = useState<'all' | 'included' | 'verified' | 'pending'>('all')
  const [scopeProjectId, setScopeProjectId] = useState<string | 'all'>('all')
  const [sourceKey, setSourceKey] = useState(defaultArxivSource?.key ?? 'public')
  const sourceInitializedRef = useRef(Boolean(defaultArxivSource))

  useEffect(() => {
    if (initialSelected) setSelected(initialSelected)
  }, [initialSelected?.id])

  useEffect(() => {
    if (scopeProjectId !== 'all' && !workspace.projects.some((project) => project.id === scopeProjectId)) {
      setScopeProjectId(activeProjectId ?? 'all')
    }
  }, [scopeProjectId, activeProjectId, workspace.projects])

  useEffect(() => {
    if (sourceInitializedRef.current || !defaultArxivSource) return
    sourceInitializedRef.current = true
    setSourceKey(defaultArxivSource.key)
  }, [defaultArxivSource?.key])

  useEffect(() => {
    if (sourceKey !== 'public' && !mcpSources.some((source) => source.key === sourceKey)) {
      setSourceKey('public')
    }
  }, [sourceKey, mcpSources.map((source) => source.key).join('|')])

  const scopedRecords = workspace.literature.filter(
    (item) => scopeProjectId === 'all' || item.projectId === scopeProjectId,
  )
  const records = scopedRecords.filter((item) => {
    if (filter === 'included') return item.included
    if (filter === 'verified') return item.verificationStatus === 'verified-metadata'
    if (filter === 'pending') return item.verificationStatus !== 'verified-metadata'
    return true
  })
  const selectedScopeProject = scopeProjectId === 'all'
    ? undefined
    : workspace.projects.find((project) => project.id === scopeProjectId)
  const searchTargetProjectId = selectedScopeProject?.id ?? activeProjectId
  const searchTargetProject = workspace.projects.find((project) => project.id === searchTargetProjectId)

  useEffect(() => {
    if (selected && records.some((record) => record.id === selected.id)) return
    setSelected(records[0])
  }, [scopeProjectId, filter, workspace.literature])

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const mcpSource = mcpSources.find((source) => source.key === sourceKey)
      const results = await paperAgent.literature.search({
        projectId: searchTargetProjectId,
        query: query.trim(),
        limit: 30,
        mcp: mcpSource
          ? {
              serverId: mcpSource.serverId,
              toolName: mcpSource.toolName,
              queryArgument: 'query',
            }
          : undefined,
      })
      await onRefresh()
      setSelected(results[0])
      onToast(`已通过${mcpSource ? mcpSource.label : ' OpenAlex + Crossref'}找到 ${results.length} 条候选文献`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : '文献检索失败', 'error')
    } finally {
      setSearching(false)
    }
  }

  const toggle = async (record: LiteratureRecord, projectId: string) => {
    try {
      await paperAgent.literature.toggle(projectId, record.id, !record.included)
      await onRefresh()
    } catch (error) {
      onToast(error instanceof Error ? error.message : '更新文献失败', 'error')
    }
  }

  const removeFromProject = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.setProject({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      await onRefresh()
      onToast('已移出项目，文献仍保留在“全部文献”中')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '移出项目失败', 'error')
    }
  }

  const deleteLiterature = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.delete({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      if (selected?.id === record.id && selected?.projectId === record.projectId) setSelected(undefined)
      await onRefresh()
      onToast('文献已从本机文献库删除')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '删除文献失败', 'error')
      throw error
    }
  }

  return (
    <section className="route-page library-page">
      <header className="route-header">
        <div>
          <span className="route-kicker">本机文献库</span>
          <h1>文献检索与证据核验</h1>
          <p>区分书目信息、摘要可用性和主张支持情况，避免把“检索到”误当作“可以引用”。</p>
        </div>
        {selectedScopeProject?.origin === 'demo' && <StatusBadge status="demo">项目仍为演示状态</StatusBadge>}
      </header>
      <nav className="library-project-scopes" aria-label="按研究项目查看文献">
        <button
          type="button"
          className={scopeProjectId === 'all' ? 'is-active' : ''}
          aria-current={scopeProjectId === 'all' ? 'page' : undefined}
          onClick={() => setScopeProjectId('all')}
        >
          <Library size={14} />
          <span>全部文献</span>
          <small>{workspace.literature.length}</small>
        </button>
        {workspace.projects.map((project) => (
          <button
            type="button"
            key={project.id}
            className={scopeProjectId === project.id ? 'is-active' : ''}
            aria-current={scopeProjectId === project.id ? 'page' : undefined}
            onClick={() => setScopeProjectId(project.id)}
            title={project.title}
          >
            <Folder size={14} />
            <span>{project.title}</span>
            <small>{workspace.literature.filter((record) => record.projectId === project.id).length}</small>
          </button>
        ))}
      </nav>
      <form className="library-search" onSubmit={search}>
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词、论文标题或 DOI" />
        <select
          className="library-source-select"
          value={sourceKey}
          onChange={(event) => setSourceKey(event.target.value)}
          aria-label="选择文献来源"
        >
          <option value="public">OpenAlex + Crossref</option>
          {mcpSources.map((source) => (
            <option key={source.key} value={source.key}>{source.label}</option>
          ))}
        </select>
        <button type="submit" className="primary-button compact" disabled={!query.trim() || searching || !searchTargetProjectId}>
          {searching ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}
          {searching ? '检索中' : '检索文献'}
        </button>
      </form>
      <div className="library-search-context">
        {searchTargetProject
          ? <>检索结果保存到：<strong>{searchTargetProject.title}</strong></>
          : '请先创建或选择一个研究项目后再检索。'}
      </div>
      <div className="library-toolbar">
        <div className="filter-segment">
          {([
            ['all', '全部'],
            ['included', '已纳入'],
            ['verified', '来源已记录'],
            ['pending', '待核验'],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <span>{records.length} 条记录</span>
      </div>
      <div className="library-body">
        <main className="library-results">
          <LiteratureList
            records={records}
            projects={workspace.projects}
            activeProjectId={searchTargetProjectId}
            showProject={scopeProjectId === 'all'}
            onToggle={toggle}
            onRemove={removeFromProject}
            onDelete={deleteLiterature}
            onOpen={setSelected}
          />
        </main>
        <LiteratureDetail
          record={selected}
          project={workspace.projects.find((project) => project.id === selected?.projectId)}
          citationCount={workspace.citations.filter((citation) => (
            citation.literatureId === selected?.id
            && citation.projectId === selected?.projectId
          )).length}
          onClose={() => setSelected(undefined)}
          onOpen={(url) => paperAgent.external.open(url)}
        />
      </div>
    </section>
  )
}
