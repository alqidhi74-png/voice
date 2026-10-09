import nodemailer from 'nodemailer'
import { logger } from '../utils/logger.js'

let transporter

const enabled = () => process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true'

const getTransporter = () => {
  if (transporter) return transporter
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be configured')
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })
  return transporter
}

export const sendNotificationEmail = async ({ to, subject, text }) => {
  if (!enabled() || !to) return { sent: false, skipped: true }
  try {
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to]
    if (!recipients.length) return { sent: false, skipped: true }
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject,
      text
    })
    return { sent: true, skipped: false }
  } catch (error) {
    // Email delivery must never roll back a security or feedback operation.
    logger.error('Notification email could not be sent:', error.message)
    return { sent: false, skipped: false, error: error.message }
  }
}

export const getAdminNotificationRecipients = () => (
  process.env.ADMIN_NOTIFICATION_EMAILS || process.env.ADMIN_EMAILS || ''
).split(',').map(value => value.trim()).filter(Boolean)

export default { sendNotificationEmail, getAdminNotificationRecipients }
