import { useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';

interface LocationHistory {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface CentreWithCount {
  id: string;
  code: string;
  name: string;
  address: string;
  contact: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  student_count?: number;
  is_logged_in?: boolean;
  login_history?: LocationHistory[];
  centre_code?: string;
  centre_name?: string;
  login_latitude?: number | null;
  login_longitude?: number | null;
  login_at?: string;
}

interface Props {
  onBack: () => void;
}

// ✅ Calculate distance between two coordinates (km)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CentresPage({ onBack }: Props) {
  const [centres, setCentres] = useState<CentreWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  // ✅ Load ALL student counts in background
  const loadAllStudentCountsInBackground = async () => {
    try {
      const sb = getSupabase();
      const allCounts: Record<string, number> = {};
      const pageSize = 1000;

      for (let pageNum = 0; pageNum < 150; pageNum++) {  // 150 pages = 150k students
        const start = pageNum * pageSize;
        const end = start + pageSize - 1;

        const { data, error } = await sb
          .from('exam_students')
          .select('centre_code')
          .range(start, end);

        if (error || !data || data.length === 0) break;

        for (const row of data) {
          if (row.centre_code) {
            const code = String(row.centre_code);
            allCounts[code] = (allCounts[code] || 0) + 1;
          }
        }

        if (data.length < pageSize) break;
      }

      setStudentCounts(allCounts);
      console.log('✅ Background load complete - all student counts updated');
    } catch (err) {
      console.error('Background load error:', err);
    }
  };

  useEffect(() => {
    loadCentres();

    // ✅ Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          setUserLocation({
            lat,
            lon,
          });

          // ✅ If any centre is logged in (is_active), update its database location
          // This mimics the exam app behavior where login updates the location
          updateAnyActivecentreLocation(lat, lon);
        },
        (error) => {
          console.warn('Could not get location:', error);
        }
      );
    }

    // ✅ Load ALL student counts in background (after initial render)
    loadAllStudentCountsInBackground();
  }, []);

  async function loadCentres() {
    try {
      setLoading(true);
      const sb = getSupabase();

      // ✅ Fetch all centres with login data (same table)
      const { data: centresData, error: centresError } = await sb
        .from('exam_centres')
        .select('*');

      if (centresError) throw centresError;

      // ✅ FAST INITIAL LOAD: Fetch only first 1000 students
      const { data: initialStudents } = await sb
        .from('exam_students')
        .select('centre_code')
        .limit(1000);

      const initialCounts: Record<string, number> = {};
      if (initialStudents) {
        for (const row of initialStudents) {
          if (row.centre_code) {
            const code = String(row.centre_code);
            initialCounts[code] = (initialCounts[code] || 0) + 1;
          }
        }
      }

      setStudentCounts(initialCounts);  // ✅ Show initial counts immediately
      console.log('✅ Initial load: 1000 students - background loader will update counts');

      // ✅ Add counts and login status + parse login_history
      const centresWithCounts = (centresData || []).map((centre: any) => {
        let loginHistory: LocationHistory[] = [];
        try {
          if (centre.login_history && typeof centre.login_history === 'string') {
            loginHistory = JSON.parse(centre.login_history);
          } else if (Array.isArray(centre.login_history)) {
            loginHistory = centre.login_history;
          }
        } catch (e) {
          console.warn('Could not parse login_history:', e);
        }

        const code = String(centre.centre_code || '');
        const count = studentCounts[code] || 0;  // ✅ Uses state which updates in background

        return {
          ...centre,
          student_count: count,
          is_logged_in: centre.login_latitude != null && centre.login_longitude != null && centre.is_active,
          login_history: loginHistory,
        };
      });

      // ✅ Sort by code (numeric ascending)
      centresWithCounts.sort((a: any, b: any) => {
        const codeA = parseInt(a.centre_code || '0', 10);
        const codeB = parseInt(b.centre_code || '0', 10);
        return codeA - codeB;
      });

      setCentres(centresWithCounts);
    } catch (error) {
      console.error('Error loading centres:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredCentres = centres.filter((centre: any) => {
    const searchLower = search.toLowerCase();
    return (
      (centre.centre_code || '').toLowerCase().includes(searchLower) ||
      (centre.centre_name || '').toLowerCase().includes(searchLower) ||
      (centre.address || '').toLowerCase().includes(searchLower)
    );
  });

  const totalCentres = centres.length;
  const loggedInCentres = centres.filter(c => c.is_logged_in).length;
  const notLoggedIn = totalCentres - loggedInCentres;

  // ✅ Update active centre's location in database
  const updateAnyActivecentreLocation = async (lat: number, lon: number) => {
    try {
      const sb = getSupabase();

      // ✅ Find any centre with is_active = true
      const { data: activeCentres, error: fetchError } = await sb
        .from('exam_centres')
        .select('*')
        .eq('is_active', true);

      if (fetchError) {
        console.warn('Could not fetch active centres:', fetchError);
        return;
      }

      // ✅ Update each active centre
      for (const centre of activeCentres || []) {
        await updateCentreLocation(centre, lat, lon);
      }
    } catch (err) {
      console.error('Error in updateAnyActivecentreLocation:', err);
    }
  };

  // ✅ Update centre location in database + add to history
  const updateCentreLocation = async (centre: any, lat: number, lon: number) => {
    try {
      const sb = getSupabase();

      // ✅ Parse existing login_history
      let history: LocationHistory[] = [];
      try {
        if (centre.login_history && typeof centre.login_history === 'string') {
          history = JSON.parse(centre.login_history);
        } else if (Array.isArray(centre.login_history)) {
          history = centre.login_history;
        }
      } catch (e) {
        console.warn('Could not parse existing history:', e);
      }

      // ✅ Add current location to history
      const newEntry: LocationHistory = {
        latitude: lat,
        longitude: lon,
        timestamp: new Date().toISOString(),
      };
      history.push(newEntry);

      // ✅ Update database with current location + history
      const { error } = await sb
        .from('exam_centres')
        .update({
          login_latitude: lat,
          login_longitude: lon,
          login_at: new Date().toISOString(),
          login_history: JSON.stringify(history),
          is_active: true,
        })
        .eq('id', centre.id);

      if (error) {
        console.error('Error updating centre location:', error);
        alert(`Failed to update location for ${centre.centre_name}`);
      } else {
        console.log(`✅ Updated location for ${centre.centre_name}`);
        // ✅ Reload to show updated data
        loadCentres();
      }
    } catch (err) {
      console.error('Error in updateCentreLocation:', err);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* ✅ Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '30px' }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
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
        <h1 style={{ margin: 0, color: '#333' }}>📍 Exam Centres</h1>
      </div>

      {/* ✅ Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '30px' }}>
        {/* Total */}
        <div style={{
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#0066cc' }}>{totalCentres}</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>Total Centres</div>
        </div>

        {/* Logged In */}
        <div style={{
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#00aa00' }}>{loggedInCentres}</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>✅ Logged In</div>
        </div>

        {/* Not Logged In */}
        <div style={{
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '16px',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#ff6b6b' }}>{notLoggedIn}</div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>❌ Not Logged In</div>
        </div>
      </div>

      {/* ✅ Search Bar - White Card */}
      <div style={{
        background: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
        <input
          type="text"
          placeholder="🔍 Search by code, name, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box',
            background: 'white',
            color: '#333',
          }}
        />
        <small style={{ color: '#666', marginTop: '8px', display: 'block' }}>
          {filteredCentres.length} centre{filteredCentres.length !== 1 ? 's' : ''} found
        </small>
      </div>

      {/* ✅ Centres List */}
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
        </div>
      ) : filteredCentres.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#666',
          background: 'white',
          borderRadius: '8px',
          border: '1px dashed #ddd',
        }}>
          No centres found
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredCentres.map((centre: any) => {
            return (
            <div
              key={centre.id}
              style={{
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.3s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* ✅ Centre Code + Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{
                  background: '#0066cc',
                  color: 'white',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '700',
                }}>
                  {(centre as any).centre_code}
                </span>
                <span style={{
                  background: centre.is_logged_in ? '#e8f5e9' : '#ffebee',
                  color: centre.is_logged_in ? '#2e7d32' : '#c62828',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                }}>
                  {centre.is_logged_in ? '✅ Logged In' : '❌ Not Logged In'}
                </span>
              </div>

              {/* ✅ Centre Name */}
              <h3 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '15px', fontWeight: '600' }}>
                {(centre as any).centre_name}
              </h3>

              {/* ✅ Details */}
              <div style={{ fontSize: '13px', color: '#555', lineHeight: '1.5', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                <p style={{ margin: '6px 0' }}><strong>📍 Address:</strong></p>
                <p style={{ margin: '6px 0 12px 0', paddingLeft: '16px', backgroundColor: '#f9f9f9', padding: '8px', borderRadius: '4px', fontSize: '12px' }}>
                  {centre.address || 'N/A'}
                  {centre.city && <><br />{centre.city}</>}
                  {(centre as any).state && <><br />{(centre as any).state}</>}
                  {(centre as any).pincode && <><br />PIN: {(centre as any).pincode}</>}
                </p>
                <p style={{ margin: '6px 0' }}><strong>📞</strong> {centre.contact}</p>
                <p style={{ margin: '6px 0' }}>
                  <strong>👥 Students:</strong> <span style={{ fontWeight: '600', color: '#00aa00', fontSize: '16px' }}>{centre.student_count}</span>
                </p>
              </div>

              {/* ✅ Location Data */}
              {centre.is_logged_in && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '12px', padding: '8px', background: '#f9f9f9', borderRadius: '4px' }}>
                  <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
                    <p style={{ margin: '2px 0', fontWeight: '600', color: '#333' }}>📍 Current Location</p>
                    <p style={{ margin: '2px 0' }}>Lat: {centre.login_latitude?.toFixed(4)}</p>
                    <p style={{ margin: '2px 0' }}>Long: {centre.login_longitude?.toFixed(4)}</p>
                    <p style={{ margin: '2px 0', fontSize: '11px' }}>🕐 {new Date(centre.login_at).toLocaleString()}</p>

                    {/* ✅ Distance from current location */}
                    {userLocation && centre.login_latitude && centre.login_longitude && (
                      <p style={{ margin: '6px 0', fontWeight: '600', color: '#0066cc' }}>
                        📍 Distance: {calculateDistance(userLocation.lat, userLocation.lon, centre.login_latitude, centre.login_longitude).toFixed(2)} km
                      </p>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const mapsUrl = `https://www.google.com/maps?q=${centre.login_latitude},${centre.login_longitude}`;
                        window.open(mapsUrl, '_blank');
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '6px 12px',
                        background: '#0066cc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '600',
                        width: '100%',
                      }}
                    >
                      🗺️ Current Location
                    </button>
                  </div>

                  {/* ✅ Location History */}
                  {centre.login_history && centre.login_history.length > 0 && (
                    <div>
                      <p style={{ margin: '8px 0', fontWeight: '600', color: '#333' }}>📋 Location History</p>
                      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {centre.login_history.map((loc: LocationHistory, idx: number) => (
                          <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
                            <p style={{ margin: '2px 0', fontSize: '11px' }}>
                              📌 {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                            </p>
                            <p style={{ margin: '2px 0', fontSize: '11px', color: '#888' }}>
                              🕐 {new Date(loc.timestamp).toLocaleString()}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const mapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
                                window.open(mapsUrl, '_blank');
                              }}
                              style={{
                                marginTop: '4px',
                                padding: '4px 8px',
                                background: '#666',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                width: '100%',
                              }}
                            >
                              🗺️ View Map
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ✅ Smooth scroll bar styling */
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        ::-webkit-scrollbar-track {
          background: #f5f5f5;
          border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #0066cc 0%, #0052a3 100%);
          border-radius: 10px;
          border: 2px solid #f5f5f5;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #0052a3 0%, #003d7a 100%);
        }

        /* Firefox scroll bar */
        * {
          scrollbar-color: #0066cc #f5f5f5;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
}
