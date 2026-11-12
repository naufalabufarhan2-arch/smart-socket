// ============================================================================
// Smart Socket Guard - Backend Server Terpadu (Single File)
// Fitur: Express REST API, WebSocket Live, SQLite Native, Simulator & Proteksi
// ============================================================================

const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ----------------------------------------------------------------------------
// 1. DATABASE SQLITE (Native Node 22/24)
// ----------------------------------------------------------------------------
const db = new DatabaseSync(path.join(__dirname, 'smart_socket.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
    socket_id INTEGER NOT NULL DEFAULT 1,
    voltage REAL NOT NULL,
    current REAL NOT NULL,
    power REAL NOT NULL,
    temperature REAL NOT NULL,
    relay_state INTEGER NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
    socket_id INTEGER DEFAULT 1,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    metric_value REAL,
    threshold_value REAL
  );
`);

function logEvent(socket_id, event_type, severity, message, metric_value = null, threshold_value = null) {
  const stmt = db.prepare(`INSERT INTO events (socket_id, event_type, severity, message, metric_value, threshold_value) VALUES (?, ?, ?, ?, ?, ?)`);
  stmt.run(Number(socket_id) || 1, event_type, severity, message, metric_value, threshold_value);
}

// ----------------------------------------------------------------------------
// 2. STATE 3 STOP KONTAK & AMBANG BATAS KEAMANAN
// ----------------------------------------------------------------------------
const thresholds = {
  overvoltage: 240.0,
  1: { overcurrent: 10.0, overheat: 65.0, overpower: 2200.0 },
  2: { overcurrent: 10.0, overheat: 65.0, overpower: 2200.0 },
  3: { overcurrent: 16.0, overheat: 65.0, overpower: 3500.0 }
};

const sockets = {
  1: { id: 1, name: 'Stop Kontak #1 (TV & Media)', relayState: true, isTripped: false, tripDiagnostic: null, metrics: { voltage: 220, current: 1.85, power: 390, temperature: 32.5 } },
  2: { id: 2, name: 'Stop Kontak #2 (Kulkas & Dapur)', relayState: true, isTripped: false, tripDiagnostic: null, metrics: { voltage: 220, current: 2.65, power: 560, temperature: 35.8 } },
  3: { id: 3, name: 'Stop Kontak #3 (AC & Komputer)', relayState: true, isTripped: false, tripDiagnostic: null, metrics: { voltage: 220, current: 4.45, power: 950, temperature: 39.2 } }
};

// ----------------------------------------------------------------------------
// 3. SIMULATOR BEBAN LISTRIK & TERMAL
// ----------------------------------------------------------------------------
let globalFault = null;
const socketFaults = { 1: null, 2: null, 3: null };

function runSimulatorTick() {
  const vNoise = (Math.random() - 0.5) * 1.8;
  const voltage = globalFault === 'OVERVOLTAGE' ? (252.0 + Math.random() * 5.0) : (220.5 + vNoise);

  const baseAmps = { 1: 1.85, 2: 2.65, 3: 4.45 };

  for (const id of [1, 2, 3]) {
    const s = sockets[id];
    let current = 0.0;

    if (s.relayState) {
      if (socketFaults[id] === 'OVERCURRENT') {
        current = (id === 3 ? 18.2 : 13.8) + (Math.random() * 1.5);
      } else {
        current = Math.max(0.1, baseAmps[id] + (Math.random() - 0.5) * 0.2);
      }
    }

    const power = s.relayState ? (voltage * current * 0.96) : 0;

    if (socketFaults[id] === 'OVERHEAT') {
      s.metrics.temperature = Math.min(85, s.metrics.temperature + 2.5);
    } else {
      if (s.relayState && current > 0) {
        s.metrics.temperature += (current * 0.08 - (s.metrics.temperature - 29.5) * 0.05) * 0.3;
      } else {
        s.metrics.temperature -= (s.metrics.temperature - 29.5) * 0.08;
      }
    }

    s.metrics = {
      voltage: Math.round(voltage * 10) / 10,
      current: Math.round(current * 100) / 100,
      power: Math.round(power * 10) / 10,
      temperature: Math.max(29.5, Math.round(s.metrics.temperature * 10) / 10)
    };

    // Evaluasi Proteksi Auto Cut-Off
    checkProtection(id);
  }
}

// ----------------------------------------------------------------------------
// 4. ENGINE PROTEKSI & PEMUTUSAN OTOMATIS (CUT-OFF)
// ----------------------------------------------------------------------------
function checkProtection(socketId) {
  const s = sockets[socketId];
  const th = thresholds[socketId];
  const m = s.metrics;

  const violations = [];

  if (m.voltage > thresholds.overvoltage) {
    violations.push({
      type: 'OVERVOLTAGE',
      title: 'Tegangan PLN Melonjak (Overvoltage)',
      detail: `Tegangan terukur ${m.voltage}V melebihi batas aman ${thresholds.overvoltage}V.`,
      hazard: 'Lonjakan tegangan merusak power supply dan komponen elektronik.',
      action: 'Tunggu tegangan stabil lalu klik Reset Proteksi.',
      val: m.voltage, lim: thresholds.overvoltage
    });
  }

  if (m.current > th.overcurrent) {
    violations.push({
      type: 'OVERCURRENT',
      title: 'Arus Beban Berlebih (Overcurrent)',
      detail: `Arus terukur ${m.current}A melebihi kapasitas kabel/stop kontak ${th.overcurrent}A!`,
      hazard: 'Arus berlebih memicu panas ekstrem pada kabel dan resiko kebakaran.',
      action: 'Cabut peralatan beban berat yang terhubung ke soket ini, lalu klik Reset Proteksi.',
      val: m.current, lim: th.overcurrent
    });
  }

  if (m.temperature > th.overheat) {
    violations.push({
      type: 'OVERHEAT',
      title: 'Suhu Kontak Terlalu Panas (Overheated)',
      detail: `Suhu terminal mencapai ${m.temperature}°C melebihi batas aman ${th.overheat}°C!`,
      hazard: 'Suhu kontak tinggi menandakan jepitan steker longgar beresiko membakar stop kontak.',
      action: 'Biarkan dingin dan pastikan steker terpasang rapat sebelum me-reset.',
      val: m.temperature, lim: th.overheat
    });
  }

  if (violations.length > 0 && s.relayState) {
    // AUTO CUT-OFF AKTIF
    s.relayState = false;
    s.isTripped = true;

    const v = violations[0];
    s.tripDiagnostic = {
      socketId,
      socketName: s.name,
      type: v.type,
      title: v.title,
      detail: v.detail,
      hazard: v.hazard,
      action: v.action,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false })
    };

    logEvent(socketId, `${v.type}_TRIP`, 'DANGER', `[AUTO CUT-OFF] ${v.detail}`, v.val, v.lim);

    broadcastWs({
      type: 'ALARM_TRIP',
      data: { socketId, socketName: s.name, diagnostic: s.tripDiagnostic }
    });
  }
}

// ----------------------------------------------------------------------------
// 5. WEBSOCKET & BACKGROUND TICK
// ----------------------------------------------------------------------------
function broadcastWs(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

setInterval(() => {
  runSimulatorTick();
  broadcastWs({ type: 'TELEMETRY', data: { sockets } });
}, 1000);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'INIT', data: { sockets } }));
});

// ----------------------------------------------------------------------------
const fs = require('node:fs');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

app.get('/', (req, res) => {
  res.type('html').send(indexHtml);
});

app.get('/api/status', (req, res) => {
  const activeDiagnostics = Object.values(sockets).filter(s => s.isTripped && s.tripDiagnostic).map(s => s.tripDiagnostic);
  res.json({ sockets, activeDiagnostics });
});

app.post('/api/relay', (req, res) => {
  const { socketId, state } = req.body;
  const s = sockets[socketId];
  if (!s) return res.status(404).json({ error: 'Soket tidak ditemukan' });
  if (state && s.isTripped) return res.status(403).json({ message: 'Soket TRIPPED! Reset proteksi terlebih dahulu.' });

  s.relayState = Boolean(state);
  logEvent(socketId, s.relayState ? 'RELAY_ON' : 'RELAY_OFF', 'INFO', `${s.name} di-${s.relayState ? 'NYALAKAN' : 'MATIKAN'}.`);
  broadcastWs({ type: 'RELAY_UPDATE', data: { socketId, relayState: s.relayState, isTripped: s.isTripped, tripDiagnostic: s.tripDiagnostic } });
  res.json({ success: true, socketId, relayState: s.relayState });
});

app.post('/api/relay/all', (req, res) => {
  const { state } = req.body;
  for (const id of [1, 2, 3]) {
    if (!sockets[id].isTripped) sockets[id].relayState = Boolean(state);
  }
  broadcastWs({ type: 'RELAY_UPDATE_ALL', data: { sockets } });
  res.json({ success: true, sockets });
});

app.post('/api/reset', (req, res) => {
  const { socketId } = req.body;
  const resetOne = (id) => {
    socketFaults[id] = null;
    globalFault = null;
    sockets[id].isTripped = false;
    sockets[id].tripDiagnostic = null;
    logEvent(id, 'SYSTEM_RESET', 'INFO', `Proteksi Soket #${id} di-reset.`);
  };

  if (socketId === 'all') {
    for (const id of [1, 2, 3]) resetOne(id);
    broadcastWs({ type: 'RELAY_UPDATE_ALL', data: { sockets } });
    res.json({ success: true, message: 'Seluruh proteksi berhasil di-reset!' });
  } else {
    resetOne(socketId);
    broadcastWs({ type: 'RELAY_UPDATE', data: { socketId, relayState: sockets[socketId].relayState, isTripped: false, tripDiagnostic: null } });
    res.json({ success: true, message: `Proteksi Soket #${socketId} berhasil di-reset.` });
  }
});

app.post('/api/simulator/fault', (req, res) => {
  const { socketId, type } = req.body;
  if (type === 'OVERVOLTAGE') {
    globalFault = 'OVERVOLTAGE';
  } else {
    socketFaults[socketId] = type;
  }
  setTimeout(() => {
    socketFaults[socketId] = null;
    globalFault = null;
  }, 12000);
  res.json({ success: true, socketId, type });
});

app.get('/api/events', (req, res) => {
  const stmt = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 20');
  res.json({ rows: stmt.all() });
});

app.get('/api/export/csv', (req, res) => {
  const stmt = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 500');
  const rows = stmt.all();
  let csv = 'ID,Waktu,Stop Kontak ID,Kejadian,Tingkat,Pesan,Nilai Sensor,Batas\n';
  rows.forEach(r => {
    csv += `${r.id},"${r.timestamp}",Soket #${r.socket_id},${r.event_type},${r.severity},"${r.message}",${r.metric_value || '-'},${r.threshold_value || '-'}\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=log_proteksi_${Date.now()}.csv`);
  res.send(csv);
});

// Jalankan Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Smart Socket Guard Server Berjalan di Port ${PORT}`);
  console.log(`📡 URL Web: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
