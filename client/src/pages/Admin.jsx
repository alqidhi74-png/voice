import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiRequest } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import halfLogo from '../assets/hafl_no_background.png'

const EMPTY_STATS = {
  totalUsers: 0,
  adminUsers: 0,
  verifiedUsers: 0,
  enrolledUsers: 0,
  voiceRecordings: 0,
  totalVerifications: 0,
}

const EMPTY_CHARTS = {
  activityTrend: [],
  userGrowth: [],
  verificationBreakdown: [],
}

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8']

const Icon = ({ name, className = 'h-5 w-5' }) => {
  const paths = {
    overview: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
    users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.87m-1-7.26a4 4 0 010 7.75',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    mic: 'M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zm7 10a7 7 0 01-14 0M12 19v3m-4 0h8',
    check: 'M20 6L9 17l-5-5',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    admin: 'M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z',
    refresh: 'M20 11a8 8 0 00-14.9-4M4 4v5h5m11 4a8 8 0 01-14.9 4M4 20v-5h5',
    search: 'M21 21l-4.4-4.4m2.4-5.6a8 8 0 11-16 0 8 8 0 0116 0z',
    role: 'M12 14a4 4 0 100-8 4 4 0 000 8zm-7 7a7 7 0 0114 0m1-9v6m3-3h-6',
    trash: 'M3 6h18m-2 0l-1 14H6L5 6m3 0V3h8v3m-6 4v6m4-6v6',
    logout: 'M10 17l5-5-5-5m5 5H3m12-9h5a1 1 0 011 1v16a1 1 0 01-1 1h-5',
    arrow: 'M9 18l6-6-6-6',
    close: 'M6 18L18 6M6 6l12 12',
    bell: 'M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 13h4',
    feedback: 'M21 15a4 4 0 01-4 4H8l-5 3v-4a4 4 0 01-1-3V7a4 4 0 014-4h11a4 4 0 014 4v8z',
    lock: 'M6 10V7a6 6 0 0112 0v3m-13 0h14v11H5V10zm7 4v3',
    block: 'M18.4 5.6a9 9 0 11-12.8 12.8A9 9 0 0118.4 5.6zM6 6l12 12',
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={paths[name]} />
    </svg>
  )
}

