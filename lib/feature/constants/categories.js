export const KATEGORI_PENGELUARAN = {
  belanja: '🛒 Belanja',
  makanan: '🍽️ Makanan',
  telepon: '📱 Telepon',
  hiburan: '🎮 Hiburan',
  pendidikan: '🎓 Pendidikan',
  kecantikan: '✂️ Kecantikan',
  olahraga: '🏃 Olahraga',
  sosial: '👥 Sosial',
  transportasi: '🚌 Transportasi',
  pakaian: '👕 Pakaian',
  mobil: '🚗 Mobil',
  minuman: '🍷 Minuman',
  rokok: '🚬 Rokok',
  elektronik: '🖥️ Elektronik',
  bepergian: '✈️ Bepergian',
  kesehatan: '❤️ Kesehatan',
  peliharaan: '🐾 Peliharaan',
  perbaikan: '🔧 Perbaikan',
  perumahan: '🏠 Perumahan',
  rumah: '🛋️ Rumah',
  hadiah: '🎁 Hadiah',
  donasi: '🤲 Donasi',
  lotre: '🎲 Lotre',
  makananringan: '🍿 Makanan Ringan',
  anakanak: '👶 Anak-anak',
  sayurmayur: '🥕 Sayur-mayur',
  buah: '🍒 Buah',
  lainlain: '📦 Lain-lain',
}

export const KATEGORI_PEMASUKAN = {
  gaji: '💼 Gaji',
  investasi: '📈 Investasi',
  paruhwaktu: '🤝 Paruh Waktu',
  bonus: '🏆 Bonus',
  lainlain: '💰 Lain-lain',
}

export const ALIAS_PENGELUARAN = {
  makan: 'makanan',
  makanan: 'makanan',
  jajan: 'makanan',
  minum: 'minuman',
  minuman: 'minuman',
  kopi: 'minuman',
  teh: 'minuman',
  transport: 'transportasi',
  transportasi: 'transportasi',
  ojek: 'transportasi',
  ojol: 'transportasi',
  grab: 'transportasi',
  gojek: 'transportasi',
  bensin: 'mobil',
  parkir: 'mobil',
  tol: 'mobil',
  mobil: 'mobil',
  belanja: 'belanja',
  hiburan: 'hiburan',
  game: 'hiburan',
  nonton: 'hiburan',
  pendidikan: 'pendidikan',
  buku: 'pendidikan',
  kursus: 'pendidikan',
  kesehatan: 'kesehatan',
  obat: 'kesehatan',
  dokter: 'kesehatan',
  listrik: 'perumahan',
  wifi: 'perumahan',
  internet: 'perumahan',
  kost: 'perumahan',
  sewa: 'perumahan',
  kontrakan: 'perumahan',
  perumahan: 'perumahan',
  rumah: 'rumah',
  pakaian: 'pakaian',
  baju: 'pakaian',
  elektronik: 'elektronik',
  hp: 'elektronik',
  laptop: 'elektronik',
  telepon: 'telepon',
  pulsa: 'telepon',
  olahraga: 'olahraga',
  gym: 'olahraga',
  sosial: 'sosial',
  kecantikan: 'kecantikan',
  salon: 'kecantikan',
  peliharaan: 'peliharaan',
  hadiah: 'hadiah',
  donasi: 'donasi',
  rokok: 'rokok',
  bepergian: 'bepergian',
  travel: 'bepergian',
  perbaikan: 'perbaikan',
  servis: 'perbaikan',
  buah: 'buah',
  sayur: 'sayurmayur',
  anak: 'anakanak',
  susu: 'anakanak',
  snack: 'makananringan',
  cemilan: 'makananringan',
  lain: 'lainlain',
  lainlain: 'lainlain',
}

export const ALIAS_PEMASUKAN = {
  gaji: 'gaji',
  salary: 'gaji',
  investasi: 'investasi',
  invest: 'investasi',
  dividen: 'investasi',
  paruhwaktu: 'paruhwaktu',
  freelance: 'paruhwaktu',
  sampingan: 'paruhwaktu',
  bonus: 'bonus',
  thr: 'bonus',
  komisi: 'bonus',
  lain: 'lainlain',
  lainlain: 'lainlain',
}

export const QUICK_PREFIX_MAP = {
  rt: 'transportasi',
  transport: 'transportasi',
  mkn: 'makanan',
  blj: 'belanja',
  tag: 'perumahan',
  gj: 'gaji',
}

function normalizeKey(input = '') {
  return String(input).toLowerCase().replace(/[^a-z]/g, '')
}

export function resolveKategoriPengeluaran(input) {
  const key = normalizeKey(input)
  return ALIAS_PENGELUARAN[key] || null
}

export function resolveKategoriPemasukan(input) {
  const key = normalizeKey(input)
  return ALIAS_PEMASUKAN[key] || null
}

export function formatRupiah(angka) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Number(angka) || 0)
}

export function parseAngka(input) {
  if (input === null || input === undefined) return null

  let str = String(input).toLowerCase().trim()
  if (!str) return null

  str = str.replace(/rupiah/g, '')
  str = str.replace(/rp\.?/g, '')
  str = str.replace(/\s+/g, '')

  str = str.replace(/\./g, '').replace(',', '.')

  if (/^\d+(\.\d+)?rb$/.test(str)) {
    return Math.round(parseFloat(str.replace('rb', '')) * 1000)
  }

  if (/^\d+(\.\d+)?k$/.test(str)) {
    return Math.round(parseFloat(str.replace('k', '')) * 1000)
  }

  if (/^\d+(\.\d+)?jt$/.test(str)) {
    return Math.round(parseFloat(str.replace('jt', '')) * 1000000)
  }

  if (/^\d+(\.\d+)?juta$/.test(str)) {
    return Math.round(parseFloat(str.replace('juta', '')) * 1000000)
  }

  const angka = parseFloat(str)
  return Number.isNaN(angka) ? null : Math.round(angka)
}

export function detectBasicIntent(text = '') {
  const raw = String(text).toLowerCase()

  if (
    raw.includes('saldo') ||
    raw.includes('uang saya') ||
    raw.includes('uangku') ||
    raw.includes('duit saya')
  ) {
    return 'cek_saldo'
  }

  if (
    raw.includes('ringkasan') ||
    raw.includes('laporan') ||
    raw.includes('rekap') ||
    raw.includes('summary')
  ) {
    return 'ringkasan'
  }

  return null
}

export function getLabelKategori(type, category) {
  if (!category) return 'Tanpa kategori'
  if (type === 'income') return KATEGORI_PEMASUKAN[category] || category
  return KATEGORI_PENGELUARAN[category] || category
}

export function listAllowedCategories() {
  return {
    expense: Object.keys(KATEGORI_PENGELUARAN),
    income: Object.keys(KATEGORI_PEMASUKAN),
  }
}
