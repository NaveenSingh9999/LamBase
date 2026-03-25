
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/lambase'

export default function TableEditor() {
  const { name } = useParams<{ name: string }>()
  const queryClient = useQueryClient()
  const [isInserting, setIsInserting] = useState(false)
  const [newData, setNewData] = useState('')

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['table', name],
    queryFn: () => api.db.list(name!)
  })

  const insertRow = useMutation({
    mutationFn: (data: object) => api.db.insert(name!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:['table', name] })
      setIsInserting(false)
      setNewData('')
    }
  })

  const deleteRow = useMutation({
    mutationFn: (id: string) => api.db.delete(name!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:['table', name] })
    }
  })

  const dropTable = useMutation({
    mutationFn: () => api.schema.drop(name!),
    onSuccess: () => {
      window.location.href = '/tables'
    }
  })

  // Basic column extraction from first row
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : ['id', 'created_at', '...']

  const handleInsert = () => {
    try {
      const json = JSON.parse(newData)
      insertRow.mutate(json)
    } catch (e) {
      alert('Invalid JSON')
    }
  }

  if (isLoading) return <div>Loading data...</div>
  if (error) return <div>Error loading table. Does it exist?</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontFamily: 'var(--font-mono)' }}>
          <Link to="/tables" style={{ color: 'var(--muted)', textDecoration: 'none', marginRight: '10px' }}>Tables /</Link>
          {name}
        </h2>
        <div>
          <button 
            onClick={() => setIsInserting(true)}
            style={{ 
              background: 'var(--accent)', 
              color: 'black', 
              border: 'none', 
              padding: '8px 16px', 
              cursor: 'pointer',
              fontWeight: 'bold',
              marginRight: '10px'
            }}
          >
            Insert Row
          </button>
          <button 
            onClick={() => { if(confirm('Delete table?')) dropTable.mutate() }}
            style={{ 
              background: 'red', 
              color: 'white', 
              border: 'none', 
              padding: '8px 16px', 
              cursor: 'pointer',
            }}
          >
            Drop Table
          </button>
        </div>
      </div>

      {isInserting && (
        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h3>Insert JSON</h3>
          <textarea 
            rows={5}
            value={newData}
            onChange={e => setNewData(e.target.value)}
            placeholder='{ "name": "Item 1" }'
            style={{
              width: '100%',
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              padding: '10px'
            }}
          />
          <div style={{ marginTop: '10px' }}>
            <button 
               onClick={handleInsert}
               style={{ background: 'var(--accent)', border: 'none', padding: '8px 16px', cursor: 'pointer', marginRight: '10px', color: 'black' }}
            >
              Save
            </button>
            <button 
               onClick={() => setIsInserting(false)}
               style={{ background: 'transparent', border: 'none', padding: '8px 16px', cursor: 'pointer', color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
            {columns.map(c => (
              <th key={c} style={{ padding: '10px' }}>{c}</th>
            ))}
            <th style={{ padding: '10px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows && rows.map((row: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(c => (
                <td key={c} style={{ padding: '10px' }}>
                  {typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c])}
                </td>
              ))}
              <td style={{ padding: '10px' }}>
                <button 
                  onClick={() => { if(confirm('Delete row?')) deleteRow.mutate(row.id) }}
                  style={{ background: 'transparent', border: 'none', color: 'red', cursor: 'pointer' }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows && rows.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
          No rows found. Insert one!
        </div>
      )}
    </div>
  )
}