const formatDate = value => {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

const formatDateTime = value => {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const Badge = ({ children, tone = 'gray' }) => {
  const tones = {
    gray: 'bg-slate-100 text-slate-600 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    purple: 'bg-violet-50 text-violet-700 ring-violet-200',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>
}

const Admin = () => {
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  const { showToast } = useToast()
  const [view, setView] = useState('overview')
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(EMPTY_STATS)
  const [charts, setCharts] = useState(EMPTY_CHARTS)
  const [recentActivity, setRecentActivity] = useState([])
  const [alerts, setAlerts] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [action, setAction] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [feedbackReplyId, setFeedbackReplyId] = useState(null)
  const [feedbackReply, setFeedbackReply] = useState('')
  const [feedbackUpdating, setFeedbackUpdating] = useState(false)
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')

    const [overviewResult, usersResult, alertsResult, feedbackResult] = await Promise.allSettled([
      apiRequest('/admin/overview'),
      apiRequest('/admin/users'),
      apiRequest('/admin/alerts'),
      apiRequest('/admin/feedback'),
    ])

    if (overviewResult.status === 'fulfilled') {
      setStats(overviewResult.value.data?.stats || EMPTY_STATS)
      setRecentActivity(overviewResult.value.data?.recentActivity || [])
      setCharts(overviewResult.value.data?.charts || EMPTY_CHARTS)
    }
    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value.data?.users || [])
    }
    if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value.data?.alerts || [])
    if (feedbackResult.status === 'fulfilled') setFeedback(feedbackResult.value.data?.feedback || [])

    if (overviewResult.status === 'rejected' || usersResult.status === 'rejected') {
      const reason = overviewResult.status === 'rejected' ? overviewResult.reason : usersResult.reason
      setError(reason?.message || 'Administration data could not be loaded. Restart the backend server and try again.')
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const refresh = () => loadData({ silent: true })
    window.addEventListener('vshield:live-event', refresh)
    return () => window.removeEventListener('vshield:live-event', refresh)
  }, [])

  const userById = useMemo(() => new Map(users.map(user => [user.uid, user])), [users])
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter(user => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      const matchesSearch = !query || [user.displayName, user.email, user.username]
        .some(value => String(value || '').toLowerCase().includes(query))
      return matchesRole && matchesSearch
    })
  }, [users, search, roleFilter])

  const changeRole = async () => {
    if (action?.type !== 'role') return
    setActionLoading(true)
    try {
      const role = action.user.role === 'admin' ? 'user' : 'admin'
      const result = await apiRequest(`/admin/users/${encodeURIComponent(action.user.uid)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      showToast(result.message || 'Role updated', { type: 'success', title: 'Role updated' })
      setAction(null)
      await loadData({ silent: true })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Update failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const deleteUser = async () => {
    if (action?.type !== 'delete') return
    setActionLoading(true)
    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(action.user.uid)}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation }),
      })
      showToast(result.message || 'User deleted', { type: 'success', title: 'Account deleted' })
      setAction(null)
      setConfirmation('')
      await loadData({ silent: true })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Deletion failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const changeStatus = async () => {
    if (action?.type !== 'status') return
    setActionLoading(true)
    try {
      const status = action.user.accountStatus === 'blocked' ? 'active' : 'blocked'
      const result = await apiRequest(`/admin/users/${encodeURIComponent(action.user.uid)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      showToast(result.message || 'Account status updated', { type: 'success', title: 'Status updated' })
      setAction(null)
      await loadData({ silent: true })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Status update failed' })
    } finally {
      setActionLoading(false)
    }
  }

  const unlockUser = async user => {
    try {
      const result = await apiRequest(`/admin/users/${encodeURIComponent(user.uid)}/unlock`, { method: 'POST' })
      showToast(result.message || 'Account unlocked', { type: 'success', title: 'Login restored' })
      await loadData({ silent: true })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Unlock failed' })
    }
  }

  const markAlertRead = async (alert, read = true) => {
    try {
      await apiRequest(`/admin/alerts/${encodeURIComponent(alert.id)}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ read })
      })
      setAlerts(current => current.map(item => item.id === alert.id ? { ...item, read } : item))
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Notification update failed' })
    }
  }

  const markAllAlertsRead = async () => {
    try {
      const result = await apiRequest('/admin/alerts/read-all', { method: 'POST' })
      setAlerts(current => current.map(item => ({ ...item, read: true })))
      showToast(result.message, { type: 'success' })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error' })
    }
  }

  const updateFeedback = async (item, status, reply = '') => {
    setFeedbackUpdating(true)
    try {
      const result = await apiRequest(`/admin/feedback/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reply })
      })
      setFeedback(current => current.map(entry => entry.id === item.id ? result.data.feedback : entry))
      setFeedbackReplyId(null)
      setFeedbackReply('')
      showToast(result.message, { type: 'success', title: 'User notified' })
    } catch (requestError) {
      showToast(requestError.message, { type: 'error', title: 'Feedback update failed' })
    } finally {
      setFeedbackUpdating(false)
    }
  }

  const enableBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here', { type: 'warning' })
      return
    }
    const permission = await Notification.requestPermission()
    showToast(permission === 'granted' ? 'Browser notifications enabled' : 'Notification permission was not granted', {
      type: permission === 'granted' ? 'success' : 'warning'
    })
  }

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const navigation = [
    { id: 'overview', label: 'Overview', icon: 'overview' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'alerts', label: `Notifications${alerts.some(alert => !alert.read) ? ` (${alerts.filter(alert => !alert.read).length})` : ''}`, icon: 'bell' },
    { id: 'feedback', label: 'Feedback', icon: 'feedback' },
  ]

  const cards = [
    { label: 'Registered users', value: stats.totalUsers, detail: `${stats.verifiedUsers} verified accounts`, icon: 'users', color: 'bg-blue-50 text-blue-700' },
    { label: 'Voice recordings', value: stats.voiceRecordings, detail: `${stats.enrolledUsers} enrolled users`, icon: 'mic', color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Verifications', value: stats.totalVerifications, detail: 'Completed voice checks', icon: 'check', color: 'bg-violet-50 text-violet-700' },
    { label: 'Administrators', value: stats.adminUsers, detail: 'Privileged accounts', icon: 'shield', color: 'bg-amber-50 text-amber-700' },
  ]

  const UserTable = ({ rows, limit }) => {
    const displayedRows = limit ? rows.slice(0, limit) : rows
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-6 py-4">User</th>
              <th className="px-5 py-4">Role</th>
              <th className="px-5 py-4">Account status</th>
              <th className="px-5 py-4 text-center">Voices</th>
              <th className="px-5 py-4">Joined</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedRows.map(user => {
              const isSelf = user.uid === currentUser?.uid
              const unlockAt = user.unlockAvailableAt ? new Date(user.unlockAvailableAt).getTime() : 0
              const unlockWaitSeconds = user.locked && unlockAt > clock
                ? Math.ceil((unlockAt - clock) / 1000)
                : 0
              const canUnlock = user.locked && unlockWaitSeconds === 0
              return (
                <tr key={user.uid} className="bg-white transition hover:bg-slate-50/70">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                        {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{user.displayName || 'Unnamed user'}</p>
                          {isSelf && <span className="text-[10px] font-bold uppercase text-emerald-600">You</span>}
                        </div>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                        {user.username && <p className="truncate text-xs text-slate-400">@{user.username}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><Badge tone={user.role === 'admin' ? 'purple' : 'gray'}>{user.role === 'admin' ? 'Admin' : 'User'}</Badge></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={user.accountStatus === 'blocked' ? 'red' : user.locked ? 'amber' : 'green'}>
                        {user.accountStatus === 'blocked' ? 'Blocked' : user.locked ? 'Locked' : 'Active'}
                      </Badge>
                      <Badge tone={user.emailVerified ? 'green' : 'amber'}>{user.emailVerified ? 'Verified' : 'Unverified'}</Badge>
                      {user.mfaEnabled && <Badge tone="blue">MFA</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center text-sm font-bold text-slate-700">{user.voiceprintCount}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {user.locked && (
                        <button
                          type="button"
                          disabled={!canUnlock}
                          onClick={() => unlockUser(user)}
                          title={canUnlock ? 'Unlock this account' : `Admin unlock available in ${unlockWaitSeconds} seconds`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Icon name="lock" className="h-4 w-4" /> {canUnlock ? 'Unlock' : `Wait ${unlockWaitSeconds}s`}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => setAction({ type: 'status', user })}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${user.accountStatus === 'blocked' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
                      >
                        <Icon name="block" className="h-4 w-4" />
                        {user.accountStatus === 'blocked' ? 'Activate' : 'Block'}
                      </button>
                      <button
                        type="button"
                        disabled={isSelf && user.role === 'admin'}
                        onClick={() => setAction({ type: 'role', user })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        type="button"
                        disabled={isSelf || user.role === 'admin'}
                        onClick={() => {
                          setConfirmation('')
                          setAction({ type: 'delete', user })
                        }}
                        className="rounded-lg border border-red-200 bg-white p-2 text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                        title={user.role === 'admin' ? 'Remove admin role before deletion' : 'Delete user'}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!displayedRows.length && (
          <div className="px-6 py-16 text-center">
            <Icon name="users" className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No users found.</p>
          </div>
        )}
      </div>
    )
  }

  const ActivityList = ({ limit }) => {
    const items = limit ? recentActivity.slice(0, limit) : recentActivity
    return (
      <div className="divide-y divide-slate-100">
        {items.map(event => {
          const user = userById.get(event.userId)
          const successful = event.status === 'success'
          return (
            <div key={event.id} className="flex items-center gap-4 px-6 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${successful ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                <Icon name={event.operation === 'verify' ? 'check' : 'mic'} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold capitalize text-slate-800">{event.operation} · {event.decision || event.status}</p>
                <p className="truncate text-xs text-slate-500">{user?.displayName || user?.email || `User ${event.userId.slice(0, 8)}`}</p>
              </div>
              <div className="text-right">
                <Badge tone={successful ? 'green' : 'red'}>{event.status}</Badge>
                <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(event.timestamp)}</p>
              </div>
            </div>
          )
        })}
        {!items.length && <p className="px-6 py-14 text-center text-sm text-slate-500">No activity recorded yet.</p>}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900 lg:flex" style={{ colorScheme: 'only light' }}>
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white text-slate-900 lg:sticky lg:top-0 lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-6">
          <img src={halfLogo} alt="Voice Identity Shield" className="h-10 w-auto" />
          <div>
            <p className="text-sm font-bold text-slate-900">Voice Identity</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">Administration</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-7">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Main menu</p>
          <div className="space-y-1.5">
            {navigation.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold transition ${view === item.id ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              {(currentUser?.displayName || currentUser?.email || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900">{currentUser?.displayName || 'Administrator'}</p>
              <p className="truncate text-[11px] text-slate-500">{currentUser?.email}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-700">
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="border-b border-slate-200 bg-white lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <img src={halfLogo} alt="Voice Identity Shield" className="h-9 w-auto" />
              <div>
                <p className="text-sm font-bold text-slate-900">Administration</p>
                <p className="text-[10px] text-slate-500">Voice Identity Shield</p>
              </div>
            </div>
            <button type="button" onClick={signOut} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Icon name="logout" /></button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-3">
            {navigation.map(item => (
              <button key={item.id} type="button" onClick={() => setView(item.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold ${view === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.label}</button>
            ))}
          </div>
        </div>

        <header className="hidden h-20 items-center justify-between border-b border-slate-200 bg-white px-8 lg:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Admin console</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{navigation.find(item => item.id === view)?.label}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Connected
            </div>
            <button type="button" onClick={() => loadData({ silent: true })} disabled={refreshing} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              <Icon name="refresh" className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {error && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Could not load all administration data</p>
                <p className="mt-0.5 text-red-700">{error}</p>
              </div>
              <button type="button" onClick={() => loadData()} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white">Try again</button>
            </div>
          )}

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white" />)}
            </div>
          ) : (
            <>
              {view === 'overview' && (
                <div className="space-y-7">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard overview</h2>
                    <p className="mt-1 text-sm text-slate-500">Monitor accounts, voice enrollment and verification activity.</p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map(card => (
                      <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-500">{card.label}</p>
                            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{card.value.toLocaleString()}</p>
                          </div>
                          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color}`}><Icon name={card.icon} /></div>
                        </div>
                        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{card.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-6 flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-slate-900">Voice activity</h3>
                          <p className="mt-1 text-xs text-slate-500">Enrollments and verifications during the last 7 days</p>
                        </div>
                        <Badge tone="green">Last 7 days</Badge>
                      </div>
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={charts.activityTrend} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                            <defs>
                              <linearGradient id="verificationFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                              </linearGradient>
                              <linearGradient id="enrollmentFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 28px rgba(15,23,42,.10)', fontSize: 12 }} />
                            <Area type="monotone" dataKey="verifications" name="Verifications" stroke="#10b981" strokeWidth={2.5} fill="url(#verificationFill)" />
                            <Area type="monotone" dataKey="enrollments" name="Enrollments" stroke="#3b82f6" strokeWidth={2.5} fill="url(#enrollmentFill)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-6 text-xs font-medium text-slate-500">
                        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Verifications</span>
                        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Enrollments</span>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Verification results</h3>
                        <p className="mt-1 text-xs text-slate-500">Distribution of all recorded decisions</p>
                      </div>
                      <div className="relative mx-auto mt-3 h-56 max-w-xs">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={charts.verificationBreakdown} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                              {charts.verificationBreakdown.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-slate-900">{charts.verificationBreakdown.reduce((sum, item) => sum + item.value, 0)}</span>
                          <span className="text-[11px] font-medium text-slate-400">Total checks</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {charts.verificationBreakdown.map((item, index) => (
                          <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />{item.name}</span>
                            <span className="font-bold text-slate-900">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">User growth</h3>
                        <p className="mt-1 text-xs text-slate-500">New registrations over the last 6 months</p>
                      </div>
                      <div className="mt-5 h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={charts.userGrowth} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                            <Bar dataKey="registrations" name="New users" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={42} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div>
                        <h3 className="font-bold text-slate-900">Platform coverage</h3>
                        <p className="mt-1 text-xs text-slate-500">Account readiness and voice enrollment</p>
                      </div>
                      <div className="mt-8 space-y-7">
                        {[
                          { label: 'Email verification', value: stats.totalUsers ? Math.round((stats.verifiedUsers / stats.totalUsers) * 100) : 0, color: 'bg-emerald-500' },
                          { label: 'Voice enrollment', value: stats.totalUsers ? Math.round((stats.enrolledUsers / stats.totalUsers) * 100) : 0, color: 'bg-blue-500' },
                          { label: 'Administrator coverage', value: stats.totalUsers ? Math.round((stats.adminUsers / stats.totalUsers) * 100) : 0, color: 'bg-violet-500' },
                        ].map(item => (
                          <div key={item.label}>
                            <div className="mb-2 flex items-center justify-between text-sm">
                              <span className="font-medium text-slate-700">{item.label}</span>
                              <span className="font-bold text-slate-900">{item.value}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                        <div>
                          <h3 className="font-bold text-slate-900">Recently registered users</h3>
                          <p className="mt-1 text-xs text-slate-500">Latest accounts created in the system</p>
                        </div>
                        <button type="button" onClick={() => setView('users')} className="flex items-center gap-1 text-sm font-semibold text-emerald-700">View all <Icon name="arrow" className="h-4 w-4" /></button>
                      </div>
                      <UserTable rows={users} limit={5} />
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 px-6 py-5">
                        <h3 className="font-bold text-slate-900">Recent security activity</h3>
                        <p className="mt-1 text-xs text-slate-500">Latest enrollment and verification events</p>
                      </div>
                      <ActivityList limit={6} />
                      <button type="button" onClick={() => setView('activity')} className="w-full border-t border-slate-100 px-6 py-4 text-sm font-semibold text-emerald-700 hover:bg-slate-50">View complete activity</button>
                    </div>
                  </div>
                </div>
              )}

              {view === 'users' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">User management</h2>
                      <p className="mt-1 text-sm text-slate-500">{filteredUsers.length} of {users.length} registered accounts</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <label className="relative block">
                        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search users" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:w-72" />
                      </label>
                      <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500">
                        <option value="all">All roles</option>
                        <option value="admin">Administrators</option>
                        <option value="user">Users</option>
                      </select>
                    </div>
                  </div>
                  <UserTable rows={filteredUsers} />
                </div>
              )}

              {view === 'activity' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-5">
                    <h2 className="text-xl font-bold text-slate-900">Security activity</h2>
                    <p className="mt-1 text-sm text-slate-500">Recent voice enrollment and verification events.</p>
                  </div>
                  <ActivityList />
                </div>
              )}

              {view === 'alerts' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Security notifications</h2>
                      <p className="mt-1 text-sm text-slate-500">Account lock, block, unlock and role-change alerts.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="green">AES-256-GCM encrypted</Badge>
                      <button type="button" onClick={enableBrowserNotifications} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Enable browser alerts</button>
                      {alerts.some(alert => !alert.read) && <button type="button" onClick={markAllAlertsRead} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Mark all read</button>}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {alerts.map(alert => {
                      const alertUser = userById.get(alert.userId)
                      return (
                        <div key={alert.id} className={`flex items-start gap-4 px-6 py-5 ${alert.read ? 'bg-white' : 'bg-sky-50/50'}`}>
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${alert.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            <Icon name="bell" className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold capitalize text-slate-900">{String(alert.type || '').replaceAll('_', ' ')}</p>
                              <Badge tone={alert.severity === 'warning' ? 'amber' : 'blue'}>{alert.severity}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                            <p className="mt-1 text-xs text-slate-400">{alertUser?.email || alert.userId || 'System'} · {formatDateTime(alert.createdAt)}</p>
                          </div>
                          <button type="button" onClick={() => markAlertRead(alert, !alert.read)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            {alert.read ? 'Mark unread' : 'Mark read'}
                          </button>
                        </div>
                      )
                    })}
                    {!alerts.length && <p className="px-6 py-16 text-center text-sm text-slate-500">No security notifications yet.</p>}
                  </div>
                </div>
              )}

              {view === 'feedback' && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Encrypted feedback</h2>
                      <p className="mt-1 text-sm text-slate-500">Messages are encrypted at rest and decrypted only for administrators.</p>
                    </div>
                    <Badge tone="green">Encrypted</Badge>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {feedback.map(item => {
                      const feedbackUser = userById.get(item.userId)
                      return (
                        <div key={item.id} className="px-6 py-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Badge tone="blue">{item.category}</Badge>
                              <span className="text-xs text-slate-400">{feedbackUser?.email || item.userId}</span>
                            </div>
                            <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message}</p>
                          {item.reply && (
                            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Administrator response</p>
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.reply}</p>
                              <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.repliedAt)}</p>
                            </div>
                          )}
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <select
                              value={item.status || 'new'}
                              disabled={feedbackUpdating}
                              onChange={event => updateFeedback(item, event.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500"
                            >
                              <option value="new">New</option>
                              <option value="in_progress">In progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setFeedbackReplyId(feedbackReplyId === item.id ? null : item.id)
                                setFeedbackReply(item.reply || '')
                              }}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                            >
                              {item.reply ? 'Edit response' : 'Reply to user'}
                            </button>
                          </div>
                          {feedbackReplyId === item.id && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <label className="text-sm font-semibold text-slate-800">Encrypted response</label>
                              <textarea
                                value={feedbackReply}
                                onChange={event => setFeedbackReply(event.target.value)}
                                maxLength={2000}
                                rows={4}
                                className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-emerald-500"
                                placeholder="Write a response for this user..."
                              />
                              <div className="mt-3 flex justify-end gap-2">
                                <button type="button" onClick={() => { setFeedbackReplyId(null); setFeedbackReply('') }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                                <button type="button" disabled={feedbackUpdating || !feedbackReply.trim()} onClick={() => updateFeedback(item, item.status || 'in_progress', feedbackReply)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Send response</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!feedback.length && <p className="px-6 py-16 text-center text-sm text-slate-500">No feedback submitted yet.</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </section>

      {action && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${action.type === 'delete' || (action.type === 'status' && action.user.accountStatus !== 'blocked') ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-700'}`}>
              <Icon name={action.type === 'delete' ? 'trash' : action.type === 'status' ? 'block' : 'role'} />
            </div>
            <button type="button" onClick={() => setAction(null)} className="absolute right-5 top-5 text-slate-400"><Icon name="close" /></button>
            <h3 className="mt-5 text-xl font-bold text-slate-900">
              {action.type === 'delete'
                ? 'Delete user permanently?'
                : action.type === 'status'
                  ? action.user.accountStatus === 'blocked' ? 'Activate this account?' : 'Block this account?'
                  : action.user.role === 'admin' ? 'Remove admin access?' : 'Grant admin access?'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {action.type === 'delete'
                ? `This permanently removes ${action.user.email}, all voice recordings and related account data.`
                : action.type === 'status'
                  ? action.user.accountStatus === 'blocked'
                    ? `${action.user.email} will be able to sign in again.`
                    : `${action.user.email} will be signed out and prevented from accessing the system.`
                  : `${action.user.email} will ${action.user.role === 'admin' ? 'lose' : 'receive'} access to this administration console.`}
            </p>
            {action.type === 'delete' && (
              <div className="mt-5">
                <label className="text-xs font-semibold text-slate-600">Type the email to confirm</label>
                <p className="mt-1 text-xs font-medium text-red-600">{action.user.email}</p>
                <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoFocus placeholder="Enter the full email" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={action.type === 'delete' ? deleteUser : action.type === 'status' ? changeStatus : changeRole} disabled={actionLoading || (action.type === 'delete' && confirmation.trim().toLowerCase() !== action.user.email.toLowerCase())} className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${action.type === 'delete' || (action.type === 'status' && action.user.accountStatus !== 'blocked') ? 'bg-red-600 hover:bg-red-700' : action.type === 'status' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
                {actionLoading ? 'Please wait...' : action.type === 'delete' ? 'Delete permanently' : action.type === 'status' ? action.user.accountStatus === 'blocked' ? 'Activate account' : 'Block account' : 'Confirm change'}
              </button>
              <button type="button" disabled={actionLoading} onClick={() => { setAction(null); setConfirmation('') }} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
