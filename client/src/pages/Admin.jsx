import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'

const Admin = () => {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const result = await apiRequest('/admin/users')
      setUsers(result.data.users)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => { load() }, [])

  const setRole = async (uid, role) => {
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(uid)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="min-h-screen bg-dark px-4 py-12"><div className="mx-auto max-w-6xl"><h1 className="text-3xl font-bold text-primary">Administration</h1><p className="text-text-secondary">Role-protected user management.</p>{error && <p className="mt-4 text-red-400">{error}</p>}<div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-left text-sm"><thead className="border-b border-border text-text-secondary"><tr><th className="p-4">User</th><th className="p-4">Role</th><th className="p-4">Verified</th><th className="p-4">MFA</th><th className="p-4">Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.uid} className="border-b border-border/50"><td className="p-4"><div className="text-text-primary">{user.displayName || 'Unnamed'}</div><div className="text-xs text-text-secondary">{user.email}</div></td><td className="p-4 text-text-primary">{user.role}</td><td className="p-4 text-text-secondary">{user.emailVerified ? 'Yes' : 'No'}</td><td className="p-4 text-text-secondary">{user.mfaEnabled ? 'On' : 'Off'}</td><td className="p-4"><button onClick={() => setRole(user.uid, user.role === 'admin' ? 'user' : 'admin')} className="rounded-lg border border-primary/40 px-3 py-2 text-primary">Make {user.role === 'admin' ? 'user' : 'admin'}</button></td></tr>)}</tbody></table></div></div></div>
  )
}

export default Admin
