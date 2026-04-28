# 🚀 Gentoru Bot

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Repo Size](https://img.shields.io/github/repo-size/rizkanugrha/gentoru)
![Last Commit](https://img.shields.io/github/last-commit/rizkanugrha/gentoru)
![Issues](https://img.shields.io/github/issues/rizkanugrha/gentoru)
![Stars](https://img.shields.io/github/stars/rizkanugrha/gentoru?style=social)

Gentoru adalah WhatsApp Bot berbasis Node.js yang dibangun menggunakan library Baileys. Bot ini dirancang untuk membantu otomatisasi berbagai kebutuhan seperti command handler, manajemen pesan, dan integrasi API (contoh: Midtrans).

## ✨ Fitur Utama

- ⚡ Command handler modular like @discordjs/collections (tanpa prefix / dengan prefix)
- 🤖 Auto response message
- 📦 Struktur OOP (Object-Oriented Programming)
- 🔌 Mudah integrasi API (Midtrans, dll)
- Database JSON & MongoDB
- 🧠 Cooldown & command management
- 📨 Support berbagai jenis message (text, button, dll)
- 🔄 Scalable & mudah dikembangkan

## 🛠️ Tech Stack

- Node.js
- Baileys (WhatsApp Web API)
- JavaScript (ES Module)
- Express (opsional API backend)
- Midtrans (payment gateway)

## 📁 Struktur Project

```
gentoru/
├── cmd/
│   ├── _response/
├── handler/
│   ├── message.js
│   └── command.js
├── lib/
│   ├── utils/
│   └── helper/
├── src/
├── config.js
├── index.js
└── package.json
```

## ⚙️ Instalasi

1. Clone repository

```bash
git clone https://github.com/rizkanugrha/gentoru.git
cd gentoru
```

2. Install dependencies

```bash
npm install
```

3. Jalankan bot

```bash
node index.js
```


## 🔑 Konfigurasi

Edit file `config.js`:

```js
export default {
  bot: {
    prefix: "!",
    owner: "628xxxxxxxxxx",
    no_bot: "628xxxxxxxxx",
  }
}
```

## 📌 Contoh Command

```js
export default function (cmd) {

  cmd.on({
    name: "tes",
    cmd: ["tes", "bot"],
    category: "Main",
    desc: "test bot latency",
    noPrefix: true,
    async execute(client, m, ctx) {

      const start = Date.now();

      const sentMsg = await m.reply('Menghitung ping... 🏓');

      const latency = Date.now() - start;

      if (sentMsg && sentMsg.key) {
        await client.sendMessage(m.from, {
          text: `*PONG!* 🏓\nLatensi: *${latency}ms*`,
          edit: sentMsg.key
        });
      } else {
        // Fallback jika karena alasan tertentu gagal mendapat context pesan sebelumnya
        await m.reply(`*PONG!* 🏓\nLatensi: *${latency}ms*`);
      }
    }
  })

}

```

## 🔄 Command Tanpa Prefix

Bot ini mendukung command tanpa prefix. Pastikan handler message sudah di-handle dengan benar:

```js
noPrefix: true
```

## 🧩 Integrasi Midtrans

Bot ini dapat diintegrasikan dengan Midtrans untuk kebutuhan pembayaran:

- Generate transaksi
- Cek status pembayaran
- Callback webhook

## 📷 Pairing Code Login

Saat pertama kali dijalankan:

- Masukan kode pairing yang ada di terminal
- Session akan tersimpan otomatis

## 🚧 Development

Untuk development mode:

```bash
node index.js
```

## 📄 Lisensi

GNU GENERAL PUBLIC LICENSE

## 👤 Author

- Rizka Nugraha  
- GitHub: https://github.com/rizkanugrha

## 🤝 Kontribusi

Kontribusi sangat terbuka!

1. Fork repo
2. Buat branch baru
3. Commit perubahan
4. Pull request
