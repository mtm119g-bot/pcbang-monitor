const express = require('express');
const cors = require('cors');
const http = require('http');
const net = require('net');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const JWT_SECRET = process.env.JWT_SECRET || 'pcbang-monitor-secret-2024';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URL)
  .then(() => {
    console.log('MongoDB 연결 성공');
    // 자동스캔 복원
    setTimeout(async () => {
      try {
        const settings = await AutoScan.find({ enabled: true });
        console.log(`자동스캔 복원: ${settings.length}개 사용자`);
        for (const s of settings) {
          setAutoScan(String(s.userId), s.intervalMs);
        }
      } catch(e) { console.error('자동스캔 복원 실패:', e); }
    }, 1000);
    // 구독 만료 체크
    checkExpiredSubs();
    setInterval(checkExpiredSubs, 1000 * 60 * 60);
  })
  .catch(err => console.error('MongoDB 연결 실패:', err));

// ── 스키마 ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  grade: { type: Number, default: 1, min: 1, max: 4 }, // 1:Free(3개) 2:Basic(10개) 3:Pro(무제한) 4:관리자
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  memo: { type: String, default: '' } // 관리자 메모
});

const bizSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  color: { type: String, default: '#00d4ff' },
  ipRange: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const statsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  bizId: { type: mongoose.Schema.Types.ObjectId, default: null },
  date: { type: String, required: true },
  hour: { type: Number, required: true },
  onCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  sampleCount: { type: Number, default: 0 }
});
statsSchema.index({ userId: 1, bizId: 1, date: 1, hour: 1 }, { unique: true });

// 자동스캔 설정 스키마 - DB에 저장해서 서버 재시작해도 유지
const autoScanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  intervalMs: { type: Number, default: 0 },
  enabled: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

// 구독 스키마
const subSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan:      { type: String, enum: ['basic','pro'], required: true },
  cycle:     { type: String, enum: ['monthly','yearly'], required: true },
  status:    { type: String, enum: ['active','cancelled','expired'], default: 'active' },
  orderId:   { type: String, required: true, unique: true },
  paymentKey:{ type: String },
  amount:    { type: Number, required: true },
  startAt:   { type: Date, default: Date.now },
  expireAt:  { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Biz = mongoose.model('Biz', bizSchema);
const Stats = mongoose.model('Stats', statsSchema);
const AutoScan = mongoose.model('AutoScan', autoScanSchema);
const Sub = mongoose.model('Sub', subSchema);

// ── 유틸 ──────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function nowHour() { return new Date().getHours(); }

// ── 미들웨어 ───────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ error: '토큰이 만료되었습니다. 다시 로그인해주세요' }); }
}
function adminAuth(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다' });
  next();
}

// ── IP 파싱 ────────────────────────────────────────
function expandIP(line) {
  line = line.trim();
  const parts = line.split('~');
  if (parts.length === 2) {
    const ipPart = parts[0].trim();
    const lastDot = ipPart.lastIndexOf('.');
    const prefix = ipPart.substring(0, lastDot + 1);
    const start = parseInt(ipPart.substring(lastDot + 1));
    const end = parseInt(parts[1].trim());
    const res = [];
    if (prefix && !isNaN(start) && !isNaN(end) && start <= end && end <= 255)
      for (let i = start; i <= end; i++) res.push(prefix + i);
    return res;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(line)) return [line];
  return [];
}
function parseIPs(ipRange) {
  const ips = [];
  (ipRange || '').split(',').forEach(p => expandIP(p.trim()).forEach(ip => ips.push(ip)));
  return ips;
}

