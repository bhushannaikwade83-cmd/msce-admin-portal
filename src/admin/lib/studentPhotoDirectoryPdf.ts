import jsPDF from 'jspdf'

export type StudentForPdf = {
  id: string
  name?: string | null
  roll_no?: string | null
  class_name?: string | null
  section?: string | null
  subjects?: string[] | string | null
  photo_url?: string | null
  face_photo_url?: string | null
  registration_photo_path?: string | null
}

export type InstituteForPdf = {
  id: string
  name?: string | null
  institute_code?: string | null
  city?: string | null
  state?: string | null
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return null
}

function subjectsDisplay(subjects: unknown): string {
  if (Array.isArray(subjects)) return subjects.join(', ')
  if (typeof subjects === 'string') return subjects
  return '—'
}


export async function generateStudentPhotoDirectoryPdf(
  institute: InstituteForPdf,
  students: StudentForPdf[],
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin

  let yPos = margin

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('STUDENT PHOTO DIRECTORY', margin, yPos as any)
  yPos += 10

  // Institute Details
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const instName = String(institute.name || 'Institute')
  doc.text(instName, margin, yPos as any)
  yPos += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const instDetails = [
    institute.institute_code ? `Code: ${institute.institute_code}` : '',
    institute.city ? `City: ${institute.city}` : '',
    institute.state ? `State: ${institute.state}` : '',
    `Generated: ${new Date().toLocaleDateString('en-IN')}`,
  ]
    .filter(Boolean)
    .join(' | ')

  doc.text(instDetails, margin, yPos as any)
  yPos += 8

  // Students count
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const countText = `Total Students: ${students.length}`
  doc.text(countText, margin, yPos as any)
  yPos += 8

  // Divider line
  doc.setDrawColor(200)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 5

  // Students list
  const photoSize = 20 // mm
  const lineHeight = photoSize + 4

  for (let i = 0; i < students.length; i++) {
    const student = students[i]
    const studentName = pick(student, 'name', 'student_name', 'full_name') || '—'
    const roll = pick(student, 'sr_no', 'user_id', 'roll_no', 'roll_number', 'rollno') || '—'
    const cls = pick(student, 'class_name', 'class', 'grade') || '—'
    const subs = subjectsDisplay(student.subjects)

    // Check if we need new page
    if (yPos + lineHeight > pageHeight - margin) {
      doc.addPage()
      yPos = margin
    }


    // Photo box with initials
    const colors = ['#003087', '#FF6600', '#138808', '#7B1FA2', '#0288D1', '#D32F2F', '#795548', '#F57C00']
    const colorIndex = i % colors.length
    const colorHex = colors[colorIndex]
    const [r, g, b] = [
      parseInt(colorHex.slice(1, 3), 16),
      parseInt(colorHex.slice(3, 5), 16),
      parseInt(colorHex.slice(5, 7), 16),
    ]

    // Colored background
    doc.setFillColor(r, g, b)
    doc.rect(margin, yPos, photoSize, photoSize, 'F')

    // Border
    doc.setDrawColor(150)
    doc.rect(margin, yPos, photoSize, photoSize)

    // Initials text
    const initials = String(studentName)
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(initials, margin + photoSize / 2, yPos + photoSize / 2 + 1.5, { align: 'center' })
    doc.setTextColor(0, 0, 0)

    // Student details
    const detailsX = margin + photoSize + 5
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    const nameText = String(studentName)
    doc.text(nameText, detailsX, yPos + 5 as any)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const rollText = `Roll: ${roll}`
    const clsText = `Class: ${cls}`
    doc.text(rollText, detailsX, yPos + 10 as any)
    doc.text(clsText, detailsX, yPos + 14 as any)

    // Subjects with text wrapping
    const subjectLines = doc.splitTextToSize(`Subjects: ${subs}`, contentWidth - (photoSize + 10))
    doc.text(subjectLines, detailsX, yPos + 18 as any)

    // Divider
    doc.setDrawColor(230)
    doc.line(margin, yPos + photoSize + 2, pageWidth - margin, yPos + photoSize + 2)

    yPos += lineHeight
  }

  // Save PDF
  const fileName = `${institute.institute_code || institute.id}_students_photodirectory.pdf`
  doc.save(fileName)
}
