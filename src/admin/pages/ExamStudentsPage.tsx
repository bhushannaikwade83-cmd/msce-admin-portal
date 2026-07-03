import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import { StudentDisplayPhoto } from '../components/StudentDisplayPhoto';

// Global CSS for photo boxes
const photoBoxStyles = `
  .exam-photo-box {
    width: 120px;
    height: 120px;
    overflow: hidden;
    border-radius: 4px;
    border: 2px solid #ddd;
    background: #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
  }
  .exam-photo-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .exam-photo-box .student-avatar-img {
    width: 100% !important;
    height: 100% !important;
    border-radius: 4px !important;
    object-fit: cover !important;
  }
  .exam-photo-box .student-table-avatar {
    width: 100% !important;
    height: 100% !important;
  }
`;

interface ExamStudent {
  id: string;
  exam_student_id: string;
  student_name: string;
  seat_no: string;
  subject_name: string;
  exam_date: string;
  start_time: string;
  centre_code: string;
}

interface Props {
  onBack: () => void;
}

export default function ExamStudentsPage({ onBack }: Props) {
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCentre, setSelectedCentre] = useState<string>('');  // ✅ Centre filter
  const [centres, setCentres] = useState<string[]>([]);  // ✅ All centre codes
  const [resettingId, setResettingId] = useState<string | null>(null);  // ✅ Track resetting state

  useEffect(() => {
    // ✅ Load centres ONLY - no students loading
    loadCentres();
  }, []);

  async function loadCentres() {
    try {
      const sb = getSupabase();

      // ✅ Fetch ALL centres from exam_centres table
      const { data, error } = await sb
        .from('exam_centres')
        .select('centre_code')
        .order('centre_code', { ascending: true });

      if (error) throw error;

      // ✅ Extract and sort centre codes numerically
      const centreCodes = (data || [])
        .map(c => c.centre_code)
        .sort((a, b) => {
          const numA = parseInt(String(a), 10);
          const numB = parseInt(String(b), 10);
          return numA - numB;
        });

      setCentres(centreCodes);
      console.log(`✅ Found ${centreCodes.length} centres from exam_centres table`);
    } catch (error) {
      console.error('Error loading centres:', error);
    }
  }

  async function resetEntryPhoto(studentId: string, subjectIndex: number) {
    setResettingId(`${studentId}-${subjectIndex}`);
    try {
      const sb = getSupabase();
      const student = students.find((s: any) => s.id === studentId);
      if (!student) return;

      const subject = student.subjectDetails[subjectIndex];
      if (!subject) return;

      // ✅ Build entry history entry (move current to history with full photo URL)
      let entryHistory: any[] = [];
      try {
        entryHistory = subject.entry_history ? JSON.parse(String(subject.entry_history)) : [];
      } catch {
        entryHistory = [];
      }

      // ✅ Save current entry to history (keep full URL)
      if (subject.entry_photo_url || subject.entry_latitude || subject.entry_longitude) {
        entryHistory.push({
          id: `entry_${Date.now()}`,
          entry_photo_url: subject.entry_photo_url || null,  // ✅ Full photo URL saved
          entry_photo_at: subject.entry_photo_at || null,
          entry_latitude: subject.entry_latitude || null,
          entry_longitude: subject.entry_longitude || null,
          entry_at: subject.entry_at || null,
          reset_at: new Date().toISOString(),
        });
      }

      console.log('%c💾 Entry History Updated:', 'color: #27ae60; font-weight: bold;', {
        studentName: student.student_name,
        subject: subject.subject,
        savedPhotoUrl: subject.entry_photo_url,
        totalHistoryCount: entryHistory.length,
      });

      // ✅ Update database: clear current entry, save to history
      const { error } = await sb
        .from('exam_students')
        .update({
          entry_photo_url: null,  // Clear current
          entry_photo_at: null,
          entry_latitude: null,
          entry_longitude: null,
          entry_at: null,
          entry_history: JSON.stringify(entryHistory),  // Save to history JSON
        })
        .eq('id', studentId)
        .eq('subject_name', subject.subject);

      if (error) {
        console.error('❌ Error resetting entry photo:', error);
        return;
      }

      // ✅ Update local state
      const updatedStudents = students.map((s: any) => {
        if (s.id === studentId) {
          const updatedDetails = [...s.subjectDetails];
          updatedDetails[subjectIndex] = {
            ...updatedDetails[subjectIndex],
            entry_photo_url: null,
            entry_photo_at: null,
            entry_latitude: null,
            entry_longitude: null,
            entry_at: null,
            entry_history: JSON.stringify(entryHistory),
          };
          return { ...s, subjectDetails: updatedDetails };
        }
        return s;
      });

      setStudents(updatedStudents);
      console.log(`✅ Entry photo reset and moved to history for ${student.student_name} - ${subject.subject}`);
    } catch (err) {
      console.error('❌ Reset error:', err);
    } finally {
      setResettingId(null);
    }
  }

  async function loadStudentsByCentre(centreCode: string) {
    try {
      setLoading(true);

      console.log('%c🚀 LOADING STUDENTS FOR CENTRE', 'color: #00b894; font-size: 13px; font-weight: bold;', {
        centreCode,
        timestamp: new Date().toLocaleTimeString(),
      });

      const sb = getSupabase();

      // ✅ Fetch students with pagination (include photo_url)
      let allStudentsData: any[] = [];
      const pageSize = 1000;

      for (let page = 0; page < 150; page++) {
        const start = page * pageSize;
        const end = start + pageSize - 1;

        const { data, error } = await sb
          .from('exam_students')
          .select('*')
          .eq('centre_code', centreCode)
          .range(start, end)
          .order('seat_no', { ascending: true });

        if (error || !data || data.length === 0) {
          console.log(`%c✅ LOADED ${allStudentsData.length} TOTAL STUDENTS`, 'color: #0984e3;', {
            centreCode,
            totalCount: allStudentsData.length,
            pagesScanned: page,
          });
          break;
        }

        allStudentsData = [...allStudentsData, ...data];
        console.log(`%c📊 Page ${page + 1}:`, 'color: #6c5ce7;', `${data.length} rows (total so far: ${allStudentsData.length})`);

        if (data.length < pageSize) break;
      }

      // ✅ Group students by student_name + institute_id + centre_code (merge subjects with details)
      const groupedMap = new Map<string, any>();

      allStudentsData.forEach(student => {
        const key = `${student.student_name}_${student.institute_id}_${student.centre_code}`;

        if (!groupedMap.has(key)) {
          groupedMap.set(key, {
            ...student,
            photo_url: student.photo_url,  // ✅ Include photo
            subjectDetails: [{
              subject: student.subject_name,
              date: student.exam_date,
              time: student.start_time,
              batch: student.batch,
              entry_photo_url: student.entry_photo_url,  // ✅ Current entry photo
              entry_photo_at: student.entry_photo_at,  // ✅ Entry photo timestamp
              entry_latitude: student.entry_latitude,  // ✅ Entry location lat
              entry_longitude: student.entry_longitude,  // ✅ Entry location long
              entry_at: student.entry_at,  // ✅ Entry time
              entry_history: student.entry_history,  // ✅ Historical entries
            }],
          });
        } else {
          const existing = groupedMap.get(key)!;
          const subjectExists = existing.subjectDetails.some((s: any) => s.subject === student.subject_name);
          if (!subjectExists) {
            existing.subjectDetails.push({
              subject: student.subject_name,
              date: student.exam_date,
              time: student.start_time,
              batch: student.batch,
              entry_photo_url: student.entry_photo_url,  // ✅ Current entry photo
              entry_photo_at: student.entry_photo_at,  // ✅ Entry photo timestamp
              entry_latitude: student.entry_latitude,  // ✅ Entry location lat
              entry_longitude: student.entry_longitude,  // ✅ Entry location long
              entry_at: student.entry_at,  // ✅ Entry time
              entry_history: student.entry_history,  // ✅ Historical entries
            });
          }
        }
      });

      const groupedStudents = Array.from(groupedMap.values());
      setStudents(groupedStudents);

      // 🎯 DEBUG: Photo Loading Analysis
      console.log('%c🎯 PHOTO LOADING DEBUG - ExamStudentsPage', 'color: #ff6b6b; font-size: 14px; font-weight: bold;');
      console.log(`✅ Grouped into ${groupedStudents.length} unique students`);

      const photoStats = {
        totalStudents: groupedStudents.length,
        withPhotos: groupedStudents.filter((s: any) => s.photo_url).length,
        withoutPhotos: groupedStudents.filter((s: any) => !s.photo_url).length,
        withEntryPhotos: groupedStudents.filter((s: any) => s.subjectDetails?.[0]?.entry_photo_url).length,
        withoutEntryPhotos: groupedStudents.filter((s: any) => !s.subjectDetails?.[0]?.entry_photo_url).length,
        photoTypes: new Map<string, number>(),
        entryPhotoTypes: new Map<string, number>(),
      };

      // Analyze profile photo URL types
      groupedStudents.forEach((s: any) => {
        if (!s.photo_url) return;
        const url = String(s.photo_url).toLowerCase();
        let type = 'other';
        if (url.includes('backblaze')) type = 'b2-url';
        else if (url.includes('supabase')) type = 'supabase-url';
        else if (url.startsWith('http')) type = 'http-url';
        else if (url.includes('/')) type = 'storage-path';
        else type = 'unknown';
        photoStats.photoTypes.set(type, (photoStats.photoTypes.get(type) || 0) + 1);
      });

      // Analyze entry photo URL types
      groupedStudents.forEach((s: any) => {
        const entryPhoto = s.subjectDetails?.[0]?.entry_photo_url;
        if (!entryPhoto) return;
        const url = String(entryPhoto).toLowerCase();
        let type = 'other';
        if (url.includes('backblaze')) type = 'b2-url';
        else if (url.includes('supabase')) type = 'supabase-url';
        else if (url.startsWith('http')) type = 'http-url';
        else if (url.includes('/')) type = 'storage-path';
        else type = 'unknown';
        photoStats.entryPhotoTypes.set(type, (photoStats.entryPhotoTypes.get(type) || 0) + 1);
      });

      console.log('%c📊 PROFILE Photo Statistics:', 'color: #4ecdc4; font-weight: bold;', {
        totalStudents: photoStats.totalStudents,
        withPhotos: `${photoStats.withPhotos} (${((photoStats.withPhotos / photoStats.totalStudents) * 100).toFixed(1)}%)`,
        withoutPhotos: `${photoStats.withoutPhotos} (${((photoStats.withoutPhotos / photoStats.totalStudents) * 100).toFixed(1)}%)`,
        photoTypeBreakdown: Object.fromEntries(photoStats.photoTypes),
      });

      console.log('%c📸 ENTRY Photo Statistics:', 'color: #fab1a0; font-weight: bold;', {
        totalStudents: photoStats.totalStudents,
        withEntryPhotos: `${photoStats.withEntryPhotos} (${((photoStats.withEntryPhotos / photoStats.totalStudents) * 100).toFixed(1)}%)`,
        withoutEntryPhotos: `${photoStats.withoutEntryPhotos} (${((photoStats.withoutEntryPhotos / photoStats.totalStudents) * 100).toFixed(1)}%)`,
        entryPhotoTypeBreakdown: Object.fromEntries(photoStats.entryPhotoTypes),
      });

      console.log('%c🔍 Sample Student Data (first 5):', 'color: #95e1d3; font-weight: bold;');
      groupedStudents.slice(0, 5).forEach((s: any, idx: number) => {
        const firstSubject = s.subjectDetails[0];
        console.log(`  [${idx + 1}] ${s.student_name}`, {
          photo_url: s.photo_url ? `${s.photo_url.substring(0, 80)}...` : '❌ NO PHOTO',
          entry_photo: firstSubject?.entry_photo_url ? `${firstSubject.entry_photo_url.substring(0, 80)}...` : '❌ NO ENTRY PHOTO',
          institute_id: s.institute_id,
          centre_code: s.centre_code,
          subjects: s.subjectDetails.length,
          seat_no: s.seat_no,
        });
      });

      console.log('%c⚙️ Photo Resolution Strategy:', 'color: #f38181; font-weight: bold;', `
        Layer 1: Direct HTTP/HTTPS URLs (if available immediately)
        Layer 2: B2 Cloud Storage (needs b2-storage-proxy Supabase Function)
        Layer 3: Supabase Storage paths (createSignedUrl with 1-hour TTL)
        Caching: Memory cache + localStorage (1-hour TTL)
      `);

      console.log('%c💾 Cache Info:', 'color: #fdcb6e; font-weight: bold;', {
        memoryCache: 'signedUrlMemoryCache (built-in)',
        persistentCache: 'localStorage key: msce_photo_url_cache',
        cacheTTL: '1 hour (3600000ms)',
        requestDedup: 'Same URL requests await single Promise',
      });
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = students.filter(student => {
    const matchSearch = student.student_name.toLowerCase().includes(search.toLowerCase()) ||
      student.seat_no.includes(search) ||
      student.subjectDetails.some((s: any) => s.subject.toLowerCase().includes(search.toLowerCase())) ||
      student.centre_code.includes(search);

    const matchCentre = !selectedCentre || student.centre_code === selectedCentre;

    return matchSearch && matchCentre;
  });

  return (
    <div style={{ padding: '0', maxWidth: '100%', margin: '0' }}>
      {/* ✅ Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px', borderBottom: '1px solid #ddd' }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 16px',
            background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0, 102, 204, 0.2)',
            transition: 'all 0.3s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 102, 204, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 102, 204, 0.2)';
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, color: '#333' }}>📋 Exam Students by Centre</h1>
      </div>

      {/* ✅ Filter Section */}
      <div style={{ padding: '30px', background: '#f8f9fa' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#333' }}>Select Centre</h3>
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <select
            value={selectedCentre}
            onChange={(e) => {
              const centre = e.target.value;
              setSelectedCentre(centre);

              // ✅ Load students for selected centre
              if (centre) {
                loadStudentsByCentre(centre);
              } else {
                setStudents([]);  // Clear students if "All Centres" selected
              }
            }}
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '12px 16px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              background: 'white',
              cursor: 'pointer',
              color: '#333',
            }}
          >
            <option value="">📍 All Centres ({centres.length})</option>
            {centres.map(code => (
              <option key={code} value={code}>
                Centre {code}
              </option>
            ))}
          </select>
          <small style={{ color: '#666', marginTop: '10px', display: 'block' }}>
            {selectedCentre ? `Showing ${students.length} student${students.length !== 1 ? 's' : ''} for centre ${selectedCentre}` : 'Select a centre to view students'}
          </small>
        </div>
      </div>

      {/* ✅ Students Table - Only shows when centre is selected */}
      {selectedCentre && (
        <div style={{ padding: '30px' }}>
          {console.log(`%c🔍 TABLE RENDERING`, 'color: #6c5ce7; font-weight: bold;', {
            selectedCentre,
            loading,
            totalStudents: students.length,
            filteredStudents: filteredStudents.length,
            search: search || '(no filter)',
            timestamp: new Date().toLocaleTimeString(),
          })}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{
                display: 'inline-block',
                width: '40px',
                height: '40px',
                border: '4px solid #f0f0f0',
                borderTop: '4px solid #0066cc',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: '#666', marginTop: '10px' }}>Loading students...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666', background: 'white', borderRadius: '8px' }}>
              {students.length === 0 ? `No students found for centre ${selectedCentre}` : `No students match your search "${search}"`}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '15px', color: '#333', fontWeight: '500' }}>
                📊 Found <strong>{filteredStudents.length}</strong> student{filteredStudents.length !== 1 ? 's' : ''} (out of {students.length} total)
              </div>
              <div style={{
                overflowX: 'auto',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: 'white',
                  fontSize: '13px',
                }}>
                  <thead>
                    <tr style={{ background: '#0066cc', color: 'white' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '50px' }}>Sr No</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '140px' }}>Photo</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Student Name</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Seat No</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Subject</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '140px' }}>Entry Photo</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '140px' }}>Old Photos</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '120px' }}>Entry Location</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', width: '180px' }}>Entry Time</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Batch</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Exam Date</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600' }}>Start Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student: any, idx) => {
                      // 🎯 DEBUG: Log each student's photo info (first 3 only)
                      if (idx < 3) {
                        console.log(`%c📷 Student ${idx + 1}: ${student.student_name}`, 'color: #a29bfe;', {
                          photo_url: student.photo_url ? student.photo_url.substring(0, 120) : '❌ NO PHOTO',
                          hasPhoto: !!student.photo_url,
                          subjectsCount: student.subjectDetails.length,
                          seatNo: student.seat_no,
                          centreCode: student.centre_code,
                        });
                      }
                      return student.subjectDetails.map((detail: any, sidx: number) => {
                        // Log photo rendering for first 3 students
                        if (sidx === 0 && idx < 3) {
                          console.log(`%c  ├─ Rendering photo for: ${student.student_name}`, 'color: #74b9ff;', {
                            hasPhoto: !!student.photo_url,
                            using: 'StudentDisplayPhoto component',
                          });
                        }
                        return (
                        <tr
                          key={`${student.student_name}_${student.institute_id}_${student.centre_code}_${sidx}`}
                          style={{
                            borderBottom: sidx === student.subjectDetails.length - 1 ? '2px solid #0066cc' : '1px solid #eee',
                            background: idx % 2 === 0 ? '#fafafa' : 'white',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f0f0f0';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = idx % 2 === 0 ? '#fafafa' : 'white';
                          }}
                        >
                          {sidx === 0 && (
                            <>
                              <td rowSpan={student.subjectDetails.length} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#0066cc', verticalAlign: 'middle' }}>
                                {idx + 1}
                              </td>
                              <td rowSpan={student.subjectDetails.length} style={{ padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle', width: '140px' }}>
                                {student.photo_url ? (
                                  <div className="exam-photo-box">
                                    <StudentDisplayPhoto
                                      student={student}
                                      displayName={student.student_name}
                                      size="sm"
                                    />
                                  </div>
                                ) : (
                                  <div className="exam-photo-box">
                                    <div style={{ fontSize: '40px', color: '#999' }}>📸</div>
                                  </div>
                                )}
                              </td>
                              <td rowSpan={student.subjectDetails.length} style={{ padding: '12px 16px', color: '#333', fontWeight: '500', verticalAlign: 'middle' }}>
                                {student.student_name}
                              </td>
                              <td rowSpan={student.subjectDetails.length} style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', fontWeight: '600', color: '#0066cc', verticalAlign: 'middle' }}>
                                {student.seat_no}
                              </td>
                            </>
                          )}
                          <td style={{ padding: '12px 16px', color: '#555' }}>
                            {detail.subject}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle', width: '140px' }}>
                            {detail.entry_photo_url ? (
                              <div>
                                <div className="exam-photo-box" style={{ marginBottom: '8px' }}>
                                  <StudentDisplayPhoto
                                    student={{ photo_url: detail.entry_photo_url }}
                                    displayName={`${student.student_name} - Entry`}
                                    size="sm"
                                  />
                                </div>
                                <button
                                  onClick={() => resetEntryPhoto(student.id, filteredStudents.indexOf(student))}
                                  disabled={resettingId === `${student.id}-${filteredStudents.indexOf(student)}`}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#e74c3c',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    cursor: resettingId === `${student.id}-${filteredStudents.indexOf(student)}` ? 'wait' : 'pointer',
                                    opacity: resettingId === `${student.id}-${filteredStudents.indexOf(student)}` ? 0.6 : 1,
                                  }}
                                >
                                  {resettingId === `${student.id}-${filteredStudents.indexOf(student)}` ? '⏳' : '🔄'} Reset
                                </button>
                              </div>
                            ) : (
                              <div className="exam-photo-box">
                                <div style={{ fontSize: '40px', color: '#999' }}>—</div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'center', verticalAlign: 'middle', width: '140px' }}>
                            {detail.entry_history && String(detail.entry_history).length > 2 ? (() => {
                              try {
                                const history = JSON.parse(String(detail.entry_history));
                                if (history.length === 0) {
                                  return <div className="exam-photo-box"><div style={{ fontSize: '40px', color: '#999' }}>—</div></div>;
                                }
                                // Show latest old photo
                                const latestOld = history[history.length - 1];
                                return (
                                  <div>
                                    {latestOld.entry_photo_url ? (
                                      <div className="exam-photo-box" style={{ marginBottom: '4px' }}>
                                        <StudentDisplayPhoto
                                          student={{ photo_url: latestOld.entry_photo_url }}
                                          displayName={`${student.student_name} - Old`}
                                          size="sm"
                                        />
                                      </div>
                                    ) : (
                                      <div className="exam-photo-box" style={{ marginBottom: '4px' }}>
                                        <div style={{ fontSize: '40px', color: '#999' }}>—</div>
                                      </div>
                                    )}
                                    {history.length > 1 && (
                                      <div style={{ fontSize: '10px', color: '#0066cc', fontWeight: '600' }}>
                                        +{history.length - 1} more
                                      </div>
                                    )}
                                  </div>
                                );
                              } catch {
                                return <div className="exam-photo-box"><div style={{ fontSize: '40px', color: '#999' }}>—</div></div>;
                              }
                            })() : (
                              <div className="exam-photo-box">
                                <div style={{ fontSize: '40px', color: '#999' }}>—</div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {detail.entry_latitude && detail.entry_longitude ? (
                              <a
                                href={`https://www.google.com/maps?q=${detail.entry_latitude},${detail.entry_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-block',
                                  padding: '8px 12px',
                                  background: '#0066cc',
                                  color: 'white',
                                  borderRadius: '4px',
                                  textDecoration: 'none',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#0052a3';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,102,204,0.3)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#0066cc';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                📍 Map
                              </a>
                            ) : (
                              <span style={{ color: '#999', fontSize: '12px' }}>No location</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px' }}>
                            {detail.entry_photo_at ? (
                              <div>
                                <div style={{ fontWeight: '600', color: '#0066cc' }}>
                                  {new Date(detail.entry_photo_at).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </div>
                                <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>
                                  {new Date(detail.entry_photo_at).toLocaleDateString('en-IN')}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#999' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#555', fontWeight: '500' }}>
                            {detail.batch}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#555' }}>
                            {detail.date ? new Date(detail.date).toLocaleDateString() : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#555' }}>
                            {detail.time || '—'}
                          </td>
                        </tr>
                        );
                      })
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        ${photoBoxStyles}
      `}</style>
    </div>
  );
}
