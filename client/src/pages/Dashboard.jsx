import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  Legend
} from 'recharts'
import { getUserVerificationHistory } from '../services/auditApi'
import { getVerificationHistory as getLocalVerificationHistory, getVoiceprint as getVoiceprintLocal, clearAllData, getEncryptionKey as getEncryptionKeyLocal } from '../services/storage'
import { getVoiceprint, getVoiceprints, updateVoiceprintName, deleteVoiceprint } from '../services/userApi'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { decryptAudioBlob } from '../services/encryption'
import { downloadFileAsArrayBuffer } from '../services/storageApi'
// Icons as SVG components
const Trash2 = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const Shield = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)

const AlertTriangle = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

const CheckCircle = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const Dashboard = () => {
  const { currentUser } = useAuth()
  const { showToast } = useToast()
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(null)
  const [voiceprints, setVoiceprints] = useState([])
  const [selectedVoiceprintId, setSelectedVoiceprintId] = useState(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [audioError, setAudioError] = useState(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [isUpdatingName, setIsUpdatingName] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isLoadingVoiceprints, setIsLoadingVoiceprints] = useState(true)

  const selectedVoiceprint = voiceprints.find((vp) => vp.id === selectedVoiceprintId) || null
  const selectedEncryptionKey = selectedVoiceprint?.encryptionKey || null

  const normalizeVoiceprint = (voiceprint) => {
    if (!voiceprint) {
      return null
    }

    const name = voiceprint.name
      || voiceprint.enrollmentMeta?.name
      || voiceprint.displayName
      || 'My Voice Recording'

    const encryptionKey = voiceprint.encryptionKey
      || voiceprint.enrollmentMeta?.encryption?.key
      || voiceprint.enrollmentMeta?.encryptionKey
      || null

    const timestamp = voiceprint.timestamp
      || voiceprint.createdAt
      || voiceprint.updatedAt
      || voiceprint.enrollmentMeta?.createdAt
      || null

    return {
      ...voiceprint,
      name,
      encryptionKey,
      timestamp,
    }
  }

  useEffect(() => {
    loadData()
  }, [currentUser])

  useEffect(() => {
    if (historyError) {
      showToast(historyError, { type: 'warning' })
    }
  }, [historyError, showToast])

  useEffect(() => {
    if (audioError) {
      showToast(audioError, { type: 'error' })
    }
  }, [audioError, showToast])

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  const mapDecisionToVerdict = (decision, status) => {
    if (status && status !== 'success') {
      if (status === 'failure') return 'Failed'
      if (status === 'processing') return 'Processing'
    }

    switch (decision) {
      case 'ACCEPT':
        return 'Authentic'
      case 'CHALLENGE':
        return 'Uncertain'
      case 'REJECT':
        return 'Possible Deepfake'
      default:
        return decision || 'Unknown'
    }
  }

  const handleSelectVoiceprint = (voiceprintId) => {
    if (!voiceprintId || voiceprintId === selectedVoiceprintId) {
      return
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }

    setAudioError(null)
    setIsEditingName(false)
    setEditedName('')
    setSelectedVoiceprintId(voiceprintId)
  }

  const normalizeServerEvent = (event) => {
    const similarity = typeof event.matchScore === 'number'
      ? event.matchScore
      : typeof event.finalScore === 'number'
      ? event.finalScore
      : 0

    return {
      id: event.verificationId || event.id,
      verificationId: event.verificationId || event.id,
      similarity,
      verdict: mapDecisionToVerdict(event.decision, event.status),
      status: event.status || 'unknown',
      decision: event.decision || null,
      timestamp: event.timestamp,
      matchScore: event.matchScore,
      finalScore: event.finalScore,
      syntheticScore: event.syntheticScore,
      riskScore: event.riskScore,
      metadata: event.metadata || {},
      error: event.error || null
    }
  }

  const normalizeLocalEntry = (item) => ({
    id: item.id,
    verificationId: item.verificationId || item.id,
    similarity: typeof item.similarity === 'number' ? item.similarity : 0,
    verdict: item.verdict || 'Unknown',
    status: item.status || 'success',
    decision: item.decision || null,
    timestamp: item.timestamp,
    matchScore: item.matchScore,
    finalScore: item.finalScore,
    syntheticScore: item.syntheticScore,
    riskScore: item.riskScore,
    metadata: item.metadata || {},
    error: item.error || null
  })

  const loadData = async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    setIsLoadingVoiceprints(true)

    let verificationHistory = []

    if (currentUser) {
      try {
        const apiHistory = await getUserVerificationHistory(100)

        if (apiHistory.success) {
          verificationHistory = apiHistory.events.map(normalizeServerEvent)
        } else if (apiHistory.error) {
          setHistoryError(apiHistory.error)
        }
      } catch (error) {
        setHistoryError(error.message || 'Failed to load verification history')
      }
    }

    if (verificationHistory.length === 0) {
      const localHistory = getLocalVerificationHistory(currentUser?.uid)
      verificationHistory = localHistory.map(normalizeLocalEntry)
    }

    const sortedHistory = verificationHistory.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateB - dateA
    })

    setHistory(sortedHistory)
    setHistoryLoading(false)
    
    // Try to get voiceprints from backend API
    let storedVoiceprints = []

    try {
      if (currentUser) {
        try {
          const apiResult = await getVoiceprints()
          if (apiResult.success && Array.isArray(apiResult.data)) {
            storedVoiceprints = apiResult.data
              .map(normalizeVoiceprint)
              .filter(Boolean)
          }
        } catch (error) {
          console.warn('Failed to get voiceprints from API:', error)
        }

        // Fallback to legacy endpoint if new endpoint unavailable
        if (storedVoiceprints.length === 0) {
          try {
            const legacyResult = await getVoiceprint()
            if (legacyResult.success && legacyResult.data) {
              storedVoiceprints = [{
                ...normalizeVoiceprint(legacyResult.data),
                encryptionKey: legacyResult.encryptionKey
                  || legacyResult.data?.encryptionKey
                  || legacyResult.encryptionKey
                  || null
              }].filter(Boolean)
            }
          } catch (error) {
            console.warn('Failed to get legacy voiceprint from API:', error)
          }
        }
      }

      // Fallback to localStorage if API didn't work
      if (storedVoiceprints.length === 0) {
        const localVoiceprint = getVoiceprintLocal(currentUser?.uid)
        const localEncryptionKey = getEncryptionKeyLocal(currentUser?.uid)
        if (localVoiceprint) {
          storedVoiceprints = [{
            ...normalizeVoiceprint(localVoiceprint),
            id: localVoiceprint.id || 'local-voiceprint',
            encryptionKey: localVoiceprint.encryptionKey || localEncryptionKey || null,
          }].filter(Boolean)
        }
      }

      const sortedVoiceprints = storedVoiceprints
        .map(normalizeVoiceprint)
        .filter(Boolean)
        .sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
          return dateB - dateA
        })

      const nextSelectedId = sortedVoiceprints.length > 0
        ? (sortedVoiceprints.some(vp => vp.id === selectedVoiceprintId)
          ? selectedVoiceprintId
          : sortedVoiceprints[0].id)
        : null

      setVoiceprints(sortedVoiceprints)
      setSelectedVoiceprintId(nextSelectedId)
    } finally {
      setIsLoadingVoiceprints(false)
    }
  }

  const renderSkeleton = () => (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-4 flex-1">
            <div className="h-10 w-48 bg-dark/40 rounded-xl animate-pulse" />
            <div className="h-4 w-64 bg-dark/40 rounded-xl animate-pulse" />
          </div>
          <div className="flex gap-4">
            <div className="h-11 w-32 bg-dark/40 rounded-2xl animate-pulse" />
            <div className="h-11 w-32 bg-dark/40 rounded-2xl animate-pulse" />
          </div>
        </div>

        <div className="card-soft rounded-2xl p-6 shadow-soft space-y-6">
          <div className="h-6 w-56 bg-dark/40 rounded-xl animate-pulse" />
          <div className="h-4 w-40 bg-dark/40 rounded-xl animate-pulse" />
          <div className="h-32 bg-dark/40 rounded-2xl animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="card-soft rounded-2xl p-6 shadow-soft space-y-4 animate-pulse">
              <div className="h-8 w-16 bg-dark/40 rounded-xl" />
              <div className="h-4 w-24 bg-dark/40 rounded-xl" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((item) => (
            <div key={item} className="card-soft rounded-2xl p-6 shadow-soft space-y-4 animate-pulse">
              <div className="h-5 w-40 bg-dark/40 rounded-xl" />
              <div className="h-64 bg-dark/40 rounded-2xl" />
            </div>
          ))}
        </div>

        <div className="card-soft rounded-2xl p-6 shadow-soft space-y-4 animate-pulse">
          <div className="h-5 w-48 bg-dark/40 rounded-xl" />
          <div className="h-4 w-2/3 bg-dark/40 rounded-xl" />
          <div className="h-48 bg-dark/40 rounded-2xl" />
        </div>
      </div>
    </div>
  )

  const loadAndDecryptAudio = async () => {
    const serverCanDecrypt = Boolean(selectedVoiceprint?.audioStoragePath?.includes('/voiceprints/'))
    if (!selectedVoiceprint || (!selectedEncryptionKey && !serverCanDecrypt)) {
      setAudioError('Voiceprint or encryption key not found')
      return
    }

    setIsLoadingAudio(true)
    setAudioError(null)

    try {
      // Check if we have audioStoragePath or audioUrl from backend storage
      if (selectedVoiceprint.audioStoragePath || selectedVoiceprint.audioUrl) {
        let encryptedArrayBuffer = null
        let downloadedContentType = null

        // Use storage path from backend API
        if (selectedVoiceprint.audioStoragePath) {
          const downloadResult = await downloadFileAsArrayBuffer(selectedVoiceprint.audioStoragePath)
          if (!downloadResult.success) {
            throw new Error(downloadResult.error || 'Failed to download audio file')
          }
          encryptedArrayBuffer = downloadResult.data
          downloadedContentType = downloadResult.contentType
        } else if (selectedVoiceprint.audioUrl) {
          // Fallback to direct URL fetch (may have CORS issues)
          try {
            const response = await fetch(selectedVoiceprint.audioUrl)
            if (!response.ok) {
              throw new Error('Failed to download audio file')
            }
            encryptedArrayBuffer = await response.arrayBuffer()
          } catch (fetchError) {
            // If fetch fails due to CORS, try to extract path from URL and use SDK
            console.warn('Direct fetch failed, trying to extract path from URL')
            const urlParts = selectedVoiceprint.audioUrl.split('/o/')
            if (urlParts.length > 1) {
              const pathPart = decodeURIComponent(urlParts[1].split('?')[0])
              const downloadResult = await downloadFileAsArrayBuffer(pathPart)
              if (downloadResult.success) {
                encryptedArrayBuffer = downloadResult.data
              } else {
                throw fetchError
              }
            } else {
              throw fetchError
            }
          }
        }
        
        if (!encryptedArrayBuffer) {
          throw new Error('Failed to download audio file')
        }

        const bytes = new Uint8Array(encryptedArrayBuffer)
        let decryptedBlob = downloadedContentType?.startsWith('audio/')
          ? new Blob([encryptedArrayBuffer], { type: downloadedContentType })
          : null

        // Attempt to parse AES-GCM payload (JSON string)
        if (!decryptedBlob) {
          try {
            const decodedString = new TextDecoder().decode(bytes)
            const parsedPayload = JSON.parse(decodedString)
            if (parsedPayload && parsedPayload.iv && parsedPayload.tag && parsedPayload.data) {
              decryptedBlob = await decryptAudioBlob(parsedPayload, selectedEncryptionKey, {
                mimeType: parsedPayload.originalMimeType || selectedVoiceprint?.enrollmentMeta?.encryption?.originalMimeType || 'audio/wav'
              })
            }
          } catch {
            // Not JSON payload, continue to fallback handling
          }
        }

        // Fallback to CryptoJS base64 payload
        if (!decryptedBlob) {
          let binaryString = ''
          for (let i = 0; i < bytes.length; i++) {
            binaryString += String.fromCharCode(bytes[i])
          }
          const base64String = btoa(binaryString)
          decryptedBlob = await decryptAudioBlob(base64String, selectedEncryptionKey, {
            mimeType: selectedVoiceprint?.enrollmentMeta?.encryption?.originalMimeType || 'audio/webm'
          })
        }

        const url = URL.createObjectURL(decryptedBlob)
        setAudioUrl(url)
      } else if (selectedVoiceprint.encryptedAudio) {
        // For localStorage fallback - encryptedAudio is already a data URL or needs decryption
        // If it's a data URL starting with 'blob:' or 'data:', use it directly
        if (selectedVoiceprint.encryptedAudio.startsWith('blob:') || selectedVoiceprint.encryptedAudio.startsWith('data:')) {
          setAudioUrl(selectedVoiceprint.encryptedAudio)
        } else {
          // Otherwise, try to decrypt it
          const decryptedBlob = await decryptAudioBlob(selectedVoiceprint.encryptedAudio, selectedEncryptionKey)
          const url = URL.createObjectURL(decryptedBlob)
          setAudioUrl(url)
        }
      } else {
        throw new Error('No audio data found in voiceprint')
      }
    } catch (error) {
      console.error('Error loading audio:', error)
      setAudioError(error.message || 'Failed to load audio')
    } finally {
      setIsLoadingAudio(false)
    }
  }

  const handleClearData = () => {
    // Cleanup audio URL if exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    clearAllData(currentUser?.uid)
    setHistory([])
    setVoiceprints([])
    setSelectedVoiceprintId(null)
    setAudioError(null)
    setIsEditingName(false)
    setEditedName('')
    setShowClearConfirm(false)
    showToast('Local voice data cleared', { type: 'success' })
  }

  const handleStartEditName = () => {
    if (!selectedVoiceprint) {
      return
    }
    setEditedName(selectedVoiceprint?.name || 'My Voice Recording')
    setIsEditingName(true)
  }

  const handleCancelEditName = () => {
    setIsEditingName(false)
    setEditedName('')
  }

  const handleSaveName = async () => {
    if (!currentUser || !editedName.trim() || !selectedVoiceprint) {
      return
    }

    setIsUpdatingName(true)
    try {
      const trimmedName = editedName.trim()
      const result = await updateVoiceprintName(trimmedName, selectedVoiceprint.id)
      if (result.success) {
        setVoiceprints((prev) =>
          prev.map((vp) =>
            vp.id === selectedVoiceprint.id
              ? { ...vp, name: trimmedName, updatedAt: new Date().toISOString() }
              : vp
          )
        )
        setIsEditingName(false)
        setEditedName('')
        showToast('Voiceprint name updated', { type: 'success' })
      } else {
        showToast(result.error || 'Failed to update voiceprint name', { type: 'error' })
      }
    } catch (error) {
      console.error('Error updating name:', error)
      showToast(
        error?.message
          ? `Failed to update voiceprint name: ${error.message}`
          : 'Failed to update voiceprint name',
        { type: 'error' }
      )
    } finally {
      setIsUpdatingName(false)
    }
  }

  const handleDeleteVoiceprint = async () => {
    if (!currentUser || !selectedVoiceprint) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteVoiceprint(selectedVoiceprint.id)
      
      if (result.success) {
        const updatedVoiceprints = voiceprints.filter((vp) => vp.id !== selectedVoiceprint.id)
        const nextSelectedId = updatedVoiceprints.length > 0 ? updatedVoiceprints[0].id : null

        setVoiceprints(updatedVoiceprints)
        setSelectedVoiceprintId(nextSelectedId)

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl)
          setAudioUrl(null)
        }

        if (updatedVoiceprints.length === 0) {
          clearAllData(currentUser?.uid)
        }

        setShowDeleteConfirm(false)
        showToast('Voiceprint deleted', { type: 'success' })
      } else {
        showToast(result.error || 'Failed to delete voiceprint', { type: 'error' })
      }
    } catch (error) {
      console.error('Error deleting voiceprint:', error)
      showToast(
        error?.message ? `Failed to delete voiceprint: ${error.message}` : 'Failed to delete voiceprint',
        { type: 'error' }
      )
    } finally {
      setIsDeleting(false)
    }
  }

  // Prepare chart data
  const successfulHistory = history.filter(item => item.status === 'success')

  const chartData = successfulHistory
    .slice(0, 10)
    .reverse()
    .map((item, index) => ({
      name: `Check ${index + 1}`,
      similarity: Math.round(item.similarity * 100),
      timestamp: new Date(item.timestamp).toLocaleDateString(),
    }))

  const stats = {
    total: successfulHistory.length,
    authentic: successfulHistory.filter((h) => h.verdict === 'Authentic').length,
    deepfake: successfulHistory.filter((h) => h.verdict === 'Possible Deepfake').length,
    uncertain: successfulHistory.filter((h) => h.verdict === 'Uncertain').length,
    avgSimilarity: successfulHistory.length > 0
      ? Math.round(
          (successfulHistory.reduce((sum, h) => sum + h.similarity, 0) / successfulHistory.length) * 100
        )
      : 0,
  }

  const selectedVoiceprintDate = selectedVoiceprint
    ? new Date(selectedVoiceprint.timestamp || selectedVoiceprint.createdAt || selectedVoiceprint.updatedAt || Date.now())
    : null

  const chartTooltipStyle = useMemo(
    () => ({
      backgroundColor: '#182028',
      border: '1px solid #1F2F35',
      borderRadius: '12px',
      color: '#E8F1E9',
      fontSize: '12px',
      padding: '8px 10px'
    }),
    []
  )

  const verdictColors = useMemo(
    () => ({
      Authentic: '#00FF88', // accent
      'Possible Deepfake': '#00C853', // primary
      Uncertain: '#66FFB2' // mid-toned green
    }),
    []
  )

  const riskLineColor = '#33FFAA'

  const timelineData = useMemo(() => {
    const bucketMap = new Map()

    history.forEach((item) => {
      if (!item.timestamp) return
      const dateObj = new Date(item.timestamp)
      if (Number.isNaN(dateObj.getTime())) return
      const key = dateObj.toISOString().slice(0, 10)

      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          key,
          label: dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          authentic: 0,
          deepfake: 0,
          uncertain: 0,
          total: 0,
          time: dateObj.getTime()
        })
      }

      const bucket = bucketMap.get(key)
      switch (item.verdict) {
        case 'Authentic':
          bucket.authentic += 1
          break
        case 'Possible Deepfake':
          bucket.deepfake += 1
          break
        case 'Uncertain':
          bucket.uncertain += 1
          break
        default:
          break
      }
      bucket.total += 1
    })

    return Array.from(bucketMap.values())
      .sort((a, b) => a.time - b.time)
      .slice(-12)
  }, [history])

  const scoreRiskTrend = useMemo(() => {
    return history
      .filter((item) => typeof item.similarity === 'number' && item.timestamp)
      .slice(0, 30)
      .reverse()
      .map((item, idx) => {
        const similarity = Math.round((item.similarity || 0) * 100)
        const finalScore = typeof item.finalScore === 'number' ? Math.round(item.finalScore * 100) : null
        const syntheticRisk = typeof item.syntheticScore === 'number' ? Math.round(item.syntheticScore * 100) : null
        const riskScore = typeof item.riskScore === 'number' ? Math.round(item.riskScore * 100) : null

        return {
          order: idx + 1,
          label: new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          similarity,
          finalScore,
          syntheticRisk,
          riskScore
        }
      })
  }, [history])

  const hasFinalScoreTrend = useMemo(
    () => scoreRiskTrend.some((item) => item.finalScore != null),
    [scoreRiskTrend]
  )

  const hasSyntheticRiskTrend = useMemo(
    () => scoreRiskTrend.some((item) => item.syntheticRisk != null),
    [scoreRiskTrend]
  )

  const hasRiskScoreTrend = useMemo(
    () => scoreRiskTrend.some((item) => item.riskScore != null),
    [scoreRiskTrend]
  )

  if (isLoadingVoiceprints) {
    return renderSkeleton()
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-heading font-bold text-text-primary mb-2">
                Dashboard
              </h1>
              <p className="text-text-secondary">
                Monitor your voice verification history and statistics
              </p>
            </div>
            <div className="flex gap-4 mt-4 md:mt-0">
              <Link
                to="/verify"
                className="px-6 py-3 gradient-primary rounded-2xl font-semibold text-dark glow-hover transition-all shadow-soft-lg"
              >
                Verify Voice
              </Link>
              {voiceprints.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-6 py-3 bg-card/80 border border-error/50 rounded-2xl font-semibold text-error hover:bg-error/10 hover:border-error transition-all backdrop-blur-sm"
                >
                  <Trash2 className="w-4 h-4 inline mr-2" />
                  Clear Data
                </button>
              )}
            </div>
          </div>

          {/* Voiceprint Status */}
          {isLoadingVoiceprints ? (
            <div className="card-soft border border-border rounded-2xl p-6 mb-8 shadow-soft">
              <div className="flex items-center space-x-3 text-text-secondary">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span>Loading your voiceprints...</span>
              </div>
            </div>
          ) : selectedVoiceprint ? (
            <div className="card-soft border border-success/50 rounded-2xl p-6 mb-8 shadow-soft">
              <div className="space-y-6">
                {voiceprints.length > 1 && (
                  <div className="bg-dark/40 border border-border/60 rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        Saved Recordings
                      </h4>
                      <span className="text-xs text-text-secondary">{voiceprints.length} recordings</span>
                    </div>
                    <div className="grid gap-2 mt-3">
                      {voiceprints.map((vp) => {
                        const isActive = vp.id === selectedVoiceprintId
                        const created = new Date(vp.timestamp || vp.createdAt || vp.updatedAt || Date.now()).toLocaleDateString()
                        return (
                          <button
                            key={vp.id}
                            onClick={() => handleSelectVoiceprint(vp.id)}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border transition-all text-left ${
                              isActive
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'bg-dark/40 border-border/40 text-text-secondary hover:text-primary hover:border-primary/60'
                            }`}
                          >
                            <span className="font-medium text-sm truncate">{vp.name || 'My Voice Recording'}</span>
                            <span className="text-xs">{created}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between flex-col md:flex-row md:items-start gap-4">
                  <div className="flex items-center space-x-4 w-full">
                    <div className="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center">
                      <Shield className="w-6 h-6 text-success" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isEditingName ? (
                          <div className="flex items-center gap-2 flex-wrap w-full">
                            <input
                              type="text"
                              value={editedName}
                              onChange={(e) => setEditedName(e.target.value)}
                              className="flex-1 min-w-[200px] px-3 py-1 bg-dark/60 border border-primary rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                              maxLength={50}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveName}
                              disabled={isUpdatingName || !editedName.trim()}
                              className="px-3 py-1 bg-primary text-dark rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              {isUpdatingName ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEditName}
                              disabled={isUpdatingName}
                              className="px-3 py-1 bg-card border border-border rounded-lg hover:bg-card/80 transition-all disabled:opacity-50 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3 className="text-lg font-semibold text-text-primary">
                              {selectedVoiceprint.name || 'My Voice Recording'}
                            </h3>
                            <button
                              onClick={handleStartEditName}
                              className="text-text-secondary hover:text-primary transition-colors text-sm"
                              title="Rename"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-text-secondary text-sm">
                        Enrolled on {selectedVoiceprintDate?.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end">
                    <Link
                      to="/enroll"
                      className="text-primary hover:text-accent transition-colors text-sm font-semibold"
                    >
                      Re-enroll →
                    </Link>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-error hover:text-error/80 transition-colors p-2"
                      title="Delete voiceprint"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Audio Playback Section */}
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-md font-semibold text-text-primary">Your Enrolled Voice</h4>
                    {!audioUrl && !isLoadingAudio && (
                      <button
                        onClick={loadAndDecryptAudio}
                        className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-all text-sm font-medium"
                      >
                        Play Recording
                      </button>
                    )}
                  </div>

                  {isLoadingAudio && (
                    <div className="flex items-center space-x-2 text-primary">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm">Loading and decrypting audio...</span>
                    </div>
                  )}

                  {audioError && (
                    <div className="p-3 bg-error/20 border border-error/50 rounded-xl text-error text-sm space-y-2">
                      <p className="font-semibold">Unable to load audio: {audioError}</p>
                      {audioError.includes('CORS') && (
                        <div className="mt-2 text-xs text-text-secondary">
                          <p className="mb-1">To fix this, check backend storage configuration:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>Install Google Cloud SDK</li>
                            <li>Create a cors.json file (see docs/CORS_SETUP.md)</li>
                            <li>Run: <code className="bg-dark/50 px-1 rounded">gsutil cors set cors.json gs://your-bucket-name</code></li>
                            <li>Note: Requires Blaze plan (pay-as-you-go)</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  {audioUrl && !isLoadingAudio && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <div className="bg-dark/50 rounded-xl p-4 border border-border/50">
                        <audio controls src={audioUrl} className="w-full rounded-lg" />
                      </div>
                      <button
                        onClick={() => {
                          if (audioUrl) {
                            URL.revokeObjectURL(audioUrl)
                            setAudioUrl(null)
                          }
                        }}
                        className="text-sm text-text-secondary hover:text-primary transition-colors"
                      >
                        Close Player
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card-soft border border-warning/50 rounded-2xl p-6 mb-8 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">No Voiceprint Found</h3>
                    <p className="text-text-secondary text-sm">
                      Enroll your voice to start using Voice Identity Shield
                    </p>
                  </div>
                </div>
                <Link
                  to="/enroll"
                  className="px-4 py-2 gradient-primary rounded-2xl font-semibold text-dark text-sm shadow-soft-lg"
                >
                  Enroll Now
                </Link>
              </div>
            </div>
          )}

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="card-soft rounded-2xl p-6 shadow-soft">
              <div className="text-3xl font-heading font-bold text-text-primary mb-2">
                {stats.total}
              </div>
              <div className="text-text-secondary text-sm">Total Verifications</div>
            </div>
            <div className="card-soft border border-success/30 rounded-2xl p-6 shadow-soft">
              <div className="text-3xl font-heading font-bold text-success mb-2">
                {stats.authentic}
              </div>
              <div className="text-text-secondary text-sm">Authentic</div>
            </div>
            <div className="card-soft border border-error/30 rounded-2xl p-6 shadow-soft">
              <div className="text-3xl font-heading font-bold text-error mb-2">
                {stats.deepfake}
              </div>
              <div className="text-text-secondary text-sm">Deepfake Detected</div>
            </div>
            <div className="card-soft border border-primary/30 rounded-2xl p-6 shadow-soft">
              <div className="text-3xl font-heading font-bold text-primary mb-2">
                {stats.avgSimilarity}%
              </div>
              <div className="text-text-secondary text-sm">Avg Similarity</div>
            </div>
          </div>
        </motion.div>

        {/* Charts */}
        {successfulHistory.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-soft rounded-2xl p-6 shadow-soft"
              >
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Similarity Trend
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2F35" />
                    <XAxis dataKey="name" stroke="#9BAEA0" />
                    <YAxis stroke="#9BAEA0" domain={[0, 100]} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="similarity"
                      stroke={verdictColors.Authentic}
                      strokeWidth={2}
                      dot={{ fill: verdictColors.Authentic, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-soft rounded-2xl p-6 shadow-soft"
              >
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Verification Results
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={[
                      { name: 'Authentic', value: stats.authentic },
                      { name: 'Deepfake', value: stats.deepfake },
                      { name: 'Uncertain', value: stats.uncertain }
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2F35" />
                    <XAxis dataKey="name" stroke="#9BAEA0" />
                    <YAxis stroke="#9BAEA0" allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="value">
                      <Cell fill={verdictColors.Authentic} />
                      <Cell fill={verdictColors['Possible Deepfake']} />
                      <Cell fill={verdictColors.Uncertain} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            {(timelineData.length > 0 || scoreRiskTrend.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {timelineData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-soft rounded-2xl p-6 shadow-soft"
                  >
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Daily Verdict Heatmap
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={timelineData} stackOffset="expand">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1F2F35" />
                        <XAxis dataKey="label" stroke="#9BAEA0" />
                        <YAxis
                          stroke="#9BAEA0"
                          tickFormatter={(value) => `${Math.round(value * 100)}%`}
                        />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          formatter={(value, name) => [`${Math.round(value * 100)}%`, name]}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="authentic"
                          name="Authentic"
                          stackId="1"
                          stroke={verdictColors.Authentic}
                          fill={verdictColors.Authentic}
                          fillOpacity={0.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="uncertain"
                          name="Uncertain"
                          stackId="1"
                          stroke={verdictColors.Uncertain}
                          fill={verdictColors.Uncertain}
                          fillOpacity={0.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="deepfake"
                          name="Deepfake"
                          stackId="1"
                          stroke={verdictColors['Possible Deepfake']}
                          fill={verdictColors['Possible Deepfake']}
                          fillOpacity={0.85}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}

                {scoreRiskTrend.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="card-soft rounded-2xl p-6 shadow-soft"
                  >
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Similarity vs Risk Signals
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={scoreRiskTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1F2F35" />
                        <XAxis dataKey="label" stroke="#9BAEA0" />
                        <YAxis stroke="#9BAEA0" domain={[0, 100]} />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          formatter={(value, name) => [`${value}%`, name]}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="similarity"
                          name="Similarity"
                          stroke={verdictColors.Authentic}
                          strokeWidth={2}
                          dot={{ r: 3, fill: verdictColors.Authentic }}
                        />
                        {hasFinalScoreTrend && (
                          <Line
                            type="monotone"
                            dataKey="finalScore"
                            name="Final Score"
                            stroke={verdictColors['Possible Deepfake']}
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                        {hasSyntheticRiskTrend && (
                          <Line
                            type="monotone"
                            dataKey="syntheticRisk"
                            name="Synthetic Risk"
                            stroke={verdictColors.Uncertain}
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="5 5"
                          />
                        )}
                        {hasRiskScoreTrend && (
                          <Line
                            type="monotone"
                            dataKey="riskScore"
                            name="Backend Risk Score"
                            stroke={riskLineColor}
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="3 6"
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}
              </div>
            )}
          </>
        )}

        {successfulHistory.length === 0 && history.length > 0 && (
          <div className="card-soft rounded-2xl p-6 shadow-soft mb-8">
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Analytics will appear after successful verifications
            </h3>
            <p className="text-text-secondary text-sm">
              Run a verification to unlock similarity trends, verdict insights, and risk analytics.
            </p>
          </div>
        )}

        {/* Verification History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-soft rounded-2xl p-6 shadow-soft"
        >
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Verification History
          </h3>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span>Loading verification history...</span>
              </div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <p>No verification history yet.</p>
              <Link
                to="/verify"
                className="text-primary hover:text-accent transition-colors mt-2 inline-block"
              >
                Verify your voice now →
              </Link>
            </div>
          ) : (
            <>
              {historyError && (
                <div className="mb-4 p-3 bg-warning/10 border border-warning/30 text-warning text-sm rounded-xl">
                  {historyError}. Showing the most recent cached results.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-text-secondary text-sm font-semibold">Date</th>
                      <th className="text-left py-3 px-4 text-text-secondary text-sm font-semibold">Similarity</th>
                      <th className="text-left py-3 px-4 text-text-secondary text-sm font-semibold">Verdict</th>
                      <th className="text-left py-3 px-4 text-text-secondary text-sm font-semibold hidden md:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 10).map((item) => (
                      <tr key={item.id} className="border-b border-border hover:bg-dark transition-colors">
                        <td className="py-3 px-4 text-text-secondary text-sm">
                          {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${
                            item.similarity >= 0.75
                              ? 'text-success'
                              : item.similarity < 0.5
                              ? 'text-error'
                              : 'text-warning'
                          }`}>
                            {Math.round(item.similarity * 100)}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              item.verdict === 'Authentic'
                                ? 'bg-success bg-opacity-20 text-success'
                                : item.verdict === 'Possible Deepfake'
                                ? 'bg-error bg-opacity-20 text-error'
                                : item.verdict === 'Uncertain'
                                ? 'bg-warning bg-opacity-20 text-warning'
                                : 'bg-card border border-border text-text-secondary'
                            }`}
                          >
                            {item.verdict}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-text-secondary hidden md:table-cell capitalize">
                          {item.status || 'unknown'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </motion.div>

        {/* Delete Voiceprint Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-soft border border-error/50 rounded-3xl p-6 max-w-md w-full shadow-soft-lg"
            >
              <h3 className="text-xl font-heading font-semibold text-text-primary mb-4">
                Delete Voiceprint?
              </h3>
              <p className="text-text-secondary mb-6 leading-relaxed">
                Are you sure you want to delete "{selectedVoiceprint?.name || 'My Voice Recording'}"? This will permanently remove this recording and its voice data from storage. This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handleDeleteVoiceprint}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 bg-error hover:bg-error/90 text-white rounded-2xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 bg-card border border-border hover:bg-card/80 rounded-2xl font-semibold text-text-primary transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clear Data Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-soft border border-error/50 rounded-3xl p-6 max-w-md w-full shadow-soft-lg"
            >
              <h3 className="text-xl font-heading font-semibold text-text-primary mb-4">
                Clear All Data?
              </h3>
              <p className="text-text-secondary mb-6 leading-relaxed">
                This will permanently delete all stored voiceprints and verification history. 
                This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={handleClearData}
                  className="flex-1 px-4 py-2 bg-error rounded-2xl font-semibold text-white hover:bg-opacity-90 transition-all shadow-soft"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 bg-card/80 border border-border rounded-2xl font-semibold text-text-primary hover:border-primary transition-all backdrop-blur-sm"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
