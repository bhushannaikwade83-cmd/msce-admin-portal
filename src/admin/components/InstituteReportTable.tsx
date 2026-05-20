import type { InstituteReportResult } from '../lib/instituteReport'

type Props = {
  report: InstituteReportResult
}

export function InstituteReportTable({ report }: Props) {
  const { studentRecords, totals, averages, periodText } = report

  return (
    <div className="inst-report-wrap">
      <div className="inst-report-header">
        <h3 className="inst-report-title">INSTITUTE ATTENDANCE REPORT</h3>
        <p className="inst-report-period">Period: {periodText}</p>
      </div>

      <div className="table-wrap inst-report-table-scroll">
        <table className="inst-report-table">
          <thead>
            <tr>
              <th>Sr No</th>
              <th>Student Name</th>
              <th>Subjects</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Total Days</th>
              <th>Total Hours</th>
              <th>Attendance %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {studentRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No students found for this institute.
                </td>
              </tr>
            ) : (
              studentRecords.map((s, index) => (
                <tr key={s.roll} className={index % 2 === 0 ? '' : 'inst-report-row-alt'}>
                  <td>{index + 1}</td>
                  <td>{s.name}</td>
                  <td className="num">{s.subjects}</td>
                  <td className="num">{s.present}</td>
                  <td className="num">{s.absent}</td>
                  <td className="num">{s.totalDays}</td>
                  <td>{s.totalHours}</td>
                  <td className="num">
                    {s.attendancePercent.toFixed(0)}% {s.statusEmoji}
                  </td>
                  <td className="num">{s.statusText}</td>
                </tr>
              ))
            )}
            {studentRecords.length > 0 ? (
              <>
                <tr className="inst-report-totals">
                  <td />
                  <td>
                    <strong>TOTAL</strong>
                  </td>
                  <td className="num">
                    <strong>{totals.totalSubjects}</strong>
                  </td>
                  <td className="num">
                    <strong>{totals.totalPresent}</strong>
                  </td>
                  <td className="num">
                    <strong>{totals.totalAbsent}</strong>
                  </td>
                  <td className="num">
                    <strong>{totals.totalDays}</strong>
                  </td>
                  <td>
                    <strong>{totals.totalHours}</strong>
                  </td>
                  <td className="num">
                    <strong>{totals.totalAttendancePercent.toFixed(1)}%</strong>
                  </td>
                  <td />
                </tr>
                <tr className="inst-report-avg">
                  <td />
                  <td>
                    <strong>AVERAGE</strong>
                  </td>
                  <td />
                  <td className="num">
                    <strong>{averages.avgPresent.toFixed(2)}</strong>
                  </td>
                  <td className="num">
                    <strong>{averages.avgAbsent.toFixed(2)}</strong>
                  </td>
                  <td />
                  <td>
                    <strong>{averages.avgHours}</strong>
                  </td>
                  <td className="num">
                    <strong>{averages.avgAttendancePercent.toFixed(1)}%</strong>
                  </td>
                  <td />
                </tr>
              </>
            ) : null}
          </tbody>
        </table>
      </div>

      {studentRecords.length > 0 ? (
        <div className="inst-report-summary card-elevated">
          <p>
            <strong>Summary</strong> — {studentRecords.length} student
            {studentRecords.length === 1 ? '' : 's'}; {totals.totalPresent} present + {totals.totalAbsent}{' '}
            absent across {report.totalWorkingDays} working day(s) in range.
          </p>
        </div>
      ) : null}
    </div>
  )
}
