import { useState } from 'react'

export function QuickSearchSection({ embedded: _embedded = false }: { embedded?: boolean }) {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="section-container">
      <div className="section-header">
        <h2>Quick Search</h2>
        <p className="section-description">Search for students, institutes, or other data</p>
      </div>

      <div className="quick-search-card card-elevated">
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Search by name, ID, institute code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button className="btn btn-primary">Search</button>
        </div>
      </div>

      {searchQuery && (
        <div className="search-results">
          <p className="state-muted">No results found for "{searchQuery}"</p>
        </div>
      )}
    </div>
  )
}
