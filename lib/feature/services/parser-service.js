import {
  QUICK_PREFIX_MAP,
  detectBasicIntent,
  parseAngka,
  resolveKategoriPemasukan,
  resolveKategoriPengeluaran,
} from '../constants/categories.js'
import {
  extractHashtags,
  findAmountInText,
  normalizeText,
  removeAmountFromText,
} from '../lib/utils.js'
import { env } from '../config/env.js'

function firstNormalizedToken(text = '') {
  return String(text).trim().split(/\s+/)[0]?.toLowerCase() || ''
}

function stripKnownPrefixes(text = '') {
  return normalizeText(
    String(text).replace(/^(rt|transport|mkn|blj|tag|gj|catat|trx|transaksi|expense|income|pemasukan|pengeluaran)\b/i, ''),
  )
}

function extractCategoryFromText(text = '', kindHint = 'expense') {
  const words = String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  let expenseCategory = null
  let incomeCategory = null

  for (const word of words) {
    if (!expenseCategory) expenseCategory = resolveKategoriPengeluaran(word)
    if (!incomeCategory) incomeCategory = resolveKategoriPemasukan(word)
  }

  if (kindHint === 'income') return incomeCategory
  if (kindHint === 'expense') return expenseCategory
  return incomeCategory || expenseCategory
}

function parseGoalCommand(text) {
  const match = normalizeText(text).match(
    /^(?:buat\s+goal|goal(?:\s+tambah)?)(?:\s+(.+?))\s+((?:rp\.?\s*)?\d[\d.,]*(?:\s?(?:rb|k|jt|juta))?)(?:\s+(\d{4}-\d{2}-\d{2}))?$/i,
  )
  if (!match) return null

  return {
    action: 'create_goal',
    targetName: normalizeText(match[1]),
    amount: parseAngka(match[2]) || 0,
    dueDate: match[3] || '',
    confidence: 0.97,
  }
}

function parseContributeGoal(text) {
  const match = normalizeText(text).match(
    /^tabung(?:\s+(.+?))?\s+((?:rp\.?\s*)?\d[\d.,]*(?:\s?(?:rb|k|jt|juta))?)$/i,
  )
  if (!match) return null

  return {
    action: 'contribute_goal',
    targetName: normalizeText(match[1] || ''),
    amount: parseAngka(match[2]) || 0,
    confidence: 0.97,
  }
}

export class ParserService {
  constructor({ geminiService = null }) {
    this.geminiService = geminiService
  }

  async parseIncoming({ text = '', media = null, user = null }) {
    if (media?.type === 'image') {
      if (!this.geminiService?.enabled) {
        return { action: 'unknown', error: 'gemini_required_for_image' }
      }
      return (
        (await this.geminiService.parseReceiptImage(media.buffer, media.mimeType, media.caption || '', user)) || {
          action: 'unknown',
        }
      )
    }

    if (media?.type === 'audio') {
      if (!this.geminiService?.enabled) {
        return { action: 'unknown', error: 'gemini_required_for_audio' }
      }
      return (await this.geminiService.parseAudioNote(media.buffer, media.mimeType, user)) || { action: 'unknown' }
    }

    return this.parseText(text, user)
  }

  async parseText(text, user) {
    const local = this.ruleBasedText(text)
    if (local.action !== 'unknown') return local

    if (env.enableGeminiFallback && this.geminiService?.enabled) {
      const aiResult = await this.geminiService.parseTextCommand(text, user)
      if (aiResult) return aiResult
    }

    return local
  }

