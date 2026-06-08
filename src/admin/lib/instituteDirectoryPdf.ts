import { jsPDF } from 'jspdf'
import { compareInstituteId } from './instituteSort'
import {
  computeDistrictAdminStats,
  resolvePortalDistrictName,
  type DistrictAdminStats,
} from './portalDistricts'
import { downloadJsPdf, pdfAutoTable, pdfLastAutoTableFinalY } from './pdfDownload'

export type DirectoryInstituteRow = {
  id: string
  institute_code?: string | null
  name?: string | null
  city?: string | null
  pincode?: string | null
  state?: string | null
  is_active?: boolean | null
  studentCount?: number | null
}

export type DirectoryAdminInvite = {
  full_name?: string | null
  phone?: string | null
  email?: string | null
  claimed?: boolean | null
}

type AdminAccessKind = 'pending' | 'password_set' | 'no_invite'

function adminAccessKind(
  instituteId: string,
  invites: Record<string, DirectoryAdminInvite | null | undefined>,
): AdminAccessKind {
  const inv = invites[instituteId]
  if (!inv) return 'no_invite'
  return inv.claimed ? 'password_set' : 'pending'
}

function adminAccessLabel(kind: AdminAccessKind): string {
  if (kind === 'password_set') return 'Password set in app'
  if (kind === 'pending') return 'Pending password setup'
  return 'No admin invite'
}

export type DirectorySummaryStats = {
  total: number
  active: number
  inactive: number
  pendingPassword: number
  passwordSetInApp: number
  noAdminInvite: number
}

export function computeDirectorySummaryStats(
  institutes: readonly DirectoryInstituteRow[],
  invites: Record<string, DirectoryAdminInvite | null | undefined>,
): DirectorySummaryStats {
  let active = 0
  let pendingPassword = 0
  let passwordSetInApp = 0
  let noAdminInvite = 0
  for (const r of institutes) {
    if (r.is_active !== false) active += 1
    const kind = adminAccessKind(r.id, invites)
    if (kind === 'no_invite') noAdminInvite += 1
    else if (kind === 'password_set') passwordSetInApp += 1
    else pendingPassword += 1
  }
  return {
    total: institutes.length,
    active,
    inactive: institutes.length - active,
    pendingPassword,
    passwordSetInApp,
    noAdminInvite,
  }
}

function instituteDetailRow(
  r: DirectoryInstituteRow,
  invites: Record<string, DirectoryAdminInvite | null | undefined>,
  index: number,
): string[] {
  const inv = invites[r.id]
  const kind = adminAccessKind(r.id, invites)
  return [
    String(index + 1),
    r.id,
    r.institute_code ?? '—',
    r.name ?? '—',
    resolvePortalDistrictName(r) ?? 'Unassigned',
    r.city ?? '—',
    r.pincode ?? '—',
    r.state ?? '—',
    r.is_active !== false ? 'Active' : 'Inactive',
    String(r.studentCount ?? 0),
    adminAccessLabel(kind),
    inv?.full_name?.trim() || '—',
    inv?.phone?.trim() || '—',
    inv?.email?.trim() || '—',
  ]
}

const DETAIL_HEAD = [
  'Sr',
  'Institute ID',
  'Code',
  'Name',
  'District',
  'City',
  'Pincode',
  'State',
  'Status',
  'Total Students',
  'Admin access',
  'Admin name',
  'Phone',
  'Email',
]

const TABLE_THEME = {
  theme: 'grid' as const,
  headStyles: {
    fillColor: [0, 48, 135] as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 7,
    halign: 'center' as const,
    valign: 'middle' as const,
  },
  bodyStyles: {
    fontSize: 6,
    textColor: [50, 50, 50] as [number, number, number],
  },
  alternateRowStyles: {
    fillColor: [237, 245, 255] as [number, number, number],
  },
  styles: {
    overflow: 'linebreak' as const,
    cellPadding: 1.2,
    halign: 'left' as const,
  },
  columnStyles: {
    0: { halign: 'center' as const, cellWidth: 8 },
    1: { cellWidth: 15 },
    2: { cellWidth: 12 },
    3: { cellWidth: 35 },
    4: { cellWidth: 18 },
    5: { cellWidth: 10 },
    6: { cellWidth: 12 },
    7: { cellWidth: 12 },
    8: { cellWidth: 10 },
    9: { cellWidth: 12 },
    10: { cellWidth: 14 },
    11: { cellWidth: 14 },
    12: { cellWidth: 20 },
  },
}

function addSectionTable(
  doc: jsPDF,
  startY: number,
  title: string,
  head: string[][],
  body: string[][],
  margin: number,
): number {
  const pageH = doc.internal.pageSize.getHeight()
  let y = startY
  if (y > pageH - 40) {
    doc.addPage()
    y = margin
  }
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(title, margin, y)
  y += 5
  pdfAutoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head,
    body,
    ...TABLE_THEME,
  })
  return (pdfLastAutoTableFinalY(doc) ?? y) + 8
}

