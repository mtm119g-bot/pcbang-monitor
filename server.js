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

const MONGO_URL = process.env.MONGO_URL || 'mongodb://svc.sel3.cloudtype.app:32668';
const JWT_SECRET = process.env.JWT_SECRET || 'pcbang-monitor-secret-2024';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URL)
  .then(() => console.log('MongoDB 연결 성공'))
  .catch(err => console.error('MongoDB 연결 실패:', err));

// ── 스키마 ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
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

const User = mongoose.model('User', userSchema);
const Biz = mongoose.model('Biz', bizSchema);
const Stats = mongoose.model('Stats', statsSchema);

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
  const m = line.match(/^(\d+\.\d+\.\d+\.)(\d+)\s*~\s*(\d+)$/);
  if (m) { const res=[],s=parseInt(m[2]),e=parseInt(m[3]); if(s<=e&&e<=255) for(let i=s;i<=e;i++) res.push(m[1]+i); return res; }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(line)) return [line];
  return [];
}
function parseIPs(ipRange) {
  const ips = [];
  (ipRange||'').split(/[,\n]/).forEach(p => expandIP(p.trim()).forEach(ip => ips.push(ip)));
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

// ── 스캔 상태 ──────────────────────────────────────
const scanState = {};

async function runScan(userId) {
  const bizList = await Biz.find({ userId });
  if (!bizList.length) return;
  const allIPs = [];
  bizList.forEach(b => parseIPs(b.ipRange).forEach(ip => allIPs.push({ ip, bizId: b._id })));
  if (!allIPs.length) return;
  if (!scanState[userId]) scanState[userId] = { results:{}, intervalMs:0, interval:null };
  for (let i=0; i<allIPs.length; i+=20) {
    const batch = allIPs.slice(i, i+20);
    const results = await Promise.all(batch.map(h => pingHost(h.ip)));
    results.forEach((r,idx) => { scanState[userId].results[r.ip] = {...r, bizId:batch[idx].bizId}; });
  }
  await saveStats(userId, bizList);
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

function setAutoScan(userId, intervalMs) {
  if (!scanState[userId]) scanState[userId] = {results:{}, intervalMs:0, interval:null};
  if (scanState[userId].interval) clearInterval(scanState[userId].interval);
  scanState[userId].intervalMs = intervalMs;
  if (intervalMs > 0) { runScan(userId); scanState[userId].interval = setInterval(()=>runScan(userId), intervalMs); }
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
    const token = jwt.sign({id:user._id, username:user.username, name:user.name, role:user.role}, JWT_SECRET, {expiresIn:'7d'});
    res.json({token, user:{id:user._id, username:user.username, name:user.name, role:user.role}});
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
    const token = jwt.sign({id:user._id, username:user.username, name:user.name, role:user.role}, JWT_SECRET, {expiresIn:'7d'});
    res.json({token, user:{id:user._id, username:user.username, name:user.name, role:user.role}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// 내정보
app.get('/api/auth/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// 비밀번호 변경
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
    await Biz.deleteMany({userId:req.user.id});
    const created = await Biz.insertMany(req.body.bizList.map(b=>({userId:req.user.id, name:b.name, color:b.color, ipRange:b.ipRange||''})));
    res.json({ok:true, count:created.length});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// 스캔
app.get('/api/results', auth, async (req, res) => {
  const bizList = await Biz.find({userId:req.user.id});
  const state = scanState[req.user.id]||{results:{}};
  const results = bizList.map(b => {
    const ips = parseIPs(b.ipRange);
    const br = ips.map(ip => state.results[ip]||{ip, bizId:b._id, status:'pending', ping:null, lastCheck:null});
    const on=br.filter(r=>r.status==='online'||r.status==='warn').length;
    const off=br.filter(r=>r.status==='offline').length;
    const pings=br.filter(r=>r.ping!==null).map(r=>r.ping);
    const avg=pings.length?Math.round(pings.reduce((a,b)=>a+b,0)/pings.length):0;
    return {biz:b, results:br, on, off, avg, total:ips.length};
  });
  res.json({results, lastScan:new Date().toISOString()});
});
app.post('/api/scan', auth, (req, res) => { runScan(req.user.id); res.json({ok:true}); });
app.post('/api/auto-scan', auth, (req, res) => { setAutoScan(req.user.id, req.body.intervalMs||0); res.json({ok:true, intervalMs:req.body.intervalMs||0}); });
app.get('/api/auto-scan', auth, (req, res) => { const s=scanState[req.user.id]||{intervalMs:0}; res.json({intervalMs:s.intervalMs, running:s.intervalMs>0}); });

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

// ── 관리자 API ─────────────────────────────────────
app.get('/api/admin/stats', auth, adminAuth, async (req, res) => {
  const totalUsers=await User.countDocuments();
  const activeUsers=await User.countDocuments({isActive:true});
  const totalBiz=await Biz.countDocuments();
  const scanning=Object.values(scanState).filter(s=>s.intervalMs>0).length;
  res.json({totalUsers, activeUsers, totalBiz, scanning});
});

app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  const users = await User.find().select('-password').sort({createdAt:-1});
  const result = await Promise.all(users.map(async u => {
    const bizCount = await Biz.countDocuments({userId:u._id});
    const state = scanState[String(u._id)]||{intervalMs:0};
    return {...u.toObject(), bizCount, autoScan:state.intervalMs>0, intervalMs:state.intervalMs};
  }));
  res.json(result);
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
  await User.deleteOne({_id:user._id});
  res.json({ok:true});
});

app.put('/api/admin/users/:id/password', auth, adminAuth, async (req, res) => {
  const {newPassword} = req.body;
  if (!newPassword||newPassword.length<4) return res.status(400).json({error:'비밀번호는 4자 이상이어야 합니다'});
  await User.findByIdAndUpdate(req.params.id, {password:await bcrypt.hash(newPassword,10)});
  res.json({ok:true});
});

// 관리자 계정 초기 생성
app.post('/api/admin/init', async (req, res) => {
  const exists = await User.findOne({role:'admin'});
  if (exists) return res.status(400).json({error:'관리자가 이미 존재합니다'});
  const {username='admin', password='admin1234', name='관리자'} = req.body;
  const admin = await User.create({username, password:await bcrypt.hash(password,10), name, role:'admin'});
  res.json({ok:true, message:'관리자 계정이 생성되었습니다', username:admin.username});
});

// IP 위치 조회 (서버에서 ip-api.com 호출)
app.get('/api/geoip/:ip', auth, async (req, res) => {
  try {
    const ip = req.params.ip;
    const http = require('http');
    const url = `http://ip-api.com/json/${ip}?lang=ko&fields=status,city,regionName,country,lat,lon,isp`;
    const data = await new Promise((resolve, reject) => {
      http.get(url, (r) => {
        let body = '';
        r.on('data', (chunk) => body += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch(e) { reject(e); }
        });
      }).on('error', reject);
    });
    res.json(data);
  } catch(e) {
    res.status(500).json({error: e.message});
  }
});

app.get('/api/health', (req, res) => res.json({ok:true, db:mongoose.connection.readyState===1?'connected':'disconnected'}));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => console.log(`서버 실행: http://localhost:${PORT}`));
