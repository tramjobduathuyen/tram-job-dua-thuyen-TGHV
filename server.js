const express=require("express"),session=require("express-session"),SQLiteStoreFactory=require("connect-sqlite3");
const sqlite3=require("sqlite3").verbose(),bcrypt=require("bcryptjs"),helmet=require("helmet"),rateLimit=require("express-rate-limit");
const multer=require("multer"),path=require("path"),fs=require("fs");
const app=express(),SQLiteStore=SQLiteStoreFactory(session),PORT=Number(process.env.PORT||3000);
const DATA=process.env.DATA_DIR||path.join(__dirname,"data"),PROOFS=path.join(DATA,"proofs");
fs.mkdirSync(PROOFS,{recursive:true});
const db=new sqlite3.Database(path.join(DATA,"tram-job.sqlite"));
db.serialize(()=>{
 db.run("PRAGMA foreign_keys=ON");
 db.run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT DEFAULT '',password_hash TEXT NOT NULL,role TEXT DEFAULT 'member',status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
 db.run(`CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT DEFAULT '',poster_id INTEGER NOT NULL,slots_total INTEGER NOT NULL,slots_filled INTEGER DEFAULT 0,red_flowers INTEGER DEFAULT 0,weekly_flowers INTEGER DEFAULT 0,pricing_type TEXT DEFAULT 'Hội roll + buff',price INTEGER DEFAULT 0,worker_pay INTEGER DEFAULT 0,status TEXT DEFAULT 'open',coordination_charged INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,FOREIGN KEY(poster_id) REFERENCES users(id))`);
 db.run(`CREATE TABLE IF NOT EXISTS job_takers(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL,user_id INTEGER NOT NULL,slots INTEGER NOT NULL,status TEXT DEFAULT 'accepted',created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(job_id,user_id),FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id))`);
 db.run(`CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER NOT NULL,user_id INTEGER NOT NULL,payer_side TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 1000,proof_path TEXT,status TEXT DEFAULT 'pending',admin_note TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,UNIQUE(job_id,user_id,payer_side),FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id))`);
 db.run(`CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id INTEGER,user_id INTEGER,type TEXT,amount INTEGER,note TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
});
const run=(s,p=[])=>new Promise((r,j)=>db.run(s,p,function(e){e?j(e):r({id:this.lastID,changes:this.changes})}));
const get=(s,p=[])=>new Promise((r,j)=>db.get(s,p,(e,x)=>e?j(e):r(x)));
const all=(s,p=[])=>new Promise((r,j)=>db.all(s,p,(e,x)=>e?j(e):r(x)));
const clean=x=>String(x??"").trim(),num=x=>Number.isFinite(+x)?Math.max(0,Math.floor(+x)):0;
const me=req=>req.session.user;
const auth=(q,s,n)=>me(q)?n():s.status(401).json({error:"Vui lòng đăng nhập."});
const admin=(q,s,n)=>me(q)?.role==="admin"?n():s.status(403).json({error:"Chỉ Admin được thực hiện thao tác này."});
const wrap=f=>(q,s,n)=>Promise.resolve(f(q,s,n)).catch(n);
async function init(){
 const email=clean(process.env.ADMIN_EMAIL||"admin@example.com").toLowerCase();
 if(!await get("SELECT id FROM users WHERE email=?",[email])){
  const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD||"ChangeMe123!",12);
  await run("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)",[process.env.ADMIN_NAME||"Admin",email,hash,"admin","approved"]);
  console.log("Admin ban dau:",email,"- hay doi mat khau truoc khi dua len mang.");
 }
}
app.disable("x-powered-by");app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"150kb"}));app.use(express.urlencoded({extended:false}));
app.use(session({store:new SQLiteStore({db:"sessions.sqlite",dir:DATA}),secret:process.env.SESSION_SECRET||"dev-secret-change-before-production-123456",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000}}));
app.use("/api",rateLimit({windowMs:15*60*1000,limit:250}));
const storage=multer.diskStorage({destination:(q,f,cb)=>cb(null,PROOFS),filename:(q,f,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(f.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:5*1024*1024},fileFilter:(q,f,cb)=>/^image\/(jpeg|png|webp)$/.test(f.mimetype)?cb(null,true):cb(new Error("Chỉ nhận ảnh JPG, PNG hoặc WEBP."))});
app.use("/proofs",auth,(q,s,n)=>{if(me(q).role!=="admin")return s.status(403).end();n()},express.static(PROOFS));
app.post("/api/register",wrap(async(q,s)=>{
 const {name,email,phone,password}=q.body,em=clean(email).toLowerCase();
 if(clean(name).length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)||String(password||"").length<8)return s.status(400).json({error:"Nhập tên, email hợp lệ và mật khẩu ít nhất 8 ký tự."});
 try{await run("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)",[clean(name),em,clean(phone),await bcrypt.hash(password,12)])}catch(e){if(String(e.message).includes("UNIQUE"))return s.status(409).json({error:"Email đã được đăng ký."});throw e}
 s.json({message:"Đăng ký thành công. Tài khoản đang chờ Admin duyệt."});
}));
app.post("/api/login",wrap(async(q,s)=>{
 const u=await get("SELECT * FROM users WHERE email=?",[clean(q.body.email).toLowerCase()]);
 if(!u||!await bcrypt.compare(String(q.body.password||""),u.password_hash))return s.status(401).json({error:"Email hoặc mật khẩu không đúng."});
 if(u.status!=="approved")return s.status(403).json({error:u.status==="pending"?"Tài khoản đang chờ Admin duyệt.":u.status==="locked"?"Tài khoản đã bị khóa.":"Tài khoản không được chấp thuận."});
 q.session.user={id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role};s.json({user:q.session.user});
}));
app.post("/api/logout",(q,s)=>q.session.destroy(()=>s.json({ok:true})));
app.get("/api/me",(q,s)=>s.json({user:me(q)||null}));
app.get("/api/dashboard",auth,wrap(async(q,s)=>{
 const stats=await get(`SELECT COUNT(*) total,SUM(status='open') open,SUM(status='in_progress') running,SUM(status='done') done FROM jobs`);
 const fees=await get("SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE type='coordination_fee'");
 const payments=await get("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE status='approved'");
 s.json({...stats,fees:fees.total,payments:payments.total});
}));
app.get("/api/jobs",auth,wrap(async(q,s)=>{
 const jobs=await all(`SELECT j.*,p.name poster_name,p.phone poster_phone,
 (SELECT COUNT(*) FROM payments x WHERE x.job_id=j.id AND x.user_id=j.poster_id AND x.payer_side='poster' AND x.status='approved') poster_paid,
 (SELECT COUNT(*) FROM job_takers t WHERE t.job_id=j.id AND t.user_id=?) is_taker
 FROM jobs j JOIN users p ON p.id=j.poster_id ORDER BY j.id DESC`,[me(q).id]);
 const result=[];
 for(const j of jobs){
  const takers=await all(`SELECT t.user_id,t.slots,u.name,u.phone,
    (SELECT COUNT(*) FROM payments x WHERE x.job_id=t.job_id AND x.user_id=t.user_id AND x.payer_side='worker' AND x.status='approved') worker_paid
    FROM job_takers t JOIN users u ON u.id=t.user_id WHERE t.job_id=?`,[j.id]);
  const myTake=takers.find(t=>t.user_id===me(q).id);
  const myPoster=j.poster_id===me(q).id;
  const myWorkerPaid=!!myTake&&!!myTake.worker_paid;
  const myPosterPaid=!!j.poster_paid;
  const contactsUnlocked=me(q).role==="admin"||(myPoster&&myPosterPaid&&takers.every(t=>!!t.worker_paid))||(!myPoster&&myWorkerPaid&&myPosterPaid);
  result.push({...j,poster_name:contactsUnlocked||me(q).role==="admin"?j.poster_name:"Thông tin được khóa",poster_phone:contactsUnlocked||me(q).role==="admin"?j.poster_phone:"",takers:takers.map(t=>({...t,name:contactsUnlocked||me(q).role==="admin"?t.name:"Thành viên",phone:contactsUnlocked||me(q).role==="admin"?t.phone:""})),contactsUnlocked,myTake:!!myTake,myWorkerPaid});
 }
 s.json({jobs:result});
}));
app.post("/api/jobs",auth,wrap(async(q,s)=>{
 const b=q.body,slots=num(b.slots_total),title=clean(b.title);
 if(!title||slots<1)return s.status(400).json({error:"Nhập tên job và tổng Slot lớn hơn 0."});
 const code=clean(b.code)||"TGHV-"+Date.now().toString().slice(-7);
 const r=await run(`INSERT INTO jobs(code,title,description,poster_id,slots_total,red_flowers,weekly_flowers,pricing_type,price,worker_pay) VALUES(?,?,?,?,?,?,?,?,?,?)`,
 [code,title,clean(b.description),me(q).id,slots,num(b.red_flowers),num(b.weekly_flowers),clean(b.pricing_type)||"Hội roll + buff",num(b.price),num(b.worker_pay)]);
 s.json({id:r.id,message:"Đã đăng job."});
}));
app.post("/api/jobs/:id/take",auth,wrap(async(q,s)=>{
 const id=num(q.params.id),slots=Math.max(1,num(q.body.slots)||1),job=await get("SELECT * FROM jobs WHERE id=?",[id]);
 if(!job||job.status!=="open"&&job.status!=="in_progress")return s.status(409).json({error:"Job không còn nhận Slot."});
 if(job.poster_id===me(q).id)return s.status(400).json({error:"Bạn không thể nhận job do chính mình đăng."});
 if(job.slots_filled+slots>job.slots_total)return s.status(400).json({error:"Số Slot còn lại không đủ."});
 try{await run("INSERT INTO job_takers(job_id,user_id,slots) VALUES(?,?,?)",[id,me(q).id,slots])}catch(e){if(String(e.message).includes("UNIQUE"))return s.status(409).json({error:"Bạn đã nhận job này rồi."});throw e}
 const filled=job.slots_filled+slots,done=filled>=job.slots_total;
 await run("UPDATE jobs SET slots_filled=?,status=?,completed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=?",[filled,done?"done":"in_progress",done?1:0,id]);
 if(done&&!job.coordination_charged){await run("UPDATE jobs SET coordination_charged=1 WHERE id=?",[id]);await run("INSERT INTO transactions(job_id,user_id,type,amount,note) VALUES(?,?,?,?,?)",[id,job.poster_id,"coordination_fee",1000,"Phí điều phối 1.000đ/job"]); }
 s.json({message:done?"Đã đủ Slot. Job tự chuyển DONE.":"Đã nhận Slot."});
}));
app.post("/api/jobs/:id/payment-proof",auth,upload.single("proof"),wrap(async(q,s)=>{
 const id=num(q.params.id),side=clean(q.body.payer_side),job=await get("SELECT * FROM jobs WHERE id=?",[id]);
 if(!job)return s.status(404).json({error:"Không tìm thấy job."});
 if(!["poster","worker"].includes(side))return s.status(400).json({error:"Loại phí không hợp lệ."});
 const allowed=side==="poster"?job.poster_id===me(q).id:!!await get("SELECT id FROM job_takers WHERE job_id=? AND user_id=?",[id,me(q).id]);
 if(!allowed)return s.status(403).json({error:"Bạn không thuộc bên thanh toán này."});
 if(!q.file)return s.status(400).json({error:"Vui lòng tải ảnh minh chứng chuyển khoản."});
 const old=await get("SELECT id,status FROM payments WHERE job_id=? AND user_id=? AND payer_side=?",[id,me(q).id,side]);
 if(old&&old.status==="approved")return s.status(409).json({error:"Khoản phí này đã được xác nhận."});
 if(old)await run("UPDATE payments SET proof_path=?,status='pending',admin_note='',created_at=CURRENT_TIMESTAMP WHERE id=?",[q.file.filename,old.id]);
 else await run("INSERT INTO payments(job_id,user_id,payer_side,amount,proof_path) VALUES(?,?,?,?,?)",[id,me(q).id,side,1000,q.file.filename]);
 s.json({message:"Đã gửi minh chứng. Admin sẽ kiểm tra và xác nhận."});
}));
app.get("/api/payments",auth,wrap(async(q,s)=>{
 const rows=await all(`SELECT p.*,u.name,u.email,j.code FROM payments p JOIN users u ON u.id=p.user_id JOIN jobs j ON j.id=p.job_id ${me(q).role==="admin"?"":"WHERE p.user_id=?"} ORDER BY p.id DESC`,me(q).role==="admin"?[]:[me(q).id]);
 s.json({payments:rows});
}));
app.patch("/api/payments/:id",auth,admin,wrap(async(q,s)=>{
 const status=clean(q.body.status);if(!["approved","rejected"].includes(status))return s.status(400).json({error:"Trạng thái không hợp lệ."});
 const p=await get("SELECT * FROM payments WHERE id=?",[num(q.params.id)]);if(!p)return s.status(404).json({error:"Không tìm thấy giao dịch."});
 await run("UPDATE payments SET status=?,admin_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",[status,clean(q.body.admin_note),p.id]);
 s.json({message:status==="approved"?"Đã xác nhận thanh toán.":"Đã từ chối minh chứng."});
}));
app.get("/api/members",auth,admin,wrap(async(q,s)=>s.json({members:await all(`SELECT id,name,email,phone,status,created_at FROM users WHERE role='member' ORDER BY id DESC`)})));
app.patch("/api/members/:id",auth,admin,wrap(async(q,s)=>{
 const status=clean(q.body.status);if(!["approved","rejected","locked"].includes(status))return s.status(400).json({error:"Trạng thái không hợp lệ."});
 await run("UPDATE users SET status=? WHERE id=? AND role='member'",[status,num(q.params.id)]);s.json({message:"Đã cập nhật thành viên."});
}));
app.get("/api/transactions",auth,admin,wrap(async(q,s)=>s.json({rows:await all("SELECT t.*,j.code FROM transactions t LEFT JOIN jobs j ON j.id=t.job_id ORDER BY t.id DESC")})));
app.use("/api",(e,q,s,n)=>{console.error(e);s.status(400).json({error:e.message||"Có lỗi máy chủ."})});
app.get("/",(q,s)=>s.sendFile(path.join(__dirname,"index.html")));
app.get("/style.css",(q,s)=>s.sendFile(path.join(__dirname,"style.css")));
app.get("/app.js",(q,s)=>s.sendFile(path.join(__dirname,"app.js")));
app.get("*",(q,s)=>s.status(404).send("Không tìm thấy trang."));
init().then(()=>app.listen(PORT,()=>console.log("Tram Job TGHV running on "+PORT))).catch(e=>{console.error(e);process.exit(1)});