function addSummarySection(
  doc: jsPDF,
  margin: number,
  scopeLabel: string,
  stats: DirectorySummaryStats,
  generatedAt: Date,
): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const centerX = pageWidth / 2

  // Add subtle header background
  doc.setFillColor(0, 48, 135)
  doc.rect(0, 0, pageWidth, 30, 'F')

  // Add logo placeholder on left (you can replace with actual image path)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('MSCE', margin, 12)

  // Center heading
  doc.setFontSize(16)
  doc.text('MSCE INSTITUTE REPORT', centerX, 12, { align: 'center' })

  // Right side text
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('GOVERNMENT OF MAHARASHTRA', pageWidth - margin - 30, 10, { align: 'right', maxWidth: 30 })

  // Reset to black text
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('ATTENDANCE APP REPORT OF INSTITUTES', margin, 35)

  // Date and time on left
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date & Time: ${generatedAt.toLocaleString('en-IN')}`, margin, 42)
  doc.text(`Scope: ${scopeLabel}`, margin, 48)

  const summaryBody = [
    ['Total institutes', String(stats.total)],
    ['Active institutes', String(stats.active)],
    ['Inactive institutes', String(stats.inactive)],
    ['Pending password setup (remaining)', String(stats.pendingPassword)],
    ['Password set in app (completed)', String(stats.passwordSetInApp)],
    ['No admin invite', String(stats.noAdminInvite)],
    [
      'Completion rate (password set / with invite)',
      stats.pendingPassword + stats.passwordSetInApp > 0
        ? `${((stats.passwordSetInApp / (stats.pendingPassword + stats.passwordSetInApp)) * 100).toFixed(1)}%`
        : '—',
    ],
  ]

  pdfAutoTable(doc, {
    startY: 54,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Count']],
    body: summaryBody,
    ...TABLE_THEME,
    columnStyles: {
      0: { cellWidth: 85, halign: 'left' },
      1: { cellWidth: 35, halign: 'right' },
    },
  })

  return (pdfLastAutoTableFinalY(doc) ?? 54) + 10
}

function districtStatsBody(rows: DistrictAdminStats[]): string[][] {
  const body = rows.map((d) => [
    d.district,
    d.prefixes,
    String(d.total),
    String(d.active),
    String(d.inactive),
    String(d.pendingPassword),
    String(d.passwordSetInApp),
    String(d.noAdminInvite),
  ])
  const totals = rows.reduce(
    (acc, d) => {
      acc.total += d.total
      acc.active += d.active
      acc.inactive += d.inactive
      acc.pendingPassword += d.pendingPassword
      acc.passwordSetInApp += d.passwordSetInApp
      acc.noAdminInvite += d.noAdminInvite
      return acc
    },
    {
      total: 0,
      active: 0,
      inactive: 0,
      pendingPassword: 0,
      passwordSetInApp: 0,
      noAdminInvite: 0,
    },
  )
  body.push([
    'TOTAL',
    '',
    String(totals.total),
    String(totals.active),
    String(totals.inactive),
    String(totals.pendingPassword),
    String(totals.passwordSetInApp),
    String(totals.noAdminInvite),
  ])
  return body
}

export function instituteDirectoryPdfFileName(scopeLabel: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  const safe = scopeLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'All_Districts'
  return `Institute_Directory_${safe}_${stamp}.pdf`
}

export function downloadInstituteDirectoryPdf(options: {
  scopeLabel: string
  /** Institutes in the current directory scope (district filter applied). */
  scopeInstitutes: DirectoryInstituteRow[]
  /** All loaded institutes — used for statewide district-wise table. */
  allInstitutes: DirectoryInstituteRow[]
  invitesByInstituteId: Record<string, DirectoryAdminInvite | null | undefined>
  generatedAt?: Date
}): void {
  const { scopeLabel, scopeInstitutes, allInstitutes, invitesByInstituteId } = options
  const generatedAt = options.generatedAt ?? new Date()
  const sortedScope = [...scopeInstitutes].sort((a, b) => compareInstituteId(a.id, b.id))

  const scopeStats = computeDirectorySummaryStats(sortedScope, invitesByInstituteId)
  const districtRows = computeDistrictAdminStats(allInstitutes, invitesByInstituteId)

  const pending = sortedScope.filter((r) => adminAccessKind(r.id, invitesByInstituteId) === 'pending')
  const completed = sortedScope.filter((r) => adminAccessKind(r.id, invitesByInstituteId) === 'password_set')
  const noInvite = sortedScope.filter((r) => adminAccessKind(r.id, invitesByInstituteId) === 'no_invite')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margin = 10

  let y = addSummarySection(doc, margin, scopeLabel, scopeStats, generatedAt)

  y = addSectionTable(
    doc,
    y,
    'District-wise summary (all loaded institutes)',
    [
      [
        'District',
        'ID prefixes',
        'Total',
        'Active',
        'Inactive',
        'Pending setup',
        'Password set',
        'No invite',
      ],
    ],
    districtStatsBody(districtRows),
    margin,
  )

  if (scopeLabel !== 'All districts') {
    const scopeDistrictRows = computeDistrictAdminStats(sortedScope, invitesByInstituteId)
    y = addSectionTable(
      doc,
      y,
      `District-wise summary (${scopeLabel} scope only)`,
      [
        [
          'District',
          'ID prefixes',
          'Total',
          'Active',
          'Inactive',
          'Pending setup',
          'Password set',
          'No invite',
        ],
      ],
      districtStatsBody(scopeDistrictRows),
      margin,
    )
  }

  y = addSectionTable(
    doc,
    y,
    `Pending password setup — ${pending.length.toLocaleString('en-IN')} institute(s)`,
    [DETAIL_HEAD],
    pending.map((r, i) => instituteDetailRow(r, invitesByInstituteId, i)),
    margin,
  )

  y = addSectionTable(
    doc,
    y,
    `Password set in app — ${completed.length.toLocaleString('en-IN')} institute(s)`,
    [DETAIL_HEAD],
    completed.map((r, i) => instituteDetailRow(r, invitesByInstituteId, i)),
    margin,
  )

  if (noInvite.length > 0) {
    addSectionTable(
      doc,
      y,
      `No admin invite — ${noInvite.length.toLocaleString('en-IN')} institute(s)`,
      [DETAIL_HEAD],
      noInvite.map((r, i) => instituteDetailRow(r, invitesByInstituteId, i)),
      margin,
    )
  }

  downloadJsPdf(doc, instituteDirectoryPdfFileName(scopeLabel, generatedAt))
}
