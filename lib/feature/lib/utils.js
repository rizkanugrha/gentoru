import crypto from 'node:crypto'
import { parseAngka } from '../constants/categories.js'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function nowIso() {
  return new Date().toISOString()
}

export function createId(prefix = 'tx') {
  const rand = crypto.randomBytes(3).toString('hex')
  const stamp = Date.now().toString(36)
  return `${prefix}_${stamp}_${rand}`
}

export function hashText(value = '') {
  return crypto.createHash('sha1').update(String(value)).digest('hex')
}

export function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}

export function escapeCsv(value) {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function jidToUserId(jid = '') {
  return String(jid).split('@')[0]
}

export function isGroupJid(jid = '') {
  return String(jid).endsWith('@g.us')
}

export function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim()
}

export function findAmountInText(text = '') {
  const matches = String(text).match(/(?:rp\.?\s*)?\d+[\d.,]*(?:\s?(?:rb|k|jt|juta))?/gi) || []
  for (const part of matches) {
    const amount = parseAngka(part)
    if (amount !== null && amount > 0) return amount
  }
  return null
}

export function extractHashtags(text = '') {
  return Array.from(String(text).matchAll(/#([\p{L}\p{N}_-]+)/gu)).map((m) => m[1].toLowerCase())
}

export function removeAmountFromText(text = '') {
  return normalizeText(String(text).replace(/(?:rp\.?\s*)?\d+[\d.,]*(?:\s?(?:rb|k|jt|juta))?/gi, ''))
}

export function progressBar(current, total, length = 12) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0
  const filled = Math.round(ratio * length)
  return `${'█'.repeat(filled)}${'░'.repeat(length - filled)} ${Math.round(ratio * 100)}%`
}

export function startOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function startOfWeek(date = new Date()) {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function endOfWeek(date = new Date()) {
  const d = startOfWeek(date)
  d.setDate(d.getDate() + 6)
  return endOfDay(d)
}

export function startOfMonth(date = new Date()) {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfMonth(date = new Date()) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1, 0)
  d.setHours(23, 59, 59, 999)
  return d
}

export function addMonths(date, amount) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + amount)
  return d
}

export function formatDateTimeId(dateInput) {
  const d = new Date(dateInput)
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}
