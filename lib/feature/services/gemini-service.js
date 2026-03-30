import { GoogleGenAI } from '@google/genai'
import { env, isGeminiReady } from '../config/env.js'
import {
  KATEGORI_PEMASUKAN,
  KATEGORI_PENGELUARAN,
  formatRupiah,
  listAllowedCategories,
} from '../constants/categories.js'
import { caches } from '../lib/cache.js'
import { hashBuffer, hashText, normalizeText } from '../lib/utils.js'
import { logger } from '../lib/logger.js'

const ACTIONS = [
  'create_transaction',
  'set_balance',
  'adjust_balance',
  'check_balance',
  'summary',
  'set_budget',
  'create_goal',
  'contribute_goal',
  'list_goals',
  'history',
  'search_history',
  'delete_transaction',
  'edit_transaction',
  'export_csv',
  'help',
  'unknown',
]

const KINDS = [
  'expense',
  'income',
  'balance_set',
  'balance_adjustment',
  'saving_contribution',
  'debt',
  'receivable',
  'none',
]

const baseSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    kind: { type: 'string', enum: KINDS },
    amount: { type: 'integer' },
    delta: { type: 'integer' },
    category: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    period: { type: 'string', enum: ['', 'day', 'week', 'month'] },
    scope: { type: 'string' },
    targetName: { type: 'string' },
    dueDate: { type: 'string' },
    txId: { type: 'string' },
    field: { type: 'string' },
    value: { type: 'string' },
    search: { type: 'string' },
    transcript: { type: 'string' },
    merchant: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'action',
    'kind',
    'amount',
    'delta',
    'category',
    'description',
    'tags',
    'period',
    'scope',
    'targetName',
    'dueDate',
    'txId',
    'field',
    'value',
    'search',
    'transcript',
    'merchant',
    'confidence',
  ],
}

function normalizeResult(result = {}) {
  const data = {
    action: ACTIONS.includes(result.action) ? result.action : 'unknown',
    kind: KINDS.includes(result.kind) ? result.kind : 'none',
    amount: Number.isFinite(Number(result.amount)) ? Math.abs(Math.round(Number(result.amount))) : 0,
    delta: Number.isFinite(Number(result.delta)) ? Math.round(Number(result.delta)) : 0,
    category: String(result.category || '').trim().toLowerCase(),
    description: normalizeText(result.description || ''),
    tags: Array.isArray(result.tags)
      ? result.tags.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [],
    period: ['day', 'week', 'month'].includes(result.period) ? result.period : '',
    scope: String(result.scope || '').trim().toLowerCase(),
    targetName: normalizeText(result.targetName || ''),
    dueDate: String(result.dueDate || '').trim(),
    txId: String(result.txId || '').trim(),
    field: String(result.field || '').trim().toLowerCase(),
    value: String(result.value || '').trim(),
    search: normalizeText(result.search || ''),
    transcript: normalizeText(result.transcript || ''),
    merchant: normalizeText(result.merchant || ''),
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0,
  }

  const allowed = listAllowedCategories()
  if (data.kind === 'income' && !allowed.income.includes(data.category)) {
    data.category = 'lainlain'
  }
  if ((data.kind === 'expense' || data.kind === 'saving_contribution') && !allowed.expense.includes(data.category)) {
    data.category = 'lainlain'
  }

  return data
}

function categoryPromptText() {
  return [
    'Kategori pengeluaran yang valid:',
    Object.entries(KATEGORI_PENGELUARAN)
      .map(([key, label]) => `- ${key}: ${label}`)
      .join('\n'),
    '',
    'Kategori pemasukan yang valid:',
    Object.entries(KATEGORI_PEMASUKAN)
      .map(([key, label]) => `- ${key}: ${label}`)
      .join('\n'),
  ].join('\n')
}

export class GeminiService {
  constructor() {
    this.enabled = isGeminiReady()
    this.ai = this.enabled ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null
  }

