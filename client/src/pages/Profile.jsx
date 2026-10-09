import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { getUserProfile, updateUserProfile, getMemberSinceString } from '../services/userApi'
import PhoneInput from '../components/PhoneInput'
import { useToast } from '../contexts/ToastContext'
import { isValidPersonName, normalizePersonName } from '../utils/inputValidation'

const Profile = () => {
  const { currentUser } = useAuth()
  const { showToast } = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    username: '',
    displayName: '',
    age: '',
    phoneNumber: '',
    gender: '',
    country: ''
  })

  useEffect(() => {
    loadProfile()
  }, [currentUser])

  useEffect(() => {
    if (error) {
      showToast(error, { type: 'error' })
    }
  }, [error, showToast])

  useEffect(() => {
    if (success) {
      showToast(success, { type: 'success' })
    }
  }, [success, showToast])

  const loadProfile = async () => {
    if (!currentUser) return

    setLoading(true)
    try {
      const result = await getUserProfile()
      
      if (result.success && result.data) {
        const data = result.data
        setProfile(data)
        setFormData({
          username: data.username || '',
          displayName: data.displayName || '',
          age: data.age || '',
          phoneNumber: data.phoneNumber || '',
          gender: data.gender || '',
          country: data.country || ''
        })
      } else {
        setError(result.error || 'Failed to load profile')
      }
    } catch (error) {
      setError('Failed to load profile')
    }
    
    setLoading(false)
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')

    // Validation
    if (!isValidPersonName(formData.displayName)) {
      setError('Full name must contain letters and spaces only')
      return
    }

    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,28}[A-Za-z0-9])?$/.test(formData.username)) {
      setError('Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens')
      return
    }

    if (formData.age && (isNaN(formData.age) || formData.age < 13 || formData.age > 120)) {
      setError('Please enter a valid age (13-120)')
      return
    }

    setSaving(true)

    const updates = {
      username: formData.username,
      displayName: normalizePersonName(formData.displayName),
      age: formData.age ? parseInt(formData.age) : null,
      phoneNumber: formData.phoneNumber || null,
      gender: formData.gender || null,
      country: formData.country || null,
    }

    const result = await updateUserProfile(updates)
    
    if (result.success) {
      setSuccess('Profile updated successfully!')
      setEditing(false)
      await loadProfile() // Reload to get updated data
      setTimeout(() => setSuccess(''), 3000)
    } else {
      setError(result.error || 'Failed to update profile')
    }
    
    setSaving(false)
  }

  const handleCancel = () => {
    setEditing(false)
    setError('')
    // Reset form data to original profile
    if (profile) {
      setFormData({
        username: profile.username || '',
        displayName: profile.displayName || '',
        age: profile.age || '',
        phoneNumber: profile.phoneNumber || '',
        gender: profile.gender || '',
        country: profile.country || ''
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="mt-4 text-text-secondary">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark">
        <div className="text-center">
          <p className="text-text-secondary">Failed to load profile</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="bg-card rounded-2xl shadow-soft p-8 border border-border/50 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-heading font-bold text-primary mb-2">
                  My Profile
                </h1>
                <p className="text-text-secondary">
                  Manage your account information and preferences
                </p>
              </div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-6 py-3 bg-primary hover:bg-accent text-dark rounded-xl font-medium transition-all duration-300"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm mb-4"
            >
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-xl text-sm mb-4"
            >
              {success}
            </motion.div>
          )}

          {/* Profile Information */}
          <div className="bg-card rounded-2xl shadow-soft p-8 border border-border/50">
            <h2 className="text-xl font-semibold text-text-primary mb-6">
              Personal Information
            </h2>

            <div className="space-y-6">
              {/* Email (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile.email || currentUser.email}
                  disabled
                  className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-secondary cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  Email cannot be changed
                </p>
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Username
                </label>
                {editing ? (
                  <input
                    type="text"
                    name="username"
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9](?:[A-Za-z0-9._-]{1,28}[A-Za-z0-9])?"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 bg-dark border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    placeholder="voice.user"
                    title="3-30 characters using letters, numbers, dots, underscores, or hyphens"
                  />
                ) : (
                  <input
                    type="text"
                    value={profile.username || 'Not set'}
                    disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed"
                  />
                )}
                {!profile.username && <p className="mt-1 text-xs text-text-secondary">Set a username to sign in and reset your password without typing your email.</p>}
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Full Name
                </label>
                {editing ? (
                  <input
                    type="text"
                    name="displayName"
                    required
                    minLength={2}
                    maxLength={80}
                    value={formData.displayName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-dark border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    placeholder="John Doe"
                  />
                ) : (
                  <input
                    type="text"
                    value={profile.displayName || 'Not set'}
                    disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed"
                  />
                )}
              </div>

              {/* Age and Phone in Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Age
                  </label>
                  {editing ? (
                    <input
                      type="number"
                      name="age"
                      min="13"
                      max="120"
                      value={formData.age}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-dark border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      placeholder="25"
                    />
                  ) : (
                    <input
                    type="text"
                    value={profile.age ?? 'Not set'}
                      disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Phone Number
                  </label>
                  {editing ? (
                    <PhoneInput
                      name="phoneNumber"
                      value={formData.phoneNumber || ''}
                      onChange={handleChange}
                      placeholder="1234 5678 9012"
                    />
                  ) : (
                    <input
                    type="text"
                    value={profile.phoneNumber || 'Not set'}
                      disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed"
                    />
                  )}
                </div>
              </div>

              {/* Gender and Country in Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Gender
                  </label>
                  {editing ? (
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-dark border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    >
                      <option value="">Select...</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                    value={profile.gender ? profile.gender.replace(/-/g, ' ') : 'Not set'}
                      disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed capitalize"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Country
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="w-full px-4 py-3 bg-dark border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      placeholder="United States"
                    />
                  ) : (
                    <input
                      type="text"
                    value={profile.country || 'Not set'}
                      disabled
                    className="w-full px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary disabled:cursor-not-allowed"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="mt-8 pt-8 border-t border-border/50">
              <h2 className="text-xl font-semibold text-text-primary mb-6">
                Account Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Member Since
                  </label>
                  <div className="px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary">
                    {profile.memberSince 
                      ? getMemberSinceString(profile.memberSince)
                      : 'New member'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Last Login
                  </label>
                  <div className="px-4 py-3 bg-dark/50 border border-border rounded-xl text-text-primary">
                    {profile.lastLogin
                      ? new Date(profile.lastLogin).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {editing && (
              <div className="mt-8 flex gap-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-accent text-dark rounded-xl font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-6 py-3 bg-card hover:bg-dark border border-border text-text-primary rounded-xl font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Profile
