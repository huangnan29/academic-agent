import { pathToFileURL } from 'node:url'

/** 默认的三级大纲验收适配契约。 */
export const DEFAULT_PIPELINE_EXPORTS = {
  classifier: 'classifyResearchBrief',
  quality: 'runOutlineQualityChecks',
  generator: 'generateOutline',
}

/**
 * 载入最终 pipeline 模块；允许传入源码模块、构建产物或用户指定的适配模块。
 */
export async function loadPipelineModule(modulePath) {
  const url = modulePath.startsWith('file:')
    ? modulePath
    : pathToFileURL(modulePath).href
  const imported = await import(url)
  if (imported.default && typeof imported.default === 'object') {
    return { ...imported, ...imported.default }
  }
  return imported
}

/**
 * 创建验收适配器。
 *
 * 首选函数签名：
 * - classifyResearchBrief(brief, { evidence, literature })
 * - runOutlineQualityChecks(outline, { brief, architecture, evidence, allowedCitationIds })
 * - generateOutline(brief, { architecture, evidence, literature })（可选）
 *
 * 如果最终 pipeline 使用对象参数，可在命令行传入 --call-style object，
 * 或让一个很薄的本地适配模块把对象参数转成上述首选导出。
 */
export function createOutlinePipelineAdapter(module, options = {}) {
  const namedOptions = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  )
  const names = {
    ...DEFAULT_PIPELINE_EXPORTS,
    ...namedOptions,
  }
  const classifier = resolveExport(module, names.classifier)
  const quality = resolveExport(module, names.quality)
  const generator = resolveExport(module, names.generator, false)
  if (typeof classifier !== 'function') {
    throw new Error(`找不到分类函数导出“${names.classifier}”。`)
  }
  if (typeof quality !== 'function') {
    throw new Error(`找不到大纲质量函数导出“${names.quality}”。`)
  }

  const callStyle = namedOptions.callStyle === 'object' ? 'object' : 'positional'
  const invokeClassifier = (brief, context) => callStyle === 'object'
    ? classifier({ brief, ...context })
    : classifier(brief, context)
  const invokeQuality = (outline, context) => callStyle === 'object'
    ? quality({ outline, ...context })
    : quality(outline, context)
  const invokeGenerator = typeof generator === 'function'
    ? (brief, context) => callStyle === 'object'
      ? generator({ brief, ...context })
      : generator(brief, context)
    : undefined

  return {
    names,
    callStyle,
    hasGenerator: Boolean(invokeGenerator),
    classify: invokeClassifier,
    quality: invokeQuality,
    generate: invokeGenerator,
  }
}

function resolveExport(module, name, required = true) {
  const value = name.split('.').reduce((current, key) => current?.[key], module)
  if (required && typeof value !== 'function') return undefined
  return value
}
