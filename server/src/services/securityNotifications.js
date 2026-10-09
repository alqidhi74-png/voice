import { getFirestore } from '../config/firebase.js'
import { wrapSecret, unwrapSecret } from './keyManagement.js'
import { sendNotificationEmail, getAdminNotificationRecipients } from './emailNotifications.js'
import { publishLiveEvent } from './liveEvents.js'
import { logger } from '../utils/logger.js'

const toIsoString = value => value?.toDate?.()?.toISOString?.() || value || null

const decryptPayload = encryptedPayload => {
  try {
    return JSON.parse(unwrapSecret(encryptedPayload).toString('utf8'))
  } catch (error) {
    logger.error('Encrypted notification payload could not be decrypted:', error.message)
    return { message: 'Encrypted content is unavailable', metadata: {} }
  }
}

const decryptString = encryptedValue => {
  if (!encryptedValue) return null
  try {
    return unwrapSecret(encryptedValue).toString('utf8')
  } catch (error) {
    logger.error('Encrypted text could not be decrypted:', error.message)
    return 'Encrypted content is unavailable'
  }
}

const mapFeedback = document => {
  const data = document.data()
  const payload = decryptPayload(data.encryptedPayload)
  return {
    id: document.id,
    userId: data.userId,
    category: data.category,
    message: payload.message,
    reply: decryptString(data.encryptedReply),
    status: data.status || 'new',
    repliedBy: data.repliedBy || null,
    repliedAt: toIsoString(data.repliedAt),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt)
  }
}

export const recordSecurityAlert = async ({ userId, type, severity = 'info', message, metadata = {} }) => {
  try {
    const ref = getFirestore().collection('security_alerts').doc()
    const createdAt = new Date()
    await ref.set({
      userId: userId || null,
      type,
      severity,
      encryptedPayload: wrapSecret(JSON.stringify({ message, metadata })),
      read: false,
      createdAt
    })
    publishLiveEvent('admin', {
      kind: 'security_alert', title: 'Security notification', message, severity, resourceId: ref.id
    })
    await sendNotificationEmail({
      to: getAdminNotificationRecipients(),
      subject: `[Voice Identity Shield] ${type.replaceAll('_', ' ')}`,
      text: `${message}\nUser: ${userId || 'System'}\nTime: ${createdAt.toISOString()}`
    })
    return { success: true, id: ref.id }
  } catch (error) {
    logger.error('Security alert could not be stored:', error.message)
    return { success: false, error: error.message }
  }
}

export const listSecurityAlerts = async (limit = 50) => {
  const snapshot = await getFirestore().collection('security_alerts').orderBy('createdAt', 'desc').limit(limit).get()
  return snapshot.docs.map(document => {
    const data = document.data()
    const payload = decryptPayload(data.encryptedPayload)
    return {
      id: document.id,
      userId: data.userId || null,
      type: data.type,
      severity: data.severity,
      message: payload.message,
      metadata: payload.metadata || {},
      read: Boolean(data.read),
      readAt: toIsoString(data.readAt),
      readBy: data.readBy || null,
      createdAt: toIsoString(data.createdAt)
    }
  })
}

export const markSecurityAlertRead = async ({ alertId, adminId, read = true }) => {
  const ref = getFirestore().collection('security_alerts').doc(alertId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return false
  await ref.update({ read, readAt: read ? new Date() : null, readBy: read ? adminId : null })
  return true
}

export const storeEncryptedFeedback = async ({ userId, category, message }) => {
  const ref = getFirestore().collection('encrypted_feedback').doc()
  const createdAt = new Date()
  await ref.set({
    userId,
    category,
    encryptedPayload: wrapSecret(JSON.stringify({ message })),
    encryptedReply: null,
    status: 'new',
    repliedBy: null,
    repliedAt: null,
    createdAt,
    updatedAt: createdAt
  })
  publishLiveEvent('admin', {
    kind: 'feedback_created',
    title: 'New encrypted feedback',
    message: `A user submitted ${category} feedback`,
    severity: category === 'security' ? 'warning' : 'info',
    resourceId: ref.id
  })
  await sendNotificationEmail({
    to: getAdminNotificationRecipients(),
    subject: `[Voice Identity Shield] New ${category} feedback`,
    text: `New encrypted feedback was submitted by user ${userId}. Open the administration console to review it.`
  })
  return ref.id
}

export const listEncryptedFeedback = async (limit = 100) => {
  const snapshot = await getFirestore().collection('encrypted_feedback').orderBy('createdAt', 'desc').limit(limit).get()
  return snapshot.docs.map(mapFeedback)
}

export const listUserFeedback = async (userId, limit = 50) => {
  const snapshot = await getFirestore().collection('encrypted_feedback').where('userId', '==', userId).get()
  return snapshot.docs.map(mapFeedback)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, limit)
}

export const updateEncryptedFeedback = async ({ feedbackId, status, reply, adminId }) => {
  const ref = getFirestore().collection('encrypted_feedback').doc(feedbackId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return null
  const update = { status, updatedAt: new Date() }
  if (reply) {
    update.encryptedReply = wrapSecret(reply)
    update.repliedBy = adminId
    update.repliedAt = new Date()
  }
  await ref.update(update)
  return mapFeedback(await ref.get())
}

export const createUserNotification = async ({ userId, type, title, message, metadata = {} }) => {
  const ref = getFirestore().collection('user_notifications').doc()
  const createdAt = new Date()
  await ref.set({
    userId,
    type,
    encryptedPayload: wrapSecret(JSON.stringify({ title, message, metadata })),
    read: false,
    createdAt
  })
  publishLiveEvent(`user:${userId}`, { kind: type, title, message, severity: 'info', resourceId: ref.id })
  return ref.id
}

export const listUserNotifications = async (userId, limit = 50) => {
  const snapshot = await getFirestore().collection('user_notifications').where('userId', '==', userId).get()
  return snapshot.docs.map(document => {
    const data = document.data()
    const payload = decryptPayload(data.encryptedPayload)
    return {
      id: document.id,
      type: data.type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata || {},
      read: Boolean(data.read),
      createdAt: toIsoString(data.createdAt)
    }
  }).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).slice(0, limit)
}

export const markUserNotificationRead = async ({ notificationId, userId }) => {
  const ref = getFirestore().collection('user_notifications').doc(notificationId)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data().userId !== userId) return false
  await ref.update({ read: true, readAt: new Date() })
  return true
}

export default {
  recordSecurityAlert,
  listSecurityAlerts,
  markSecurityAlertRead,
  storeEncryptedFeedback,
  listEncryptedFeedback,
  listUserFeedback,
  updateEncryptedFeedback,
  createUserNotification,
  listUserNotifications,
  markUserNotificationRead
}
