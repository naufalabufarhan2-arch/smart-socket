# ⚡ Smart Extension (3-Channel) - Polibatam

Aplikasi web monitoring dan kontrol proteksi untuk **3 Stop Kontak Pintar** dengan pemutusan otomatis (*Auto Cut-Off*) saat terjadi **Overcurrent**, **Overheated**, dan **Overvoltage**.

---

## 📁 Struktur Ringkas Proyek (Hanya 4 File Utama)

```text
smart-socket-iot/
├── server.js          # Backend terpadu: Express API, WebSocket, SQLite, & Proteksi
├── index.html         # Frontend tunggal: Dashboard, Grafik Chart.js, & Kotak Diagnostik
├── esp32.ino          # Firmware Arduino untuk mikrokontroler ESP32 fisik
├── package.json       # Dependensi Node.js minimal (express, ws)
└── README.md          # Panduan cara menjalankan
```

---

## 🚀 Cara Menjalankan

1. **Jalankan Server:**
   ```bash
   node server.js
   ```

2. **Buka Web Dashboard di Browser:**
   ```text
   http://localhost:3000
   ```

---

## 🌟 Fitur Utama

1. **Kotak Diagnostik Alasan Terputus**: Menerangkan secara jelas alasan stop kontak diputus (Overcurrent / Overheated / Overvoltage), nilai terukur vs batas aman, analisis bahaya, dan tombol reset proteksi.
2. **3 Stop Kontak Terpisah**: Kontrol ON/OFF saklar masing-masing stop kontak secara independen.
3. **Proteksi Selektif**: Jika Soket #2 trip karena kelebihan beban, hanya Soket #2 yang mati; Soket #1 dan #3 tetap menyala normal.
4. **Grafik Real-Time (Chart.js)**: Kurva perbandingan Arus (A), Suhu (°C), dan Daya (W) live via WebSocket.
5. **Histori & Ekspor CSV**: Riwayat insiden alarm dan tombol unduh CSV.
6. **Simulator Uji Coba Cepat**: Tombol *💥 Overcur*, *🔥 Overheat*, *⚡ Overvolt* untuk menguji proteksi langsung di browser.

---

## 🔌 Pinout ESP32 (Jika Menggunakan Hardware Fisik)

- **Relay 1:** GPIO 26
- **Relay 2:** GPIO 27
- **Relay 3:** GPIO 25
- **Sensor PZEM-004T:** RX2 GPIO 16, TX2 GPIO 17
- **Sensor Suhu DS18B20:** GPIO 4
