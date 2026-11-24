const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(path.join(DATA_DIR, 'app.sqlite'));
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve({ id: this.lastID, changes: this.changes }); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const clean = value => String(value ?? '').trim();
const num = value => Math.max(0, Math.round(Number(value) || 0));
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Vui lòng đăng nhập.' });
const requireAdmin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ Admin được thực hiện thao tác này.' });

 db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '', password TEXT NOT NULL, role TEXT DEFAULT 'member', status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, customer TEXT NOT NULL, contact TEXT DEFAULT '', description TEXT DEFAULT '', red_flowers INTEGER DEFAULT 0, weekly_flowers INTEGER DEFAULT 0, pricing TEXT DEFAULT '', customer_price INTEGER DEFAULT 0, worker_pay INTEGER DEFAULT 0, status TEXT DEFAULT 'open', assigned_to INTEGER, created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, FOREIGN KEY(assigned_to) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, job_id INTEGER, user_id INTEGER, type TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
});

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'development-secret-change-before-deploy',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', wrap(async (req, res) => {
  const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), phone = clean(req.body.phone), password = String(req.body.password || '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Nhập tên, email hợp lệ và mật khẩu ít nhất 8 ký tự.' });
  try { await run('INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)', [name, email, phone, await bcrypt.hash(password, 12)]); }
  catch (err) { if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Email đã được đăng ký.' }); throw err; }
  res.json({ message: 'Đăng ký thành công. Tài khoản đang chờ Admin duyệt.' });
}));
app.post('/api/login', wrap(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE email = ?', [clean(req.body.email).toLowerCase()]);
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  if (user.status !== 'approved') return res.status(403).json({ error: user.status === 'locked' ? 'Tài khoản đã bị khóa.' : 'Tài khoản đang chờ duyệt hoặc chưa được chấp thuận.' });
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: req.session.user });
}));
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.get('/api/dashboard', requireAuth, wrap(async (req, res) => {
  const counts = await get(`SELECT COUNT(*) total, SUM(status='in_progress') running, SUM(status='done') done, SUM(status='open') open FROM jobs`);
  const finance = await get(`SELECT SUM(CASE WHEN type='customer_payment' THEN amount ELSE 0 END) revenue, SUM(CASE WHEN type='coordination_fee' THEN amount ELSE 0 END) fees FROM transactions`);
  res.json({ ...counts, ...finance });
}));
app.get('/api/jobs', requireAuth, wrap(async (req, res) => {
  res.json({ jobs: await all('SELECT j.*, u.name assigned_name FROM jobs j LEFT JOIN users u ON u.id=j.assigned_to ORDER BY j.id DESC') });
}));
app.post('/api/jobs', requireAuth, requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!clean(b.customer)) return res.status(400).json({ error: 'Nhập tên khách hàng.' });
  const code = clean(b.code) || `JOB-${Date.now()}`;
  await run(`INSERT INTO jobs(code,customer,contact,description,red_flowers,weekly_flowers,pricing,customer_price,worker_pay,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`, [code, clean(b.customer), clean(b.contact), clean(b.description), num(b.red_flowers), num(b.weekly_flowers), clean(b.pricing), num(b.customer_price), num(b.worker_pay), req.session.user.id]);
  res.json({ message: 'Đã tạo job.' });
}));
app.post('/api/jobs/:id/take', requireAuth, wrap(async (req, res) => {
  const job = await get('SELECT * FROM jobs WHERE id=?', [num(req.params.id)]);
  if (!job || job.status !== 'open') return res.status(409).json({ error: 'Job không còn trống.' });
  const result = await run("UPDATE jobs SET assigned_to=?,status='in_progress' WHERE id=? AND status='open'", [req.session.user.id, job.id]);
  if (!result.changes) return res.status(409).json({ error: 'Job vừa được người khác nhận.' });
  res.json({ message: 'Đã nhận job.' });
}));
app.post('/api/jobs/:id/complete', requireAuth, wrap(async (req, res) => {
  const job = await get('SELECT * FROM jobs WHERE id=?', [num(req.params.id)]);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy job.' });
  if (req.session.user.role !== 'admin' && job.assigned_to !== req.session.user.id) return res.status(403).json({ error: 'Bạn không có quyền.' });
  await run("UPDATE jobs SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='in_progress'", [job.id]);
  res.json({ message: 'Đã hoàn thành job.' });
}));
app.delete('/api/jobs/:id', requireAuth, requireAdmin, wrap(async (req, res) => { await run('DELETE FROM jobs WHERE id=?', [num(req.params.id)]); res.json({ ok: true }); }));
app.get('/api/members', requireAuth, requireAdmin, wrap(async (req, res) => {
  const users = await all(`SELECT u.id,u.name,u.email,u.phone,u.status,COUNT(j.id) jobs_taken,SUM(j.status='done') jobs_done FROM users u LEFT JOIN jobs j ON j.assigned_to=u.id WHERE u.role='member' GROUP BY u.id ORDER BY u.id DESC`);
  res.json({ users });
}));
app.patch('/api/members/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  if (!['approved', 'rejected', 'locked'].includes(req.body.status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  await run("UPDATE users SET status=? WHERE id=? AND role='member'", [req.body.status, num(req.params.id)]);
  res.json({ ok: true });
}));
app.get('/api/finance', requireAuth, requireAdmin, wrap(async (req, res) => { res.json({ transactions: await all('SELECT * FROM transactions ORDER BY id DESC LIMIT 300') }); }));
app.post('/api/finance', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { type, amount, job_id, user_id, note } = req.body;
  if (!['customer_payment', 'worker_payout', 'coordination_fee', 'debt'].includes(type) || num(amount) < 1) return res.status(400).json({ error: 'Kiểm tra loại giao dịch và số tiền.' });
  await run('INSERT INTO transactions(job_id,user_id,type,amount,note) VALUES(?,?,?,?,?)', [job_id ? num(job_id) : null, user_id ? num(user_id) : null, type, num(amount), clean(note)]);
  res.json({ ok: true });
}));
app.use('/api', (err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  const email = clean(process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  if (!await get('SELECT id FROM users WHERE email=?', [email])) {
    await run('INSERT INTO users(name,email,password,role,status) VALUES(?,?,?,?,?)', [process.env.ADMIN_NAME || 'Admin', email, await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12), 'admin', 'approved']);
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})().catch(err => { console.error(err); process.exit(1); });
