import { useState } from 'react';
import CentresPage from './CentresPage';
import ExamStudentsPage from './ExamStudentsPage';

type Page = 'main' | 'centres' | 'students';

export default function ExamsPage() {
  const [currentPage, setCurrentPage] = useState<Page>('main');

  if (currentPage === 'centres') {
    return <CentresPage onBack={() => setCurrentPage('main')} />;
  }

  if (currentPage === 'students') {
    return <ExamStudentsPage onBack={() => setCurrentPage('main')} />;
  }

  return (
    <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '60px' }}>📋 Exams Management</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '30px',
          marginTop: '40px',
        }}
      >
        {/* ✅ CENTRES BUTTON */}
        <button
          onClick={() => setCurrentPage('centres')}
          style={{
            padding: '40px 20px',
            border: '2px solid #0066cc',
            background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)',
            color: 'white',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: '600',
            transition: 'all 0.3s',
            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.2)',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 102, 204, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 102, 204, 0.2)';
          }}
        >
          <span style={{ fontSize: '48px' }}>📍</span>
          <span>Exam Centres</span>
          <small style={{ fontSize: '13px', opacity: 0.9 }}>Manage exam centers</small>
        </button>

        {/* ✅ EXAM STUDENTS BUTTON */}
        <button
          onClick={() => setCurrentPage('students')}
          style={{
            padding: '40px 20px',
            border: '2px solid #00aa00',
            background: 'linear-gradient(135deg, #00aa00 0%, #008800 100%)',
            color: 'white',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: '600',
            transition: 'all 0.3s',
            boxShadow: '0 4px 12px rgba(0, 170, 0, 0.2)',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 170, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 170, 0, 0.2)';
          }}
        >
          <span style={{ fontSize: '48px' }}>👥</span>
          <span>Exam Students</span>
          <small style={{ fontSize: '13px', opacity: 0.9 }}>View and manage students</small>
        </button>
      </div>
    </div>
  );
}
