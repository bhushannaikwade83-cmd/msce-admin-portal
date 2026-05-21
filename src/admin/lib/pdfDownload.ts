import { jsPDF } from 'jspdf'
import { applyPlugin, autoTable, type UserOptions } from 'jspdf-autotable'

/** Register autoTable on jsPDF instances (required for `doc.autoTable` in bundled apps). */
applyPlugin(jsPDF)

type JsPdfWithAutoTable = jsPDF & {
  autoTable?: (options: UserOptions) => void
  lastAutoTable?: { finalY: number }
}

/** Trigger a file download in the browser (more reliable than `doc.save()` alone). */
export function downloadJsPdf(doc: jsPDF, filename: string): void {
  const safe = filename.replace(/[^\w.\-]+/g, '_') || 'report.pdf'
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safe
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function pdfAutoTable(doc: jsPDF, options: UserOptions): void {
  const d = doc as JsPdfWithAutoTable
  if (typeof d.autoTable === 'function') {
    d.autoTable(options)
    return
  }
  autoTable(doc, options)
}

export function pdfLastAutoTableFinalY(doc: jsPDF): number | undefined {
  return (doc as JsPdfWithAutoTable).lastAutoTable?.finalY
}
