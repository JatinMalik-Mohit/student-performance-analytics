const $ = s => document.querySelector(s);
let ME = null, charts = [];
const api = async (url, opt = {}) => {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f = (v, d = 1) => v == null ? "-" : Number(v).toFixed(d);
const pill = (ok, t) => `<span class="pill ${ok ? "ok" : "bad"}">${t}</span>`;
const SKY = "#0ea5e9", SKY_L = "#bae6fd", SKY_D = "#0369a1";
function chart(id, cfg) { const c = new Chart($(id), { ...cfg, options: { maintainAspectRatio: false, ...cfg.options } }); charts.push(c); }
function resetCharts() { charts.forEach(c => c.destroy()); charts = []; }

async function boot() {
  try { ME = await api("/api/me"); start(); } catch { $("#login").hidden = false; }
}
$("#lbtn").onclick = async () => {
  try { ME = await api("/api/login", { method: "POST", body: { username: $("#lu").value, password: $("#lp").value } }); start(); }
  catch (e) { $("#lerr").textContent = e.message; }
};
$("#lp").onkeydown = e => { if (e.key === "Enter") $("#lbtn").click(); };
$("#out").onclick = async () => { await api("/api/logout", { method: "POST" }); location.reload(); };

const TABS = { dashboard: "Dashboard", students: "Students", analytics: "Analytics", atrisk: "At-Risk", entry: "Data Entry" };
function start() {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#who").textContent = `${ME.username} (${ME.role})`;
  if (ME.role === "student") { $("#nav").innerHTML = ""; return showStudent(ME.student_id); }
  $("#nav").innerHTML = Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join("");
  $("#nav").onclick = e => e.target.dataset.t && go(e.target.dataset.t);
  go("dashboard");
}
function go(t) {
  resetCharts();
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  ({ dashboard, students: studentsView, analytics, atrisk, entry })[t]();
}

async function dashboard() {
  const [s, top, subs] = await Promise.all([api("/api/analytics/summary"), api("/api/analytics/toppers?n=5"), api("/api/analytics/subjects")]);
  $("#view").innerHTML = `<h2>Dashboard</h2><div class="grid g4">
    ${[["Students", s.students], ["Class mean %", f(s.mean_pct)], ["Average CGPA", f(s.avg_cgpa, 2)], ["Avg attendance %", f(s.avg_attendance)],
       ["Median %", f(s.median_pct)], ["Std. deviation", f(s.std_pct)], ["Pass rate %", f(s.pass_rate)], ["At-risk students", s.at_risk]]
      .map(([l, v]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("")}</div>
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Subject-wise mean %</h3><div class="chart"><canvas id="c1"></canvas></div></div>
    <div class="card"><h3>Top 5 students</h3><table><tr><th>Rank</th><th>Roll No</th><th>Name</th><th>%</th><th>CGPA</th></tr>
    ${top.map(t => `<tr><td>${t.rank}</td><td>${esc(t.roll_no)}</td><td>${esc(t.name)}</td><td>${f(t.overall_pct)}</td><td>${f(t.cgpa, 2)}</td></tr>`).join("")}</table></div></div>`;
  chart("#c1", { type: "bar", data: { labels: subs.map(x => x.code), datasets: [{ label: "Mean %", data: subs.map(x => x.mean_pct), backgroundColor: SKY }] }, options: { scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } } });
}

