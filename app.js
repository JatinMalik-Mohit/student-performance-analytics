const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { Student, Subject, User, Mark, Attendance } = require('./models');
const an = require('./analytics');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: process.env.SESSION_SECRET || 'change-me-in-production', resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' } }));
  app.use(express.static(path.join(__dirname, 'public')));

  const loadAll = async () => {
    const [students, subjects, marks, attendance] = await Promise.all([Student.find().sort({ _id: 1 }).lean(),
      Subject.find().sort({ _id: 1 }).lean(), Mark.find().lean(), Attendance.find().lean()]);
    return { students, subjects, marks, attendance, built: an.build({ students, subjects, marks, attendance }) };
  };
  const auth = (admin = false) => (req, res, next) => {
    if (!req.session.uid) return fail(res, 401, 'Login required');
    if (admin && req.session.role !== 'admin') return fail(res, 403, 'Admin access required');
    next();
  };

  // ---------- authentication ----------
  app.post('/api/login', ah(async (req, res) => {
    const { username = '', password = '' } = req.body || {};
    const u = await User.findOne({ username: String(username).trim() });
    if (!u || !(await bcrypt.compare(String(password), u.passwordHash))) return fail(res, 401, 'Invalid username or password');
    await new Promise((ok, no) => req.session.regenerate((e) => (e ? no(e) : ok())));
    Object.assign(req.session, { uid: String(u._id), role: u.role, student_id: u.student ? String(u.student) : null, username: u.username });
    res.json({ username: u.username, role: u.role, student_id: req.session.student_id });
  }));
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', (req, res) => req.session.uid
    ? res.json({ username: req.session.username, role: req.session.role, student_id: req.session.student_id })
    : fail(res, 401, 'Not logged in'));

  // ---------- students ----------
  app.get('/api/subjects', auth(), ah(async (req, res) => {
    const subs = await Subject.find().sort({ _id: 1 }).lean();
    res.json(subs.map((s) => ({ id: String(s._id), code: s.code, name: s.name, credits: s.credits })));
  }));

  app.get('/api/students', auth(true), ah(async (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const list = (await loadAll()).built.filter((s) => s.name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q))
      .map(({ subjects, ...rest }) => rest).sort((a, b) => (a.rank || 999) - (b.rank || 999));
    res.json(list);
  }));

  app.post('/api/students', auth(true), ah(async (req, res) => {
    const d = req.body || {};
    const [roll, name, dept] = ['roll_no', 'name', 'department'].map((k) => String(d[k] ?? '').trim());
    const sem = Number(d.semester);
    if (!Number.isInteger(sem)) return fail(res, 400, 'Semester must be a number');
    if (!roll || !name || !dept || sem < 1 || sem > 12) return fail(res, 400, 'Roll no, name, department and semester (1-12) are required');
    let st;
    try {
      st = await Student.create({ rollNo: roll, name, department: dept, semester: sem });
      await User.create({ username: roll, passwordHash: await bcrypt.hash('student123', 10), role: 'student', student: st._id });
    } catch (e) {
      if (st) await Student.deleteOne({ _id: st._id });
      if (e.code === 11000) return fail(res, 409, 'Roll number already exists');
      throw e;
    }
    res.status(201).json({ id: String(st._id) });
  }));

  app.delete('/api/students/:id', auth(true), ah(async (req, res) => {
    if (!validId(req.params.id)) return fail(res, 404, 'Student not found');
    const r = await Student.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return fail(res, 404, 'Student not found');
    await Promise.all([Mark.deleteMany({ student: req.params.id }), Attendance.deleteMany({ student: req.params.id }), User.deleteMany({ student: req.params.id })]);
    res.json({ ok: true });
  }));

  app.get('/api/students/:id', auth(), ah(async (req, res) => {
    const id = req.params.id;
    if (req.session.role !== 'admin' && req.session.student_id !== id) return fail(res, 403, 'Forbidden');
    const all = await loadAll();
    const s = all.built.find((x) => x.id === id);
    if (!s) return fail(res, 404, 'Student not found');
    const code = new Map(all.subjects.map((x) => [String(x._id), x.code]));
    s.marks = all.marks.filter((m) => String(m.student) === id).map((m) => ({ code: code.get(String(m.subject)), exam_type: m.examType, marks_obtained: m.marksObtained, max_marks: m.maxMarks }));
    s.trend = ['Quiz', 'Midterm', 'Final'].map((et) => {
      const ms = all.marks.filter((m) => m.examType === et), mine = ms.filter((m) => String(m.student) === id);
      const pct = (a) => (a.length ? an.r2((a.reduce((t, m) => t + m.marksObtained, 0) / a.reduce((t, m) => t + m.maxMarks, 0)) * 100) : null);
      return { exam: et, student: pct(mine), class: pct(ms) };
    });
    s.class_avg_pct = an.classSummary(all.built).mean_pct;
    res.json(s);
  }));

  // ---------- data entry ----------
  app.put('/api/marks', auth(true), ah(async (req, res) => {
    const d = req.body || {};
    if (!an.EXAM_MAX[d.exam_type]) return fail(res, 400, 'exam_type must be Quiz, Midterm or Final');
    const val = Number(d.marks_obtained);
    if (!validId(d.student_id) || !validId(d.subject_id) || d.marks_obtained === '' || d.marks_obtained == null || !Number.isFinite(val))
      return fail(res, 400, 'student_id, subject_id and numeric marks_obtained are required');
    const mx = an.EXAM_MAX[d.exam_type];
    if (val < 0 || val > mx) return fail(res, 400, `Marks must be between 0 and ${mx} for ${d.exam_type}`);
    if (!(await Student.exists({ _id: d.student_id })) || !(await Subject.exists({ _id: d.subject_id }))) return fail(res, 404, 'Unknown student or subject');
    await Mark.findOneAndUpdate({ student: d.student_id, subject: d.subject_id, examType: d.exam_type },
      { $set: { marksObtained: val, maxMarks: mx } }, { upsert: true, runValidators: true });
    res.json({ ok: true });
  }));

  app.put('/api/attendance', auth(true), ah(async (req, res) => {
    const d = req.body || {};
    const tot = Number(d.total_classes), att = Number(d.attended);
    if (!validId(d.student_id) || !validId(d.subject_id) || !Number.isInteger(tot) || !Number.isInteger(att) || d.attended === '' || d.total_classes === '')
      return fail(res, 400, 'student_id, subject_id, total_classes and attended are required integers');
    if (tot < 0 || att < 0 || att > tot) return fail(res, 400, 'attended must be between 0 and total_classes');
    if (!(await Student.exists({ _id: d.student_id })) || !(await Subject.exists({ _id: d.subject_id }))) return fail(res, 404, 'Unknown student or subject');
    await Attendance.findOneAndUpdate({ student: d.student_id, subject: d.subject_id }, { $set: { totalClasses: tot, attended: att } }, { upsert: true });
    res.json({ ok: true });
  }));

  // ---------- analytics ----------
  app.get('/api/analytics/summary', auth(true), ah(async (req, res) => res.json(an.classSummary((await loadAll()).built))));

  app.get('/api/analytics/subjects', auth(true), ah(async (req, res) => {
    const agg = new Map();
    for (const s of (await loadAll()).built) for (const x of s.subjects) if (x.pct !== null) {
      if (!agg.has(x.code)) agg.set(x.code, { subject: x.subject, v: [] }); agg.get(x.code).v.push(x.pct);
    }
    res.json([...agg].map(([code, { subject, v }]) => ({ code, subject, mean_pct: an.r2(an.mean(v)), max_pct: Math.max(...v), min_pct: Math.min(...v),
      pass_rate: an.r2((v.filter((p) => p >= an.PASS_PCT).length / v.length) * 100) })));
  }));

  app.get('/api/analytics/distribution', auth(true), ah(async (req, res) => {
    const counts = Object.fromEntries(an.GRADES.map((g) => [g[1], 0]));
    for (const s of (await loadAll()).built) for (const x of s.subjects) if (x.grade) counts[x.grade]++;
    res.json(Object.entries(counts).map(([grade, count]) => ({ grade, count })));
  }));

  app.get('/api/analytics/correlation', auth(true), ah(async (req, res) => {
    const pts = (await loadAll()).built.filter((s) => s.att_pct !== null && s.overall_pct !== null)
      .map((s) => ({ roll_no: s.roll_no, attendance: s.att_pct, pct: s.overall_pct }));
    res.json({ r: an.pearson(pts.map((p) => p.attendance), pts.map((p) => p.pct)), points: pts });
  }));

  app.get('/api/analytics/at-risk', auth(true), ah(async (req, res) => {
    const out = (await loadAll()).built.filter((s) => s.at_risk).map((s) => ({ id: s.id, roll_no: s.roll_no, name: s.name,
      overall_pct: s.overall_pct, att_pct: s.att_pct, cgpa: s.cgpa, risk_reasons: s.risk_reasons }));
    res.json(out.sort((a, b) => (a.overall_pct || 0) - (b.overall_pct || 0)));
  }));

  app.get('/api/analytics/toppers', auth(true), ah(async (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.n, 10) || 5, 1), 50);
    res.json((await loadAll()).built.filter((s) => s.rank).sort((a, b) => a.rank - b.rank).slice(0, n)
      .map((s) => ({ rank: s.rank, roll_no: s.roll_no, name: s.name, overall_pct: s.overall_pct, cgpa: s.cgpa, att_pct: s.att_pct })));
  }));

  app.use('/api', (req, res) => fail(res, 404, 'Not found'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON');
    console.error(err);
    fail(res, 500, 'Server error');
  });
  return app;
}
module.exports = { createApp };