// ── 핑 체크 ────────────────────────────────────────
function pingHost(ip) {
  return new Promise((resolve) => {
    const start = Date.now(); const socket = new net.Socket(); let done = false;
    socket.setTimeout(3000);
    socket.on('connect', () => { if(done)return; done=true; const ms=Date.now()-start; socket.destroy(); resolve({ip, status:ms>100?'warn':'online', ping:ms, lastCheck:new Date().toISOString()}); });
    socket.on('timeout', () => { if(done)return; done=true; socket.destroy(); resolve({ip, status:'offline', ping:null, lastCheck:new Date().toISOString()}); });
    socket.on('error', (e) => { if(done)return; done=true; const ms=Date.now()-start; resolve({ip, status:e.code==='ECONNREFUSED'?(ms>100?'warn':'online'):'offline', ping:e.code==='ECONNREFUSED'?ms:null, lastCheck:new Date().toISOString()}); });
    socket.connect(80, ip);
  });
}

// ── 스캔 상태 (메모리) ─────────────────────────────
const scanState = {}; // { userId: { results, intervalMs, interval, lastScan } }

async function runScan(userId) {
  const bizList = await Biz.find({ userId });
  if (!bizList.length) return;
  const allIPs = [];
  bizList.forEach(b => parseIPs(b.ipRange).forEach(ip => allIPs.push({ ip, bizId: b._id })));
  if (!allIPs.length) return;
  if (!scanState[userId]) scanState[userId] = { results:{}, intervalMs:0, interval:null, lastScan:null };

  console.log(`[${new Date().toLocaleString('ko-KR')}] [${userId}] 스캔 시작 - ${allIPs.length}개 IP`);

  for (let i=0; i<allIPs.length; i+=20) {
    const batch = allIPs.slice(i, i+20);
    const results = await Promise.all(batch.map(h => pingHost(h.ip)));
    results.forEach((r,idx) => { scanState[userId].results[r.ip] = {...r, bizId:batch[idx].bizId}; });
  }
  scanState[userId].lastScan = new Date().toISOString();
  await saveStats(userId, bizList);
  console.log(`[${new Date().toLocaleString('ko-KR')}] [${userId}] 스캔 완료`);
}

async function saveStats(userId, bizList) {
  const dk=today(), hr=nowHour();
  const all = Object.values(scanState[userId]?.results||{});
  await Stats.findOneAndUpdate(
    {userId, bizId:null, date:dk, hour:hr},
    {$inc:{onCount:all.filter(r=>r.status==='online'||r.status==='warn').length, totalCount:all.filter(r=>r.status!=='pending').length, sampleCount:1}},
    {upsert:true}
  );
  for (const b of bizList) {
    const br = all.filter(r=>String(r.bizId)===String(b._id));
    if (!br.length) continue;
    await Stats.findOneAndUpdate(
      {userId, bizId:b._id, date:dk, hour:hr},
      {$inc:{onCount:br.filter(r=>r.status==='online'||r.status==='warn').length, totalCount:br.filter(r=>r.status!=='pending').length, sampleCount:1}},
      {upsert:true}
    );
  }
}

// ── 자동스캔 설정 (정각/30분 맞춤) ──────────────────
function getNextScanTime(intervalMs) {
  const now = new Date();
  const ms = now.getTime();
  if (intervalMs === 1800000) {
    // 30분 단위 - 매시 0분, 30분에 맞춤
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const msInHour = (minutes * 60 + seconds) * 1000 + now.getMilliseconds();
    if (minutes < 30) {
      // 다음 :30분
      return 30 * 60 * 1000 - msInHour;
    } else {
      // 다음 :00분 (다음 시간 정각)
      return 60 * 60 * 1000 - msInHour;
    }
  } else if (intervalMs === 3600000) {
    // 1시간 단위 - 매시 정각에 맞춤
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const msInHour = (minutes * 60 + seconds) * 1000 + now.getMilliseconds();
    return 60 * 60 * 1000 - msInHour;
  } else if (intervalMs === 7200000) {
    // 2시간 단위 - 짝수 시 정각에 맞춤
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const nextEvenHour = hours % 2 === 0 ? hours + 2 : hours + 1;
    const nextTime = new Date(now);
    nextTime.setHours(nextEvenHour, 0, 0, 0);
    return nextTime.getTime() - now.getTime();
  }
  return intervalMs;
}

