// API tests. Require a running MongoDB (default mongodb://127.0.0.1:27017); they use a separate database
// (student_analytics_test) that is wiped before each test, so your real data is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Student, Subject, User, Mark, Attendance } = require('../models');
const { createApp } = require('../app');
const an = require('../analytics');

const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/student_analytics_test';
let server, base, ids;

async function reset() {
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Student, Subject, Mark, Attendance].map((M) => M.syncIndexes()));
  const hash = bcrypt.hashSync('pw', 4);
  const [s1, s2] = await Subject.create([{ code: 'S1', name: 'Sub One', credits: 4 }, { code: 'S2', name: 'Sub Two', credits: 2 }]);
  const [alice, bob] = await Student.create([{ rollNo: 'A', name: 'Alice', department: 'CS', semester: 1 }, { rollNo: 'B', name: 'Bob', department: 'CS', semester: 1 }]);
  await User.create([{ username: 'admin', passwordHash: hash, role: 'admin' }, { username: 'A', passwordHash: hash, role: 'student', student: alice._id }, { username: 'B', passwordHash: hash, role: 'student', student: bob._id }]);
  const data = [[alice, s1, [18, 27, 45]], [alice, s2, [10, 15, 25]], [bob, s1, [8, 12, 20]], [bob, s2, [4, 6, 10]]];
  for (const [st, sub, v] of data) for (const [i, et] of ['Quiz', 'Midterm', 'Final'].entries())
    await Mark.create({ student: st._id, subject: sub._id, examType: et, marksObtained: v[i], maxMarks: an.EXAM_MAX[et] });
  for (const [st, sub, att] of [[alice, s1, 36], [alice, s2, 24], [bob, s1, 20], [bob, s2, 20]]) await Attendance.create({ student: st._id, subject: sub._id, totalClasses: 40, attended: att });
  ids = { alice: String(alice._id), bob: String(bob._id), s1: String(s1._id) };
}
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie(); if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    let json = null; try { json = await r.json(); } catch { /* no body */ }
    return { status: r.status, body: json };
  };
}
async function login(user) { const c = client(); await c('POST', '/api/login', { username: user, password: 'pw' }); return c; }

test.before(async () => {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 5000 });
  server = createApp().listen(0); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); server.close(); });
test.beforeEach(reset);

test('authentication is required', async () => assert.equal((await client()('GET', '/api/students')).status, 401));
test('wrong password is rejected', async () => assert.equal((await client()('POST', '/api/login', { username: 'admin', password: 'x' })).status, 401));
test('logout ends the session', async () => { const a = await login('admin'); await a('POST', '/api/logout'); assert.equal((await a('GET', '/api/me')).status, 401); });

test('student access control', async () => {
  const s = await login('A');
  assert.equal((await s('GET', `/api/students/${ids.alice}`)).status, 200);
  assert.equal((await s('GET', `/api/students/${ids.bob}`)).status, 403);
  assert.equal((await s('GET', '/api/students')).status, 403);
  assert.equal((await s('PUT', '/api/marks', {})).status, 403);
});

test('marks validation and upsert', async () => {
  const a = await login('admin');
  const put = (v, et = 'Quiz') => a('PUT', '/api/marks', { student_id: ids.alice, subject_id: ids.s1, exam_type: et, marks_obtained: v });
  assert.equal((await put(21)).status, 400);
  assert.equal((await put(20)).status, 200);
  assert.equal((await a('GET', `/api/students/${ids.alice}`)).body.subjects[0].obtained, 92); // 20+27+45
  assert.equal((await put(5, 'Exam')).status, 400);
  assert.equal((await a('PUT', '/api/marks', { student_id: 'bad', subject_id: ids.s1, exam_type: 'Quiz', marks_obtained: 5 })).status, 400);
  assert.equal(await Mark.countDocuments({ student: ids.alice, subject: ids.s1 }), 3); // upsert did not duplicate
});

test('attendance validation', async () => {
  const a = await login('admin');
  assert.equal((await a('PUT', '/api/attendance', { student_id: ids.alice, subject_id: ids.s1, total_classes: 10, attended: 11 })).status, 400);
  assert.equal((await a('PUT', '/api/attendance', { student_id: ids.alice, subject_id: ids.s1, total_classes: 10, attended: 9 })).status, 200);
});

test('add, duplicate, invalid, delete (with cascade)', async () => {
  const a = await login('admin');
  const body = { roll_no: 'C', name: 'Cara', department: 'CS', semester: 2 };
  const created = await a('POST', '/api/students', body);
  assert.equal(created.status, 201);
  assert.equal((await a('POST', '/api/students', body)).status, 409);
  assert.equal((await a('POST', '/api/students', { ...body, roll_no: 'D', semester: 99 })).status, 400);
  assert.equal((await a('DELETE', `/api/students/${ids.bob}`)).status, 200);
  assert.equal((await a('DELETE', `/api/students/${ids.bob}`)).status, 404);
  assert.equal(await Mark.countDocuments({ student: ids.bob }) + await Attendance.countDocuments({ student: ids.bob }) + await User.countDocuments({ student: ids.bob }), 0);
});

test('analytics endpoints', async () => {
  const a = await login('admin');
  for (const u of ['summary', 'subjects', 'distribution', 'correlation', 'at-risk', 'toppers']) assert.equal((await a('GET', `/api/analytics/${u}`)).status, 200, u);
  assert.equal((await a('GET', '/api/analytics/at-risk')).body[0].roll_no, 'B');
  assert.equal((await a('GET', '/api/analytics/summary')).body.mean_pct, 50);
});
