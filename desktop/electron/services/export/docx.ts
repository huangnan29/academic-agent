import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import type { WorkspaceState } from '../../../shared/contracts'
import {
  createExportDocumentModel,
  formatReference,
  type ExportDocumentModel,
} from './document-model'

const BODY_FONT = 'Songti SC'

export async function exportDocx(state: WorkspaceState, projectId: string): Promise<Buffer> {
  const model = createExportDocumentModel(state, projectId)
  const document = buildDocxDocument(model)
  const packed = await Packer.toBuffer(document)
  return Buffer.from(packed)
}

export const buildDocxBuffer = exportDocx

function buildDocxDocument(model: ExportDocumentModel): Document {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      spacing: { after: 480 },
      children: [
        new TextRun({
          text: model.project.title,
          bold: true,
          size: 36,
          font: BODY_FONT,
        }),
      ],
    }),
  ]

  for (const section of model.sections) {
    children.push(
      new Paragraph({
        heading: headingLevel(section.level),
        spacing: { before: 320, after: 160 },
        children: [new TextRun({ text: section.title, bold: true, font: BODY_FONT })],
      }),
      ...markdownParagraphs(section.content),
    )
  }

  if (model.references.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 160 },
        children: [new TextRun({ text: '参考文献', bold: true, font: BODY_FONT })],
      }),
      ...model.references.map(
        (reference) =>
          new Paragraph({
            spacing: { after: 100, line: 360 },
            children: [new TextRun({ text: formatReference(reference), size: 21, font: BODY_FONT })],
          }),
      ),
      new Paragraph({
        spacing: { before: 160, after: 160 },
        children: [
          new TextRun({
            text: '核验说明：文献元数据核验不等于正文观点已得到全文核验；“仅摘要可用”和“未核验”条目需要人工复核。',
            italics: true,
            size: 19,
            font: BODY_FONT,
          }),
        ],
      }),
    )
  }

  if (model.unresolvedMarkers.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '导出核验提示', bold: true, font: BODY_FONT })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `以下引用标记尚未映射，不能视为已核验引用：${model.unresolvedMarkers.join('、')}`,
            color: 'A13D2D',
            font: BODY_FONT,
          }),
        ],
      }),
    )
  }

  return new Document({
    creator: '学术 Agent',
    title: model.project.title,
    description: '由学术 Agent 在本机导出的论文文稿',
    sections: [{ properties: {}, children }],
  })
}

function markdownParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [] }))
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      paragraphs.push(
        new Paragraph({
          heading: headingLevel(Math.min(3, heading[1].length) as 1 | 2 | 3),
          spacing: { before: 260, after: 120 },
          children: inlineRuns(heading[2], true),
        }),
      )
      continue
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(line)
    if (bullet) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80, line: 360 },
          children: inlineRuns(bullet[1]),
        }),
      )
      continue
    }

    const numbered = /^(\d+[.)、])\s*(.+)$/.exec(line)
    const quote = /^>\s*(.+)$/.exec(line)
    const text = numbered ? `${numbered[1]} ${numbered[2]}` : quote?.[1] ?? line
    paragraphs.push(
      new Paragraph({
        indent: quote ? { left: 420 } : { firstLine: 480 },
        spacing: { after: 120, line: 360 },
        children: inlineRuns(text, false, Boolean(quote)),
      }),
    )
  }
  return paragraphs
}

function inlineRuns(text: string, forceBold = false, forceItalics = false): TextRun[] {
  const runs: TextRun[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) {
      runs.push(
        new TextRun({
          text: text.slice(cursor, index),
          bold: forceBold,
          italics: forceItalics,
          size: 24,
          font: BODY_FONT,
        }),
      )
    }

    const token = match[0]
    const isBold = token.startsWith('**')
    const isCode = token.startsWith('`')
    const clean = token.replace(/^\*\*|\*\*$|^[*`]|[*`]$/g, '')
    runs.push(
      new TextRun({
        text: clean,
        bold: forceBold || isBold,
        italics: forceItalics || (!isBold && !isCode),
        font: isCode ? 'Menlo' : BODY_FONT,
        shading: isCode ? { fill: 'F2F2F2' } : undefined,
        size: isCode ? 21 : 24,
      }),
    )
    cursor = index + token.length
  }

  if (cursor < text.length || runs.length === 0) {
    runs.push(
      new TextRun({
        text: text.slice(cursor),
        bold: forceBold,
        italics: forceItalics,
        size: 24,
        font: BODY_FONT,
      }),
    )
  }
  return runs
}

function headingLevel(level: 1 | 2 | 3): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level === 1) return HeadingLevel.HEADING_1
  if (level === 2) return HeadingLevel.HEADING_2
  return HeadingLevel.HEADING_3
}