async function studentsView(q = "") {
  const list = await api("/api/students?q=" + encodeURIComponent(q));
  $("#view").innerHTML = `<h2>Students</h2><div class="bar"><input id="q" placeholder="Search name or roll no" value="${esc(q)}"><span class="sp"></span>
    <input id="nr" placeholder="Roll no" style="max-width:110px"><input id="nn" placeholder="Full name" style="max-width:160px"><input id="nd" placeholder="Department" value="Computer Science" style="max-width:150px"><input id="ns" placeholder="Sem" value="3" style="max-width:60px">
    <button class="btn" style="margin:0" id="add">Add student</button></div><div id="m" class="msg"></div>
    <div class="card"><table><tr><th>Rank</th><th>Roll No</th><th>Name</th><th>Sem</th><th>Overall %</th><th>CGPA</th><th>Attendance %</th><th>Status</th><th></th></tr>
    ${list.map(s => `<tr class="click" data-id="${s.id}"><td>${s.rank ?? "-"}</td><td>${esc(s.roll_no)}</td><td>${esc(s.name)}</td><td>${s.semester}</td><td>${f(s.overall_pct)}</td><td>${f(s.cgpa, 2)}</td><td>${f(s.att_pct)}</td>
    <td>${pill(!s.at_risk, s.at_risk ? "At risk" : "On track")}</td><td><button class="btn sm danger" data-del="${s.id}">Delete</button></td></tr>`).join("")}</table></div>`;
  $("#q").oninput = e => { clearTimeout(window.t); window.t = setTimeout(() => studentsView(e.target.value), 250); };
  $("#add").onclick = async () => {
    try { await api("/api/students", { method: "POST", body: { roll_no: $("#nr").value, name: $("#nn").value, department: $("#nd").value, semester: $("#ns").value } }); studentsView(); }
    catch (e) { $("#m").className = "msg e"; $("#m").textContent = e.message; }
  };
  $("#view").querySelector("table").onclick = async e => {
    const del = e.target.dataset.del;
    if (del) { if (confirm("Delete this student and all their records?")) { await api("/api/students/" + del, { method: "DELETE" }); studentsView(); } return; }
    const tr = e.target.closest("tr.click"); if (tr) showStudent(tr.dataset.id, true);
  };
}

async function showStudent(id, back) {
  resetCharts();
  const s = await api("/api/students/" + id);
  $("#view").innerHTML = `${back ? '<button class="btn ghost" id="bk">&larr; Back</button>' : ""}<h2 style="margin-top:12px">${esc(s.name)} <span class="muted">${esc(s.roll_no)} &middot; ${esc(s.department)} &middot; Sem ${s.semester}</span></h2>
    <div class="grid g4">${[["Overall %", f(s.overall_pct)], ["CGPA", f(s.cgpa, 2)], ["Attendance %", f(s.att_pct)], ["Class rank", s.rank ?? "-"]].map(([l, v]) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("")}</div>
    <p>${pill(!s.at_risk, s.at_risk ? "At risk: " + esc(s.risk_reasons.join("; ")) : "On track")}</p>
    <div class="grid g2"><div class="card"><h3>Subject-wise performance</h3><table><tr><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th><th>Attendance</th></tr>
    ${s.subjects.map(x => `<tr><td>${esc(x.code)} ${esc(x.subject)}</td><td>${x.obtained ?? "-"}/${x.max ?? "-"}</td><td>${f(x.pct)}</td><td>${x.grade ?? "-"}</td><td>${x.attended ?? "-"}/${x.total_classes ?? "-"} (${f(x.att_pct, 0)}%)</td></tr>`).join("")}</table></div>
    <div class="card"><h3>Performance by exam: student vs class</h3><div class="chart"><canvas id="c1"></canvas></div></div></div>`;
  if (back) $("#bk").onclick = () => go("students");
  chart("#c1", { type: "line", data: { labels: s.trend.map(t => t.exam), datasets: [{ label: "Student %", data: s.trend.map(t => t.student), borderColor: SKY, backgroundColor: SKY, tension: .25 }, { label: "Class %", data: s.trend.map(t => t.class), borderColor: SKY_D, borderDash: [6, 4], backgroundColor: SKY_D, tension: .25 }] }, options: { scales: { y: { beginAtZero: true, max: 100 } } } });
}

