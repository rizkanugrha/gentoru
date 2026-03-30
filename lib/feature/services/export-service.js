import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { escapeCsv } from '../lib/utils.js'

export class ExportService {
  constructor({ storage }) {
    this.storage = storage
  }

  async exportCsv(userId, dir = './tmp') {
    await mkdir(dir, { recursive: true })
    const transactions = await this.storage.listTransactions(userId)
    const rows = [
      ['id', 'tanggal', 'jenis', 'kategori', 'jumlah', 'deskripsi', 'tags', 'sumber'].join(','),
      ...transactions.map((tx) =>
        [
          tx.id,
          tx.occurredAt,
          tx.kind,
          tx.category,
          tx.amount,
          tx.description || '',
          (tx.tags || []).join('|'),
          tx.source || '',
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ]

    const filePath = path.join(dir, `riwayat-${userId}-${Date.now()}.csv`)
    await writeFile(filePath, rows.join('\n'), 'utf8')
    return filePath
  }
}