function setAutoScan(userId, intervalMs) {
  if (!scanState[userId]) scanState[userId] = {results:{}, intervalMs:0, interval:null, timeout:null, lastScan:null};
  if (scanState[userId].interval) {
    clearInterval(scanState[userId].interval);
    clearTimeout(scanState[userId].timeout);
  }
  scanState[userId].intervalMs = intervalMs;

  if (intervalMs > 0) {
    // 즉시 1회 스캔
    runScan(userId);

    if (intervalMs === 1800000 || intervalMs === 3600000 || intervalMs === 7200000) {
      // 정각/30분에 맞춰서 시작
      const waitMs = getNextScanTime(intervalMs);
      const waitMin = Math.round(waitMs / 60000);
      console.log(`[${userId}] 자동스캔 설정: ${intervalMs/60000}분 간격 (${waitMin}분 후 정각에 시작)`);

      scanState[userId].timeout = setTimeout(() => {
        runScan(userId);
        scanState[userId].interval = setInterval(() => runScan(userId), intervalMs);
      }, waitMs);
    } else {
      // 일반 간격
      scanState[userId].interval = setInterval(() => runScan(userId), intervalMs);
      console.log(`[${userId}] 자동스캔 설정: ${intervalMs/60000}분 간격`);
    }
  } else {
    console.log(`[${userId}] 자동스캔 중지`);
  }
}