  async generateStructured({ prompt, contents, cacheKey }) {
    if (!this.enabled) return null
    if (cacheKey) {
      const cached = caches.parse.get(cacheKey)
      if (cached) return cached
    }

    try {
      const finalContents = Array.isArray(contents) ? contents : `${prompt}\n\nInput user: ${contents}`
      const response = await this.ai.models.generateContent({
        model: env.geminiModel,
        contents: finalContents,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: baseSchema,
        },
      })

      const parsed = normalizeResult(JSON.parse(response.text || '{}'))
      if (cacheKey) caches.parse.set(cacheKey, parsed)
      return parsed
    } catch (error) {
      logger.error({ err: error }, 'Gemini structured generation failed')
      return null
    }
  }

  async parseTextCommand(text, user) {
    const cacheKey = `gemini:text:${hashText(text)}`
    const prompt = [
      'Kamu adalah parser bot pencatatan keuangan WhatsApp.',
      'Balas hanya JSON sesuai schema.',
      'Tentukan aksi user dari teks berikut.',
      'Gunakan category hanya dari daftar valid.',
      'Untuk pengeluaran/pemasukan ambil angka rupiah utamanya.',
      'Jika user ingin melihat saldo, action=check_balance.',
      'Jika user ingin ringkasan/laporan, action=summary dan period=day/week/month.',
      'Jika user ingin set saldo, action=set_balance.',
      'Jika user ingin tambah/kurangi saldo manual, action=adjust_balance dan delta bertanda +/- sesuai konteks.',
      'Jika user ingin budget, action=set_budget dan scope=total atau nama kategori.',
      'Jika user ingin goal, action=create_goal atau contribute_goal.',
      'Jika user ingin riwayat, action=history. Cari = search_history. Hapus/edit sesuai action-nya.',
      'Jika tidak yakin, action=unknown.',
      categoryPromptText(),
      '',
      `Nama user: ${user?.pushName || user?.userId || ''}`,
      `Teks user: ${text}`,
    ].join('\n')

    return this.generateStructured({
      prompt,
      cacheKey,
      contents: text,
    })
  }

  async parseReceiptImage(buffer, mimeType, caption = '', user) {
    if (!this.enabled) return null
    const cacheKey = `gemini:image:${hashBuffer(buffer)}`
    const prompt = [
      'Kamu membaca foto struk atau bukti transaksi untuk bot keuangan WhatsApp.',
      'Balas hanya JSON sesuai schema.',
      'Ekstrak satu transaksi paling relevan.',
      'Biasanya receipt = action=create_transaction, kind=expense.',
      'amount harus total yang dibayar dalam Rupiah tanpa titik/koma ribuan.',
      'description isi ringkasan singkat transaksi.',
      'merchant isi nama toko/resto jika ada.',
      'tags isi item penting atau kata kunci.',
      'Jika gambar bukan transaksi, action=unknown.',
      categoryPromptText(),
      '',
      `Caption user: ${caption}`,
      `User: ${user?.pushName || user?.userId || ''}`,
    ].join('\n')

    return this.generateStructured({
      prompt,
      cacheKey,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
      ],
    })
  }

  async parseAudioNote(buffer, mimeType, user) {
    if (!this.enabled) return null
    const cacheKey = `gemini:audio:${hashBuffer(buffer)}`
    const prompt = [
      'Kamu menerima voice note WhatsApp untuk bot pencatatan keuangan.',
      'Balas hanya JSON sesuai schema.',
      'Pertama transkripkan audio ke transcript.',
      'Lalu tentukan apakah ini pengeluaran, pemasukan, cek saldo, ringkasan, budget, atau goal.',
      'Jika voice note berisi transaksi, action=create_transaction dan isi amount, category, description, tags.',
      'Jika audio tidak jelas, action=unknown.',
      categoryPromptText(),
      '',
      `User: ${user?.pushName || user?.userId || ''}`,
    ].join('\n')

    return this.generateStructured({
      prompt,
      cacheKey,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
      ],
    })
  }

  async generateSummaryInsight(summary) {
    if (!this.enabled) return ''

    try {
      const payload = {
        period: summary.period,
        income: summary.income,
        expense: summary.expense,
        savings: summary.savings,
        net: summary.net,
        balance: summary.balance,
        topCategories: summary.topCategories,
      }

      const response = await this.ai.models.generateContent({
        model: env.geminiModel,
        contents: [
          'Berikan insight keuangan singkat dalam Bahasa Indonesia.',
          'Maksimal 3 poin, masing-masing 1 kalimat.',
          'Fokus pada pola belanja, warning seperlunya, dan saran hemat praktis.',
          `Data: ${JSON.stringify(payload)}`,
        ],
      })

      return normalizeText(response.text || '')
    } catch (error) {
      logger.error({ err: error }, 'Gemini summary insight failed')
      return ''
    }
  }

  systemFacts() {
    return {
      model: env.geminiModel,
      maxInlineMediaBytes: env.mediaInlineMaxBytes,
      categories: listAllowedCategories(),
      examples: {
        expense: `makan siang ${formatRupiah(35000)}`,
        income: `gaji ${formatRupiah(5000000)}`,
      },
    }
  }
}
