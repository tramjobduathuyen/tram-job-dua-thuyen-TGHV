import React, { useEffect, useMemo, useState } from "react";
import {
  Anchor, BadgeCheck, Banknote, BriefcaseBusiness, Check, CheckCircle2,
  CircleHelp, Clock3, CreditCard, LogOut, Plus, RefreshCw, ShieldCheck,
  Users, Wallet, X
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabase";

const money = (n) => new Intl.NumberFormat("vi-VN").format(n || 0) + "đ";
const statusText = {
  pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối",
  OPEN: "Đang nhận", DONE: "Đã đủ slot", accepted: "Đã nhận",
  applied: "Đã ứng tuyển"
};

function Notice({ children, type = "info" }) {
  return <div className={`notice ${type}`}>{children}</div>;
}
function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}
function Pill({ children, kind = "" }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);
  const [payments, setPayments] = useState([]);
  const [contacts, setContacts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("jobs");
  const [authMode, setAuthMode] = useState("login");
  const [auth, setAuth] = useState({ email: "", password: "", name: "" });
  const [jobForm, setJobForm] = useState({ title: "", description: "", slots: 1 });
  const [contactForm, setContactForm] = useState({ phone: "", zalo: "" });
  const [paymentFiles, setPaymentFiles] = useState({});
  const [showJobForm, setShowJobForm] = useState(false);

  const isAdmin = profile?.role === "admin";
  const approved = profile?.status === "approved";

  useEffect(() => {
    if (!hasSupabaseConfig) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setProfile(null); setJobs([]); setApps([]); setPayments([]); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadAll();
  }, [session?.user?.id]);

  async function loadAll() {
    setLoading(true); setMessage("");
    try {
      const uid = session.user.id;
      const [p, j, a, pay] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("jobs").select("*").order("created_at", { ascending: false }),
        supabase.from("applications").select("*").order("created_at", { ascending: false }),
        supabase.from("payments").select("*").order("created_at", { ascending: false })
      ]);
      if (p.error) throw p.error;
      if (j.error) throw j.error;
      if (a.error) throw a.error;
      if (pay.error) throw pay.error;
      setProfile(p.data); setJobs(j.data || []); setApps(a.data || []); setPayments(pay.data || []);
      // Contacts are in a protected table; the database only returns them to matched parties after both fees are approved.
      const c = await supabase.from("job_contacts").select("*");
      if (!c.error) setContacts(Object.fromEntries((c.data || []).map(x => [x.job_id, x])));
    } catch (e) {
      setMessage(e.message || "Không tải được dữ liệu.");
    } finally { setLoading(false); }
  }

  async function signInOrUp(e) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: auth.email, password: auth.password,
          options: { data: { display_name: auth.name } }
        });
        if (error) throw error;
        if (data.session) setSession(data.session);
        setMessage("Đã gửi yêu cầu đăng ký. Tài khoản cần Admin duyệt trước khi sử dụng.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: auth.email, password: auth.password });
        if (error) throw error;
        setSession(data.session);
      }
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function signOut() { await supabase.auth.signOut(); setSession(null); }

  async function createJob(e) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.from("jobs").insert({
        posted_by: session.user.id, title: jobForm.title.trim(),
        description: jobForm.description.trim(), total_slots: Number(jobForm.slots), filled_slots: 0
      }).select().single();
      if (error) throw error;
      const { error: ce } = await supabase.from("job_contacts").insert({
        job_id: data.id, owner_id: session.user.id,
        phone: contactForm.phone.trim(), zalo: contactForm.zalo.trim()
      });
      if (ce) throw ce;
      setJobForm({ title: "", description: "", slots: 1 }); setContactForm({ phone: "", zalo: "" });
      setShowJobForm(false); setMessage("Đã đăng Job."); await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function applyJob(job) {
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.from("applications").insert({ job_id: job.id, applicant_id: session.user.id });
      if (error) throw error;
      setMessage("Đã gửi yêu cầu nhận Job. Chờ người đăng xác nhận.");
      await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function acceptApplication(application) {
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("accept_job_application", { p_application_id: application.id });
      if (error) throw error;
      setMessage("Đã xác nhận người nhận Job. Hai bên cần hoàn tất phí 1.000đ/người để mở liên hệ.");
      await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function submitPayment(jobId, feeSide) {
    const file = paymentFiles[`${jobId}-${feeSide}`];
    if (!file) { setMessage("Bạn cần chọn ảnh minh chứng chuyển khoản."); return; }
    setBusy(true); setMessage("");
    try {
      const path = `${session.user.id}/${jobId}/${feeSide}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("payments").insert({
        job_id: jobId, payer_id: session.user.id, fee_side: feeSide,
        amount: 1000, proof_path: path
      });
      if (error) throw error;
      setMessage("Đã gửi minh chứng. Admin sẽ kiểm tra và duyệt.");
      await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function reviewPayment(payment, status) {
    setBusy(true);
    try {
      const { error } = await supabase.from("payments").update({ status, reviewed_at: new Date().toISOString() }).eq("id", payment.id);
      if (error) throw error;
      setMessage(status === "approved" ? "Đã duyệt khoản phí." : "Đã từ chối khoản phí.");
      await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function reviewMember(userId, status) {
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
      if (error) throw error;
      setMessage("Đã cập nhật trạng thái thành viên."); await loadAll();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  async function proofUrl(path) {
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    return data?.signedUrl;
  }

  const myApplications = apps.filter(a => a.applicant_id === session?.user?.id);
  const myJobs = jobs.filter(j => j.posted_by === session?.user?.id);
  const pendingMembers = []; // Admin member list is queried separately below.
  const myPayments = payments.filter(p => p.payer_id === session?.user?.id);

  if (!hasSupabaseConfig) return <SetupScreen />;
  if (!session) return <AuthScreen auth={auth} setAuth={setAuth} mode={authMode} setMode={setAuthMode} onSubmit={signInOrUp} busy={busy} message={message} />;

  if (loading && !profile) return <main className="center"><div className="spinner"/>กำลังโหลด...</main>;
  if (!profile) return <main className="center"><Notice type="error">ไม่พบข้อมูลโปรไฟล์ กรุณารีเฟรช hoặc đăng nhập lại.</Notice></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><Anchor size={23}/></div><div><b>Trạm Job Đua Thuyền TGHV</b><small>Không gian kết nối Job cộng đồng</small></div></div>
        <div className="top-actions"><Pill kind={approved ? "green" : "orange"}>{statusText[profile.status] || profile.status}</Pill><button className="icon-btn" onClick={loadAll} title="Làm mới"><RefreshCw size={17}/></button><button className="icon-btn" onClick={signOut} title="Đăng xuất"><LogOut size={17}/></button></div>
      </header>

      <main className="container">
        {!approved && !isAdmin && <Notice type="warn"><b>Tài khoản đang chờ Admin duyệt.</b> Bạn chưa thể đăng hoặc nhận Job cho đến khi được duyệt.</Notice>}
        {message && <Notice>{message}</Notice>}
        <section className="welcome">
          <div><span className="eyebrow">TRẠM JOB TGHV</span><h1>Chào {profile.display_name || session.user.email}!</h1><p>Quản lý Job, Slot và thanh toán trong một nơi.</p></div>
          <div className="welcome-art"><Anchor size={58}/><span>★</span></div>
        </section>

        <section className="stats">
          <Stat icon={<BriefcaseBusiness/>} label="Tổng Job" value={jobs.length}/>
          <Stat icon={<Clock3/>} label="Đang nhận" value={jobs.filter(j => j.status === "OPEN").length}/>
          <Stat icon={<CheckCircle2/>} label="Đã đủ Slot" value={jobs.filter(j => j.status === "DONE").length}/>
          <Stat icon={<Wallet/>} label="Phí của tôi" value={money(myPayments.filter(p => p.status === "approved").reduce((s,p)=>s+p.amount,0))}/>
        </section>

        <nav className="tabs">
          <button className={tab==="jobs"?"active":""} onClick={()=>setTab("jobs")}><BriefcaseBusiness size={16}/> Bảng Job</button>
          <button className={tab==="mine"?"active":""} onClick={()=>setTab("mine")}><Users size={16}/> Job của tôi</button>
          {isAdmin && <button className={tab==="admin"?"active":""} onClick={()=>setTab("admin")}><ShieldCheck size={16}/> Quản trị</button>}
        </nav>

        {tab === "jobs" && <>
          <div className="section-head"><div><h2>Danh sách Job</h2><p>Các Job đang mở nhận Slot</p></div><button className="primary" disabled={!approved || busy} onClick={()=>setShowJobForm(!showJobForm)}><Plus size={17}/> Đăng Job</button></div>
          {showJobForm && <form className="panel form-grid" onSubmit={createJob}>
            <h3>Thông tin Job</h3>
            <Field label="Tên Job" required value={jobForm.title} onChange={e=>setJobForm({...jobForm,title:e.target.value})} placeholder="Ví dụ: Cần hỗ trợ đua hội..."/>
            <label className="field"><span>Mô tả</span><textarea required value={jobForm.description} onChange={e=>setJobForm({...jobForm,description:e.target.value})} rows="3"/></label>
            <Field label="Tổng số Slot" type="number" min="1" required value={jobForm.slots} onChange={e=>setJobForm({...jobForm,slots:e.target.value})}/>
            <h3>Thông tin liên hệ (chỉ mở sau khi hai bên đóng phí)</h3>
            <Field label="Số điện thoại" value={contactForm.phone} onChange={e=>setContactForm({...contactForm,phone:e.target.value})} placeholder="Số điện thoại"/>
            <Field label="Zalo (nếu có)" value={contactForm.zalo} onChange={e=>setContactForm({...contactForm,zalo:e.target.value})} placeholder="Tên hoặc số Zalo"/>
            <button className="primary" disabled={busy}>Đăng Job</button>
          </form>}
          <div className="job-grid">{jobs.map(job=><JobCard key={job.id} job={job} userId={session.user.id} applications={apps} onApply={applyJob} busy={busy} contacts={contacts} payments={payments} onPay={submitPayment} setFiles={setPaymentFiles} files={paymentFiles}/>)}</div>
          {jobs.length===0 && <Empty text="Chưa có Job nào. Hãy đăng Job đầu tiên!"/>}
        </>}

        {tab === "mine" && <div className="two-col">
          <section><h2>Job tôi đăng</h2>{myJobs.map(j=><div className="panel compact" key={j.id}><b>{j.title}</b><p>{j.filled_slots}/{j.total_slots} Slot · <Pill kind={j.status==="DONE"?"green":"blue"}>{statusText[j.status]}</Pill></p><PaymentArea job={j} side="poster" payments={payments} onPay={submitPayment} setFiles={setPaymentFiles} files={paymentFiles} userId={session.user.id}/>{apps.filter(a=>a.job_id===j.id).map(a=><ApplicationRow key={a.id} application={a} isOwner onAccept={acceptApplication} busy={busy}/>)}</div>)}{!myJobs.length&&<Empty text="Bạn chưa đăng Job nào."/>}</section>
          <section><h2>Job tôi nhận</h2>{myApplications.map(a=>{const j=jobs.find(x=>x.id===a.job_id);return j?<div className="panel compact" key={a.id}><b>{j.title}</b><p><Pill>{statusText[a.status]||a.status}</Pill></p><PaymentArea job={j} side="receiver" payments={payments} onPay={submitPayment} setFiles={setPaymentFiles} files={paymentFiles} userId={session.user.id}/></div>:null})}{!myApplications.length&&<Empty text="Bạn chưa nhận Job nào."/>}</section>
        </div>}

        {tab === "admin" && isAdmin && <AdminPanel payments={payments} onReview={reviewPayment} busy={busy} onRefresh={loadAll} reviewMember={reviewMember}/>}
        <footer>Trạm Job Đua Thuyền TGHV <span>•</span> Phí dịch vụ cố định {money(1000)} mỗi bên</footer>
      </main>
    </div>
  );
}

function Stat({icon,label,value}) { return <div className="stat"><div className="stat-icon">{icon}</div><div><small>{label}</small><b>{value}</b></div></div>; }

function JobCard({job,userId,applications,onApply,busy,contacts,payments,onPay,setFiles,files}) {
  const mine = job.posted_by === userId;
  const myApp = applications.find(a=>a.job_id===job.id && a.applicant_id===userId);
  const accepted = myApp?.status === "accepted";
  const contact = contacts[job.id];
  const acceptedCount = applications.filter(a=>a.job_id===job.id && a.status==="accepted").length;
  return <article className="job-card">
    <div className="job-card-top"><Pill kind={job.status==="DONE"?"green":"blue"}>{statusText[job.status]}</Pill><small>{new Date(job.created_at).toLocaleDateString("vi-VN")}</small></div>
    <h3>{job.title}</h3><p className="job-desc">{job.description}</p>
    <div className="slot-wrap"><div className="slot-label"><span>Slot đã nhận</span><b>{job.filled_slots}/{job.total_slots}</b></div><div className="progress"><i style={{width:`${Math.min(100,job.filled_slots/job.total_slots*100)}%`}}/></div></div>
    <div className="job-meta"><span><Users size={15}/> {acceptedCount} người nhận</span><span><Banknote size={15}/> 1.000đ/người</span></div>
    {mine ? <Pill>Job của bạn</Pill> : job.status==="OPEN" && !myApp ? <button className="primary full" disabled={busy} onClick={()=>onApply(job)}>Ứng tuyển nhận Job</button> : myApp ? <Pill kind={accepted?"green":"orange"}>{accepted?"Đã được xác nhận":"Đã gửi yêu cầu"}</Pill> : <Pill kind="gray">Đã đủ Slot</Pill>}
    {accepted && <PaymentArea job={job} side="receiver" payments={payments} onPay={onPay} setFiles={setFiles} files={files} userId={userId}/>}
    {contact && (mine || accepted) && <div className="contact-box"><b><BadgeCheck size={15}/> Đã mở liên hệ</b><span>Điện thoại: {contact.phone || "Chưa cung cấp"}</span><span>Zalo: {contact.zalo || "Chưa cung cấp"}</span></div>}
    {mine && applications.filter(a=>a.job_id===job.id && a.status==="applied").map(a=><ApplicationRow key={a.id} application={a} isOwner onAccept={()=>{}} busy={busy}/>)}
  </article>;
}

function PaymentArea({job,side,payments,onPay,setFiles,files,userId}) {
  const p = payments.find(x=>x.job_id===job.id && x.payer_id===userId && x.fee_side===side);
  if (p) return <div className="payment-state"><CreditCard size={16}/> Phí {money(1000)}: <Pill kind={p.status==="approved"?"green":p.status==="rejected"?"red":"orange"}>{statusText[p.status]}</Pill></div>;
  return <div className="pay-box"><b>Phí dịch vụ {money(1000)}</b><small>Chuyển khoản và tải ảnh minh chứng để Admin xác nhận.</small><input type="file" accept="image/*" onChange={e=>setFiles(v=>({...v,[`${job.id}-${side}`]:e.target.files?.[0]}))}/><button className="secondary full" onClick={()=>onPay(job.id,side)}>Gửi minh chứng thanh toán</button></div>;
}

function ApplicationRow({application,isOwner,onAccept,busy}) {
  return <div className="application-row"><span>Yêu cầu nhận Slot <Pill>{statusText[application.status]||application.status}</Pill></span>{isOwner && application.status==="applied" && <button className="small-btn" disabled={busy} onClick={()=>onAccept(application)}>Xác nhận</button>}</div>;
}

function AdminPanel({payments,onReview,busy,reviewMember}) {
  const [members,setMembers]=useState([]);
  const [proofs,setProofs]=useState({});
  const [err,setErr]=useState("");
  useEffect(()=>{(async()=>{const {data,error}=await supabase.from("profiles").select("*").order("created_at",{ascending:false});if(error)setErr(error.message);else setMembers(data||[]);})();},[]);
  async function showProof(p) {
    const {data,error}=await supabase.storage.from("payment-proofs").createSignedUrl(p.proof_path,300);
    if(error){setErr(error.message);return;} setProofs(v=>({...v,[p.id]:data.signedUrl}));
  }
  return <div className="admin-grid">
    <section className="panel"><h2><Users size={19}/> Duyệt thành viên</h2>{err&&<Notice type="error">{err}</Notice>}{members.map(m=><div className="admin-row" key={m.id}><div><b>{m.display_name||m.email||m.id.slice(0,8)}</b><small>{m.id}</small></div><Pill kind={m.status==="approved"?"green":"orange"}>{statusText[m.status]||m.status}</Pill>{m.status!=="approved"&&m.role!=="admin"&&<button className="small-btn" onClick={()=>reviewMember(m.id,"approved")} disabled={busy}>Duyệt</button>}</div>)}</section>
    <section className="panel"><h2><Wallet size={19}/> Duyệt thanh toán</h2>{payments.map(p=><div className="admin-row payment-row" key={p.id}><div><b>{money(p.amount)} · {p.fee_side==="poster"?"Người đăng":"Người nhận"}</b><small>Job: {p.job_id.slice(0,8)} · User: {p.payer_id.slice(0,8)}</small><button className="link-btn" onClick={()=>showProof(p)}>Xem minh chứng</button>{proofs[p.id]&&<a href={proofs[p.id]} target="_blank" rel="noreferrer">Mở ảnh</a>}</div><Pill kind={p.status==="approved"?"green":"orange"}>{statusText[p.status]}</Pill>{p.status==="pending"&&<div className="row-actions"><button className="small-btn" onClick={()=>onReview(p,"approved")} disabled={busy}>Duyệt</button><button className="small-btn danger" onClick={()=>onReview(p,"rejected")} disabled={busy}>Từ chối</button></div>}</div>)}</section>
  </div>;
}

function AuthScreen({auth,setAuth,mode,setMode,onSubmit,busy,message}) {
  return <div className="auth-page"><div className="auth-card"><div className="brand centered"><div className="brand-icon"><Anchor size={25}/></div></div><span className="eyebrow">TRẠM JOB TGHV</span><h1>{mode==="login"?"Chào mừng trở lại":"Tạo tài khoản thành viên"}</h1><p>Kết nối Job an toàn, minh bạch và rõ ràng.</p>{message&&<Notice>{message}</Notice>}<form onSubmit={onSubmit}>{mode==="signup"&&<Field label="Tên hiển thị" required value={auth.name} onChange={e=>setAuth({...auth,name:e.target.value})} placeholder="Tên của bạn"/>}<Field label="Email" type="email" required value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})} placeholder="you@example.com"/><Field label="Mật khẩu" type="password" minLength="6" required value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})} placeholder="Ít nhất 6 ký tự"/><button className="primary full" disabled={busy}>{busy?"Đang xử lý...":mode==="login"?"Đăng nhập":"Đăng ký"}</button></form><button className="text-btn" onClick={()=>setMode(mode==="login"?"signup":"login")}>{mode==="login"?"Chưa có tài khoản? Đăng ký":"Đã có tài khoản? Đăng nhập"}</button><small className="muted">Tài khoản mới cần Admin duyệt trước khi sử dụng.</small></div></div>;
}

function SetupScreen() {
  return <div className="auth-page"><div className="auth-card setup-card"><div className="brand centered"><div className="brand-icon"><Anchor size={25}/></div></div><span className="eyebrow">TRẠM JOB TGHV</span><h1>Website đã sẵn sàng cấu hình</h1><p>Để kết nối dữ liệu thật, cần thêm thông tin dự án Supabase.</p><ol><li>Mở file <b>.env.example</b>, đổi tên thành <b>.env</b>.</li><li>Điền Project URL và anon key lấy trong Supabase → Project Settings → API.</li><li>Chạy SQL trong thư mục <b>supabase/schema.sql</b>.</li><li>Cài dependency bằng <code>npm install</code>, sau đó chạy <code>npm run dev</code>.</li></ol><Notice type="warn">Không đưa service_role key lên trình duyệt hoặc chia sẻ công khai.</Notice></div></div>;
}

function Empty({text}) { return <div className="empty"><CircleHelp size={25}/>{text}</div>; }