// ══════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  try {
    const {username, password, name} = req.body;
    if (!username||!password||!name) return res.status(400).json({error:'모든 항목을 입력해주세요'});
    if (password.length < 4) return res.status(400).json({error:'비밀번호는 4자 이상이어야 합니다'});
    if (await User.findOne({username})) return res.status(400).json({error:'이미 사용 중인 아이디입니다'});
    const user = await User.create({username, password: await bcrypt.hash(password,10), name});
    await Biz.insertMany([
      {userId:user._id, name:'A 업체', color:'#00d4ff'},
      {userId:user._id, name:'B 업체', color:'#00ff88'},
      {userId:user._id, name:'C 업체', color:'#ffaa00'}
    ]);
    const token = jwt.sign({id:user._id, username:user.username, name:user.name, role:user.role, grade:user.grade||1}, JWT_SECRET, {expiresIn:'7d'});
    res.json({token, user:{id:user._id, username:user.username, name:user.name, role:user.role, grade:user.grade||1}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const {username, password} = req.body;
    if (!username||!password) return res.status(400).json({error:'아이디와 비밀번호를 입력해주세요'});
    const user = await User.findOne({username});
    if (!user) return res.status(400).json({error:'아이디 또는 비밀번호가 틀렸습니다'});
    if (!user.isActive) return res.status(403).json({error:'정지된 계정입니다. 관리자에게 문의하세요'});
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({error:'아이디 또는 비밀번호가 틀렸습니다'});
    user.lastLogin = new Date(); await user.save();
    const token = jwt.sign({id:user._id, username:user.username, name:user.name, role:user.role, grade:user.grade||1}, JWT_SECRET, {expiresIn:'7d'});
    res.json({token, user:{id:user._id, username:user.username, name:user.name, role:user.role, grade:user.grade||1}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({error:'사용자를 찾을 수 없습니다'});
  const grade = user.grade || 1;
  const maxBiz = grade === 1 ? 3 : grade === 2 ? 10 : 9999;
  res.json({...user.toObject(), maxBiz});
});

app.put('/api/auth/password', auth, async (req, res) => {
  try {
    const {oldPassword, newPassword} = req.body;
    const user = await User.findById(req.user.id);
    if (!await bcrypt.compare(oldPassword, user.password)) return res.status(400).json({error:'현재 비밀번호가 틀렸습니다'});
    if (newPassword.length < 4) return res.status(400).json({error:'비밀번호는 4자 이상이어야 합니다'});
    user.password = await bcrypt.hash(newPassword, 10); await user.save();
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// 업체
app.get('/api/biz', auth, async (req, res) => res.json(await Biz.find({userId:req.user.id})));
app.post('/api/biz', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const grade = user?.grade || 1;
    const maxBiz = grade === 1 ? 3 : grade === 2 ? 10 : grade >= 3 ? 9999 : 3;
    const bizList = (req.body.bizList || []).slice(0, maxBiz);
    await Biz.deleteMany({userId:req.user.id});
    const created = await Biz.insertMany(bizList.map(b=>({userId:req.user.id, name:b.name, color:b.color, ipRange:b.ipRange||''})));
    res.json({ok:true, count:created.length, maxBiz, grade});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// 스캔 결과
app.get('/api/results', auth, async (req, res) => {
  const bizList = await Biz.find({userId:req.user.id});
  const state = scanState[req.user.id]||{results:{}, lastScan:null};
  const results = bizList.map(b => {
    const ips = parseIPs(b.ipRange);
    const br = ips.map(ip => state.results[ip]||{ip, bizId:b._id, status:'pending', ping:null, lastCheck:null});
    const on=br.filter(r=>r.status==='online'||r.status==='warn').length;
    const off=br.filter(r=>r.status==='offline').length;
    const pings=br.filter(r=>r.ping!==null).map(r=>r.ping);
    const avg=pings.length?Math.round(pings.reduce((a,b)=>a+b,0)/pings.length):0;
    return {biz:b, results:br, on, off, avg, total:ips.length};
  });
  res.json({results, lastScan:state.lastScan, autoScan: (scanState[req.user.id]?.intervalMs||0) > 0, intervalMs: scanState[req.user.id]?.intervalMs||0});
});

// 수동 스캔
app.post('/api/scan', auth, (req, res) => { runScan(req.user.id); res.json({ok:true}); });

// 자동스캔 설정 - DB에 저장해서 서버 재시작해도 유지
app.post('/api/auto-scan', auth, async (req, res) => {
  const intervalMs = req.body.intervalMs || 0;
  setAutoScan(req.user.id, intervalMs);
  // DB에 저장
  await AutoScan.findOneAndUpdate(
    {userId: req.user.id},
    {intervalMs, enabled: intervalMs > 0, updatedAt: new Date()},
    {upsert: true}
  );
  res.json({ok:true, intervalMs, enabled: intervalMs > 0});
});

app.get('/api/auto-scan', auth, async (req, res) => {
  const s = scanState[req.user.id]||{intervalMs:0};
  const dbSetting = await AutoScan.findOne({userId: req.user.id});
  // 다음 스캔 예정 시간 계산
  let nextScanAt = null;
  if (s.intervalMs > 0) {
    const waitMs = getNextScanTime(s.intervalMs);
    nextScanAt = new Date(Date.now() + waitMs).toISOString();
  }
  res.json({
    intervalMs: s.intervalMs,
    running: s.intervalMs > 0,
    lastScan: s.lastScan,
    nextScanAt: nextScanAt,
    dbEnabled: dbSetting?.enabled || false,
    dbIntervalMs: dbSetting?.intervalMs || 0
  });
});

// 통계
app.get('/api/stats/:month', auth, async (req, res) => {
  const stats = await Stats.find({userId:req.user.id, bizId:null, date:{$regex:'^'+req.params.month}});
  const r={};
  stats.forEach(s=>{if(!r[s.date])r[s.date]={};r[s.date][s.hour]={on:s.onCount,tot:s.totalCount,n:s.sampleCount};});
  res.json(r);
});
app.get('/api/stats/biz/:bizId/:month', auth, async (req, res) => {
  const stats = await Stats.find({userId:req.user.id, bizId:req.params.bizId, date:{$regex:'^'+req.params.month}});
  const r={};
  stats.forEach(s=>{if(!r[s.date])r[s.date]={};r[s.date][s.hour]={on:s.onCount,tot:s.totalCount,n:s.sampleCount};});
  res.json(r);
});
app.delete('/api/stats/:month', auth, async (req, res) => {
  await Stats.deleteMany({userId:req.user.id, date:{$regex:'^'+req.params.month}});
  res.json({ok:true});
});

// GeoIP
app.get('/api/geoip/:ip', auth, async (req, res) => {
  try {
    const ip = req.params.ip;
    const url = `http://ip-api.com/json/${ip}?lang=ko&fields=status,city,regionName,country,lat,lon,isp`;
    const data = await new Promise((resolve, reject) => {
      http.get(url, (r) => {
        let body = '';
        r.on('data', (chunk) => body += chunk);
        r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 관리자
app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  const totalUsers=await User.countDocuments();
  const activeUsers=await User.countDocuments({isActive:true});
  const totalBiz=await Biz.countDocuments();
  const scanning=Object.values(scanState).filter(s=>s.intervalMs>0).length;
  const autoScanUsers=await AutoScan.countDocuments({enabled:true});
  res.json({totalUsers, activeUsers, totalBiz, scanning, autoScanUsers});
});

app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  const users = await User.find().select('-password').sort({createdAt:-1});
  const result = await Promise.all(users.map(async u => {
    const bizCount = await Biz.countDocuments({userId:u._id});
    const state = scanState[String(u._id)]||{intervalMs:0};
    const autoScan = await AutoScan.findOne({userId:u._id});
    const grade = u.grade || 1;
    const maxBiz = grade === 1 ? 3 : grade === 2 ? 10 : grade >= 3 ? 9999 : 3;
    return {...u.toObject(), bizCount, autoScan:state.intervalMs>0, intervalMs:state.intervalMs, dbAutoScan:autoScan?.enabled||false, maxBiz};
  }));
  res.json(result);
});

// 회원 등급 변경
app.put('/api/admin/users/:id/grade', auth, adminAuth, async (req, res) => {
  const { grade } = req.body;
  if (![1,2,3,4].includes(parseInt(grade))) return res.status(400).json({error:'등급은 1~4 사이여야 합니다'});
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({error:'회원을 찾을 수 없습니다'});
  user.grade = parseInt(grade);
  if (grade === 4) user.role = 'admin';
  else user.role = 'user';
  await user.save();
  res.json({ok:true, grade:user.grade, role:user.role});
});

// 회원 메모 수정
app.put('/api/admin/users/:id/memo', auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, {memo: req.body.memo || ''});
  res.json({ok:true});
});

app.put('/api/admin/users/:id/toggle', auth, adminAuth, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({error:'회원을 찾을 수 없습니다'});
  if (user.role==='admin') return res.status(400).json({error:'관리자는 정지할 수 없습니다'});
  user.isActive = !user.isActive; await user.save();
  res.json({ok:true, isActive:user.isActive});
});

app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({error:'회원을 찾을 수 없습니다'});
  if (user.role==='admin') return res.status(400).json({error:'관리자는 삭제할 수 없습니다'});
  await Biz.deleteMany({userId:user._id});
  await Stats.deleteMany({userId:user._id});
  await AutoScan.deleteOne({userId:user._id});
  await User.deleteOne({_id:user._id});
  res.json({ok:true});
});

app.put('/api/admin/users/:id/password', auth, adminAuth, async (req, res) => {
  const {newPassword} = req.body;
  if (!newPassword||newPassword.length<4) return res.status(400).json({error:'비밀번호는 4자 이상이어야 합니다'});
  await User.findByIdAndUpdate(req.params.id, {password:await bcrypt.hash(newPassword,10)});
  res.json({ok:true});
});

app.post('/api/admin/init', async (req, res) => {
  const exists = await User.findOne({role:'admin'});
  if (exists) return res.status(400).json({error:'관리자가 이미 존재합니다'});
  const {username='admin', password='admin1234', name='관리자'} = req.body;
  const admin = await User.create({username, password:await bcrypt.hash(password,10), name, role:'admin', grade:4});
  res.json({ok:true, message:'관리자 계정이 생성되었습니다', username:admin.username});
});

// 임시 관리자 등급 수정 API (URL 알아야만 접근 가능)
app.get('/api/setup/make-admin/:username', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      {username: req.params.username},
      {role: 'admin', grade: 4},
      {new: true}
    );
    if (!user) return res.status(404).json({error:'사용자를 찾을 수 없습니다'});
    res.json({ok:true, message:user.username+'을 관리자로 설정했습니다', grade:4, role:'admin'});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── 구독 플랜 정의 ─────────────────────────────────
const PLANS = {
  basic:  { monthly: 9900,  yearly: 94800,  grade: 2 }, // 연간 = 7900*12
  pro:    { monthly: 100000, yearly: 960000, grade: 3 }  // 연간 = 80000*12
};

// 내 구독 정보 조회
app.get('/api/sub/me', auth, async (req, res) => {
  try {
    const sub = await Sub.findOne({ userId: req.user.id, status: 'active' }).sort({ createdAt: -1 });
    res.json({ sub: sub || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 결제 성공 후 검증 & 구독 등록
app.post('/api/sub/confirm', auth, async (req, res) => {
  try {
    const { paymentKey, orderId, amount, plan, cycle } = req.body;
    if (!paymentKey || !orderId || !amount || !plan || !cycle)
      return res.status(400).json({ error: '필수 파라미터 누락' });

    const planInfo = PLANS[plan];
    if (!planInfo) return res.status(400).json({ error: '잘못된 플랜' });

    const expectedAmount = planInfo[cycle];
    if (parseInt(amount) !== expectedAmount)
      return res.status(400).json({ error: '결제 금액 불일치' });

    // 토스페이먼츠 결제 승인 요청
    const TOSS_SECRET = process.env.TOSS_SECRET_KEY || '';
    const authHeader = 'Basic ' + Buffer.from(TOSS_SECRET + ':').toString('base64');
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount) })
    });
    const tossData = await tossRes.json();
    if (!tossRes.ok) return res.status(400).json({ error: tossData.message || '결제 승인 실패' });

    // 기존 구독 만료 처리
    await Sub.updateMany({ userId: req.user.id, status: 'active' }, { status: 'cancelled' });

    // 만료일 계산
    const expireAt = new Date();
    if (cycle === 'monthly') expireAt.setMonth(expireAt.getMonth() + 1);
    else expireAt.setFullYear(expireAt.getFullYear() + 1);

    // 구독 저장
    await Sub.create({ userId: req.user.id, plan, cycle, orderId, paymentKey, amount: parseInt(amount), expireAt, status: 'active' });

    // 등급 업그레이드
    await User.findByIdAndUpdate(req.user.id, { grade: planInfo.grade });

    res.json({ ok: true, plan, cycle, expireAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 구독 취소
app.post('/api/sub/cancel', auth, async (req, res) => {
  try {
    const sub = await Sub.findOne({ userId: req.user.id, status: 'active' });
    if (!sub) return res.status(400).json({ error: '활성 구독이 없습니다' });
    await Sub.findByIdAndUpdate(sub._id, { status: 'cancelled' });
    await User.findByIdAndUpdate(req.user.id, { grade: 1 });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 구독 만료 체크 (매일 자정 실행)
async function checkExpiredSubs() {
  const expired = await Sub.find({ status: 'active', expireAt: { $lt: new Date() } });
  for (const sub of expired) {
    await Sub.findByIdAndUpdate(sub._id, { status: 'expired' });
    await User.findByIdAndUpdate(sub.userId, { grade: 1 });
    console.log(`구독 만료 처리: userId=${sub.userId}`);
  }
}

// 토스페이먼츠 결제 성공/실패 리다이렉트
app.get('/payment/success', (req, res) => {
  const { paymentKey, orderId, amount, plan, cycle } = req.query;
  res.redirect(`/?paymentKey=${paymentKey}&orderId=${orderId}&amount=${amount}&plan=${plan}&cycle=${cycle}`);
});
app.get('/payment/fail', (req, res) => {
  res.redirect('/?paymentFail=1');
});

app.get('/api/health', (req, res) => res.json({ok:true, db:mongoose.connection.readyState===1?'connected':'disconnected'}));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => console.log(`서버 실행: http://localhost:${PORT}`));
