
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/lambase'

export default function Tables() {
  const queryClient = useQueryClient()
  const [newTableName, setNewTableName] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: api.schema.tables
  })

  const createTable = useMutation({
    mutationFn: () => api.schema.create(newTableName, [
      { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
      { name: 'created_at', type: 'datetime', default: 'now()' },
      { name: 'name', type: 'text' } // Default column
    ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:['tables'] })
      setNewTableName('')
      setCreating(false)
    }
  })

  return (
    <div>
      <h2 style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Tables</h2>
      
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={() => setCreating(true)}
          style={{ 
            background: 'var(--accent)', 
            color: 'black', 
            border: 'none', 
            padding: '8px 16px', 
            cursor: 'pointer',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono)'
          }}
        >
          + NEW TABLE
        </button>
      </div>

      {creating && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h3 style={{ marginTop: 0 }}>Create Table</h3>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--muted)' }}>Table Name</label>
            <input 
              value={newTableName}
              onChange={e => setNewTableName(e.target.value)}
              style={{ 
                background: 'var(--bg)', 
                border: '1px solid var(--border)', 
                color: 'var(--text)', 
                padding: '8px', 
                width: '100%',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
          <button 
            onClick={() => createTable.mutate()}
            disabled={!newTableName}
            style={{ 
              background: 'var(--accent)', 
              color: 'black', 
              border: 'none', 
              padding: '8px 16px', 
              cursor: 'pointer',
              opacity: newTableName ? 1 : 0.5
            }}
          >
            Create
          </button>
          <button 
            onClick={() => setCreating(false)}
            style={{ 
              background: 'transparent', 
              color: 'var(--muted)', 
              border: 'none', 
              padding: '8px 16px', 
              cursor: 'pointer',
              marginLeft: '10px'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
            {tables && tables.map((t: string) => (
              <Link 
                key={t} 
                to={`/tables/${t}`}
                style={{ 
                  display: 'block',
                  padding: '20px', 
                  border: '1px solid var(--border)', 
                  textDecoration: 'none',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--surface)'
                }}
              >
                {t} 
                <span style={{ float: 'right', color: 'var(--accent)' }}>&rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
