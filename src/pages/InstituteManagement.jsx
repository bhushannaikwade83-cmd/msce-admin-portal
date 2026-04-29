import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function InstituteManagement() {
  const [institutes, setInstitutes] = useState([]);
  const [formData, setFormData] = useState({
    instituteId: '',
    instituteName: '',
    address: '',
    phone: '',
    email: '',
    pincodeArea: ''
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Load institutes from localStorage (demo) or API
  useEffect(() => {
    loadInstitutes();
  }, []);

  const loadInstitutes = async () => {
    try {
      // TODO: Replace with API call
      // const response = await fetch('/api/institutes');
      // const data = await response.json();
      // setInstitutes(data);

      // Demo: Load from localStorage
      const saved = localStorage.getItem('institutes');
      if (saved) {
        setInstitutes(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading institutes:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Validate numeric ID
    if (name === 'instituteId' && value && !/^\d*$/.test(value)) {
      setMessage({ type: 'error', text: '❌ Institute ID must be numeric only' });
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.instituteId || !formData.instituteName || !formData.address || !formData.phone) {
        setMessage({ type: 'error', text: '❌ Please fill all required fields' });
        setLoading(false);
        return;
      }

      // Validate numeric ID
      if (!/^\d+$/.test(formData.instituteId)) {
        setMessage({ type: 'error', text: '❌ Institute ID must be numeric only (e.g., 3001)' });
        setLoading(false);
        return;
      }

      // Check if ID already exists
      if (institutes.some(i => i.instituteId === formData.instituteId)) {
        setMessage({ type: 'error', text: '❌ Institute ID already exists' });
        setLoading(false);
        return;
      }

      // TODO: Replace with API call
      // const response = await fetch('/api/institutes', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // });
      // const data = await response.json();

      // Demo: Save to localStorage
      const newInstitute = {
        ...formData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      };

      const updated = [...institutes, newInstitute];
      setInstitutes(updated);
      localStorage.setItem('institutes', JSON.stringify(updated));

      setMessage({
        type: 'success',
        text: `✅ Institute created successfully! ID: ${formData.instituteId}`
      });

      // Reset form
      setFormData({
        instituteId: '',
        instituteName: '',
        address: '',
        phone: '',
        email: '',
        pincodeArea: ''
      });

      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `❌ Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this institute?')) {
      const updated = institutes.filter(i => i.id !== id);
      setInstitutes(updated);
      localStorage.setItem('institutes', JSON.stringify(updated));
      setMessage({ type: 'success', text: '✅ Institute deleted' });
      setTimeout(() => setMessage(''), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">🏫 Institute Management</h1>
        <p className="text-gray-600 mt-2">Create new institutes with numeric ID only</p>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <p className="text-blue-800">
          <strong>Important:</strong> Institute ID must be <strong>numeric only</strong> (e.g., 3001, 2024, 1000).
          This will be used for admin login in the app.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-6">Create New Institute</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Institute ID (Numeric) *
              </label>
              <input
                type="number"
                name="instituteId"
                value={formData.instituteId}
                onChange={handleInputChange}
                placeholder="e.g., 3001"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Institute Name *
              </label>
              <input
                type="text"
                name="instituteName"
                value={formData.instituteName}
                onChange={handleInputChange}
                placeholder="e.g., Delhi Public School"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Address *
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="e.g., 123 Main St, New Delhi"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="e.g., 9876543210"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="e.g., info@school.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Pincode Area (Optional)
              </label>
              <input
                type="text"
                name="pincodeArea"
                value={formData.pincodeArea}
                onChange={handleInputChange}
                placeholder="e.g., 110001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : '✨ Create Institute'}
          </button>
        </form>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Institutes List */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-6">📋 Created Institutes</h2>

        {institutes.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No institutes created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Institute ID</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Address</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Phone</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Created</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {institutes.map(institute => (
                  <tr key={institute.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-blue-600">{institute.instituteId}</td>
                    <td className="px-4 py-3">{institute.instituteName}</td>
                    <td className="px-4 py-3">{institute.address}</td>
                    <td className="px-4 py-3">{institute.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(institute.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(institute.id)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
