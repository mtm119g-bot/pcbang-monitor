const express = require('express');
const cors = require('cors');
const http = require('http');
const net = require('net');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 데이터 저장 ────────────────────────────────────
let bizList = [];
let pingResults = {};
let statsData = {};
let scanInterval = null;
let scanIntervalMs = 0;

// ── 유틸 ──────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function hourKey() { return new Date().getHours(); }

// ── TCP 핑 (HTTP 연결 시도로 응답시간 측정) ────────
function pingHost(ip) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    const timeout = 3000;
    let done = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (done) return;
      done = true;
      const ms = Date.now() - start;
      socket.destroy();
      resolve({ ip, status: ms > 100 ? 'warn' : 'online', ping: ms, lastCheck: new Date().toISOString() });
    });

    socket.on('timeout', () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ip, status: 'offline', ping: null, lastCheck: new Date().toISOString() });
    });

    socket.on('error', (e) => {
      if (done) return;
      done = true;
      const ms = Date.now() - start;
      // 연결 거부(ECONNREFUSED)는 살아있는 호스트
      if (e.code === 'ECONNREFUSED') {
        resolve({ ip, status: ms > 100 ? 'warn' : 'online', ping: ms, lastCheck: new Date().toISOString() });
      } else {
        resolve({ ip, status: 'offline', ping: null, lastCheck: new Date().toISOString() });
      }
    });

    // 80포트로 TCP 연결 시도
    socket.connect(80, ip);
  });
}

// ── 전체 스캔 ──────────────────────────────────────
async function runScan() {
  const allIPs = [];
  bizList.forEach(b => {
    b.ips.forEach(ip => allIPs.push({ ip, bizId: b.id, bizName: b.name }));
  });
  if (allIPs.length === 0) return;

  console.log(`[${new Date().toLocaleString('ko-KR')}] 스캔 시작 - ${allIPs.length}개 IP`);

  const batchSize = 20;
  for (let i = 0; i < allIPs.length; i += batchSize) {
    const batch = allIPs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(h => pingHost(h.ip)));
    results.forEach((r, idx) => {
      pingResults[r.ip] = { ...r, bizId: batch[idx].bizId, bizName: batch[idx].bizName };
    });
  }

  saveStats();
  console.log(`[${new Date().toLocaleString('ko-KR')}] 스캔 완료`);
}

// ── 통계 저장 ──────────────────────────────────────
function saveStats() {
  const mk = monthKey(), dk = dateKey(), hr = hourKey();
  if (!statsData[mk]) statsData[mk] = {};
  if (!statsData[mk][dk]) statsData[mk][dk] = {};
  if (!statsData[mk][dk][hr]) statsData[mk][dk][hr] = { on: 0, total: 0, n: 0 };

  const slot = statsData[mk][dk][hr];
  const all = Object.values(pingResults);
  slot.on += all.filter(r => r.status === 'online' || r.status === 'warn').length;
  slot.total += all.filter(r => r.status !== 'pending').length;
  slot.n++;

  bizList.forEach(b => {
    const key = `biz_${b.id}_${mk}`;
    if (!statsData[key]) statsData[key] = {};
    if (!statsData[key][dk]) statsData[key][dk] = {};
    if (!statsData[key][dk][hr]) statsData[key][dk][hr] = { on: 0, total: 0, n: 0 };
    const bsl = statsData[key][dk][hr];
    const br = all.filter(r => r.bizId === b.id);
    bsl.on += br.filter(r => r.status === 'online' || r.status === 'warn').length;
    bsl.total += br.filter(r => r.status !== 'pending').length;
    bsl.n++;
  });
}

// ── 자동 스캔 ──────────────────────────────────────
function setAutoScan(intervalMs) {
  if (scanInterval) clearInterval(scanInterval);
  scanIntervalMs = intervalMs;
  if (intervalMs > 0) {
    runScan();
    scanInterval = setInterval(runScan, intervalMs);
    console.log(`자동 스캔: ${intervalMs/60000}분 간격`);
  }
}

// ── IP 파싱 ────────────────────────────────────────
function expandIP(line) {
  line = line.trim();
  const m = line.match(/^(\d+\.\d+\.\d+\.)(\d+)\s*~\s*(\d+)$/);
  if (m) {
    const res = [], s = parseInt(m[2]), e = parseInt(m[3]);
    if (s <= e && e <= 255) for (let i = s; i <= e; i++) res.push(m[1]+i);
    return res;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(line)) return [line];
  return [];
}
function parseIPs(ipRange) {
  const ips = [];
  (ipRange || '').split(/[,\n]/).forEach(p => expandIP(p.trim()).forEach(ip => ips.push(ip)));
  return ips;
}

// ── API ────────────────────────────────────────────
app.get('/api/biz', (req, res) => res.json(bizList));

app.post('/api/biz', (req, res) => {
  bizList = (req.body.bizList || []).map(b => ({ ...b, ips: parseIPs(b.ipRange) }));
  res.json({ ok: true, count: bizList.length });
});

app.get('/api/results', (req, res) => {
  const results = bizList.map(b => {
    const bResults = b.ips.map(ip => pingResults[ip] || {
      ip, bizId: b.id, bizName: b.name, status: 'pending', ping: null, lastCheck: null
    });
    const on = bResults.filter(r => r.status === 'online' || r.status === 'warn').length;
    const off = bResults.filter(r => r.status === 'offline').length;
    const pings = bResults.filter(r => r.ping !== null).map(r => r.ping);
    const avg = pings.length ? Math.round(pings.reduce((a,b)=>a+b,0)/pings.length) : 0;
    return { biz: b, results: bResults, on, off, avg, total: b.ips.length };
  });
  res.json({ results, lastScan: new Date().toISOString() });
});

app.post('/api/scan', (req, res) => { runScan(); res.json({ ok: true }); });

app.post('/api/auto-scan', (req, res) => {
  setAutoScan(req.body.intervalMs || 0);
  res.json({ ok: true, intervalMs: scanIntervalMs });
});

app.get('/api/auto-scan', (req, res) => {
  res.json({ intervalMs: scanIntervalMs, running: scanIntervalMs > 0 });
});

app.get('/api/stats/:month', (req, res) => {
  res.json(statsData[req.params.month] || {});
});

app.get('/api/stats/biz/:bizId/:month', (req, res) => {
  res.json(statsData[`biz_${req.params.bizId}_${req.params.month}`] || {});
});

app.delete('/api/stats/:month', (req, res) => {
  const m = req.params.month;
  delete statsData[m];
  bizList.forEach(b => delete statsData[`biz_${b.id}_${m}`]);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    bizCount: bizList.length,
    ipCount: bizList.reduce((a,b) => a+b.ips.length, 0),
    autoScan: scanIntervalMs > 0,
    intervalMs: scanIntervalMs
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`PC방 핑 모니터 서버: http://localhost:${PORT}`);
});