  ruleBasedText(text = '') {
    const raw = normalizeText(text)
    const lower = raw.toLowerCase()
    const firstToken = firstNormalizedToken(raw)
    const quickCategory = QUICK_PREFIX_MAP[firstToken] || null

    if (!raw) return { action: 'unknown', confidence: 0 }

    if (/^(menu|help|bantuan|start)$/i.test(raw)) {
      return { action: 'help', confidence: 1 }
    }

    if (/^goal(?:\s+list)?$/i.test(raw)) {
      return { action: 'list_goals', confidence: 1 }
    }

    if (/^(?:saldo|cek\s+saldo|saldo\s+saya|lihat\s+saldo|cek\s+uang|uang\s+saya\s+berapa|duit\s+saya\s+berapa|saldo\s+berapa)$/i.test(raw)) {
      return { action: 'check_balance', confidence: 1 }
    }

    const setBalanceMatch = raw.match(
      /^(?:set\s+saldo|saldo\s+awal|atur\s+saldo|set\s+uang\s+saya|set\s+duit\s+saya)\s+((?:rp\.?\s*)?\d[\d.,]*(?:\s?(?:rb|k|jt|juta))?)$/i,
    )
    if (setBalanceMatch) {
      return {
        action: 'set_balance',
        amount: parseAngka(setBalanceMatch[1]) || 0,
        confidence: 0.98,
      }
    }

    const addMoneyMatch = raw.match(/^((?:tambah|topup|isi)\s+uang)\s+(.+)$/i)
    if (addMoneyMatch) {
      return {
        action: 'adjust_balance',
        delta: parseAngka(addMoneyMatch[2]) || 0,
        description: 'Tambah uang manual',
        confidence: 0.98,
      }
    }

    const subMoneyMatch = raw.match(/^((?:kurangi|ambil|tarik)\s+uang)\s+(.+)$/i)
    if (subMoneyMatch) {
      return {
        action: 'adjust_balance',
        delta: -(parseAngka(subMoneyMatch[2]) || 0),
        description: 'Kurangi uang manual',
        confidence: 0.98,
      }
    }


    if (/^reminder(?:\s+status)?$/i.test(raw)) {
      return { action: 'reminder_status', confidence: 1 }
    }

    const reminderToggleMatch = raw.match(/^(?:reminder|pengingat)(?:\s+(harian|mingguan|bulanan|daily|weekly|monthly))?\s+(on|off|aktif|nonaktif|mati)$/i)
    if (reminderToggleMatch) {
      const periodMap = {
        harian: 'daily',
        daily: 'daily',
        mingguan: 'weekly',
        weekly: 'weekly',
        bulanan: 'monthly',
        monthly: 'monthly',
      }
      const state = /^(on|aktif)$/i.test(reminderToggleMatch[2])
      return {
        action: 'set_reminder',
        reminderType: periodMap[(reminderToggleMatch[1] || 'harian').toLowerCase()] || 'daily',
        enabled: state,
        confidence: 0.99,
      }
    }

    const budgetMatch = raw.match(/^budget\s+(total|[\p{L}\p{N}_-]+)\s+(.+)$/iu)
    if (budgetMatch) {
      return {
        action: 'set_budget',
        scope: budgetMatch[1].toLowerCase(),
        amount: parseAngka(budgetMatch[2]) || 0,
        confidence: 0.98,
      }
    }

    const goalCommand = parseGoalCommand(raw)
    if (goalCommand) return goalCommand

    const contributeGoal = parseContributeGoal(raw)
    if (contributeGoal) return contributeGoal

    const historyMatch = raw.match(/^riwayat(?:\s+(\d+))?$/i)
    if (historyMatch) {
      return {
        action: 'history',
        amount: Number(historyMatch[1] || 10),
        confidence: 1,
      }
    }

    const searchMatch = raw.match(/^cari\s+(.+)$/i)
    if (searchMatch) {
      return {
        action: 'search_history',
        search: normalizeText(searchMatch[1]),
        confidence: 1,
      }
    }

    const deleteMatch = raw.match(/^hapus\s+([\w-]+)$/i)
    if (deleteMatch) {
      return {
        action: 'delete_transaction',
        txId: deleteMatch[1],
        confidence: 1,
      }
    }

    const editMatch = raw.match(/^edit\s+([\w-]+)\s+(jumlah|kategori|catatan|deskripsi)\s+(.+)$/i)
    if (editMatch) {
      return {
        action: 'edit_transaction',
        txId: editMatch[1],
        field: editMatch[2].toLowerCase() === 'catatan' ? 'description' : editMatch[2].toLowerCase(),
        value: normalizeText(editMatch[3]),
        confidence: 1,
      }
    }

    if (/^export(?:\s+csv)?$/i.test(raw)) {
      return { action: 'export_csv', confidence: 1 }
    }

    const summaryMatch = raw.match(/^(?:ringkasan|laporan|rekap|summary)(?:\s+(hari|harian|minggu|mingguan|bulan|bulanan))?$/i)
    if (summaryMatch) {
      const map = { hari: 'day', harian: 'day', minggu: 'week', mingguan: 'week', bulan: 'month', bulanan: 'month' }
      return {
        action: 'summary',
        period: map[(summaryMatch[1] || '').toLowerCase()] || 'month',
        confidence: 1,
      }
    }

    const basicIntent = detectBasicIntent(raw)
    if (basicIntent === 'cek_saldo') return { action: 'check_balance', confidence: 0.9 }
    if (basicIntent === 'ringkasan') return { action: 'summary', period: 'month', confidence: 0.9 }

    const amount = findAmountInText(raw)
    if (!amount) return { action: 'unknown', confidence: 0 }

    const incomeCategory = extractCategoryFromText(raw, 'income')
    const expenseCategory = extractCategoryFromText(raw, 'expense')

    const incomeHints = /\b(gaji|salary|bonus|investasi|dividen|freelance|sampingan|pemasukan|income|pendapatan|komisi|thr)\b/i
    const isIncome = incomeHints.test(raw) || Boolean(incomeCategory)

    const kind = isIncome ? 'income' : 'expense'
    const category =
      (kind === 'income' ? incomeCategory : expenseCategory) ||
      (quickCategory && kind === 'expense' ? quickCategory : null) ||
      'lainlain'

    const tags = Array.from(
      new Set([
        ...extractHashtags(raw),
        ...(quickCategory && quickCategory !== category ? [quickCategory] : []),
        ...(expenseCategory && expenseCategory !== category ? [expenseCategory] : []),
        ...(incomeCategory && incomeCategory !== category ? [incomeCategory] : []),
      ]),
    )

    const description = stripKnownPrefixes(removeAmountFromText(raw))

    return {
      action: 'create_transaction',
      kind,
      amount,
      category,
      description: description || (kind === 'income' ? 'Pemasukan' : 'Pengeluaran'),
      tags,
      confidence: 0.95,
    }
  }
}