async function analytics() {
  const [subs, dist, cor] = await Promise.all([api("/api/analytics/subjects"), api("/api/analytics/distribution"), api("/api/analytics/correlation")]);
  $("#view").innerHTML = `<h2>Analytics</h2><div class="grid g2"><div class="card"><h3>Grade distribution (all subject results)</h3><div class="chart"><canvas id="c1"></canvas></div></div>
    <div class="card"><h3>Attendance vs overall % &nbsp;<span class="pill ok">Pearson r = ${cor.r ?? "n/a"}</span></h3><div class="chart"><canvas id="c2"></canvas></div></div></div>
    <div class="card" style="margin-top:16px"><h3>Subject statistics</h3><table><tr><th>Code</th><th>Subject</th><th>Mean %</th><th>Highest %</th><th>Lowest %</th><th>Pass rate %</th></tr>
    ${subs.map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.subject)}</td><td>${f(x.mean_pct)}</td><td>${f(x.max_pct)}</td><td>${f(x.min_pct)}</td><td>${f(x.pass_rate)}</td></tr>`).join("")}</table></div>`;
  chart("#c1", { type: "bar", data: { labels: dist.map(d => d.grade), datasets: [{ label: "Results", data: dist.map(d => d.count), backgroundColor: SKY }] }, options: { plugins: { legend: { display: false } } } });
  chart("#c2", { type: "scatter", data: { datasets: [{ label: "Students", data: cor.points.map(p => ({ x: p.attendance, y: p.pct })), backgroundColor: SKY }] },
    options: { scales: { x: { title: { display: true, text: "Attendance %" } }, y: { title: { display: true, text: "Overall %" } } }, plugins: { legend: { display: false } } } });
}

async function atrisk() {
  const r = await api("/api/analytics/at-risk");
  $("#view").innerHTML = `<h2>At-Risk Students <span class="muted">(${r.length})</span></h2><p class="muted">Flagged when overall % &lt; 50, attendance &lt; 75%, or any subject below the 40% pass mark.</p>
    <div class="card"><table><tr><th>Roll No</th><th>Name</th><th>Overall %</th><th>Attendance %</th><th>CGPA</th><th>Reasons</th></tr>
    ${r.map(s => `<tr class="click" data-id="${s.id}"><td>${esc(s.roll_no)}</td><td>${esc(s.name)}</td><td>${f(s.overall_pct)}</td><td>${f(s.att_pct)}</td><td>${f(s.cgpa, 2)}</td><td>${esc(s.risk_reasons.join("; "))}</td></tr>`).join("")}</table></div>`;
  $("#view").querySelector("table").onclick = e => { const tr = e.target.closest("tr.click"); if (tr) showStudent(tr.dataset.id, true); };
}

async function entry() {
  const [st, subs] = await Promise.all([api("/api/students"), api("/api/subjects")]);
  const so = st.map(s => `<option value="${s.id}">${esc(s.roll_no)} - ${esc(s.name)}</option>`).join("");
  const bo = subs.map(s => `<option value="${s.id}">${esc(s.code)} ${esc(s.name)}</option>`).join("");
  $("#view").innerHTML = `<h2>Data Entry</h2><div class="card"><h3>Enter / update marks</h3><div class="form">
    <div><label>Student</label><select id="ms">${so}</select></div><div><label>Subject</label><select id="mj">${bo}</select></div>
    <div><label>Exam (max: Quiz 20, Midterm 30, Final 50)</label><select id="me"><option>Quiz</option><option>Midterm</option><option>Final</option></select></div>
    <div><label>Marks obtained</label><input id="mv" type="number" step="0.5" min="0"></div><div><button class="btn" id="mb" style="margin:0">Save marks</button></div></div><div id="mm" class="msg"></div></div>
    <div class="card" style="margin-top:16px"><h3>Enter / update attendance</h3><div class="form">
    <div><label>Student</label><select id="as">${so}</select></div><div><label>Subject</label><select id="aj">${bo}</select></div>
    <div><label>Total classes</label><input id="at" type="number" min="0" value="40"></div><div><label>Attended</label><input id="aa" type="number" min="0"></div>
    <div><button class="btn" id="ab" style="margin:0">Save attendance</button></div></div><div id="am" class="msg"></div></div>`;
  const send = async (url, body, out) => { try { await api(url, { method: "PUT", body }); out.className = "msg s"; out.textContent = "Saved."; } catch (e) { out.className = "msg e"; out.textContent = e.message; } };
  $("#mb").onclick = () => send("/api/marks", { student_id: $("#ms").value, subject_id: $("#mj").value, exam_type: $("#me").value, marks_obtained: $("#mv").value }, $("#mm"));
  $("#ab").onclick = () => send("/api/attendance", { student_id: $("#as").value, subject_id: $("#aj").value, total_classes: $("#at").value, attended: $("#aa").value }, $("#am"));
}
boot();
