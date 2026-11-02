// Fills MongoDB with SYNTHETIC demo data (fixed random seed, reproducible). Usage: npm run seed
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Student, Subject, User, Mark, Attendance } = require('./models');
const { EXAM_MAX } = require('./analytics');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_analytics';

const SUBJECTS = [['CS101', 'Programming in JavaScript', 4], ['CS102', 'Data Structures', 4], ['CS103', 'Database Systems', 3],
  ['CS104', 'Computer Networks', 3], ['MA101', 'Discrete Mathematics', 3], ['CS105', 'Web Technologies', 2]];
const FIRST = ['Aarav', 'Diya', 'Rohan', 'Isha', 'Kabir', 'Meera', 'Vivaan', 'Anaya', 'Arjun', 'Saanvi', 'Ishaan', 'Riya', 'Aditya', 'Kiara', 'Dev', 'Tanvi', 'Yash', 'Navya', 'Karan', 'Pooja'];
const LAST = ['Sharma', 'Verma', 'Singh', 'Gupta', 'Mehta', 'Kapoor', 'Joshi', 'Nair', 'Reddy', 'Malhotra'];

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(42);
const gauss = (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

async function main(n = 40) {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User, Student, Subject, Mark, Attendance].map((M) => M.deleteMany({})));
  await Promise.all([User, Student, Subject, Mark, Attendance].map((M) => M.init()));
  const subs = [];
  for (const [code, name, credits] of SUBJECTS) subs.push(await Subject.create({ code, name, credits }));
  const studentHash = bcrypt.hashSync('student123', 10);
  await User.create({ username: 'admin', passwordHash: bcrypt.hashSync('admin123', 10), role: 'admin' });
  const marks = [], atts = [], users = [];
  for (let i = 0; i < n; i++) {
    const st = await Student.create({ rollNo: `DEMO${2401 + i}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3 + Math.floor(i / 4)) % LAST.length]}`, department: 'Computer Science', semester: 3 });
    users.push({ username: st.rollNo, passwordHash: studentHash, role: 'student', student: st._id });
    const ability = gauss(66, 15), attBase = clamp(55 + (ability - 40) * 0.8 + gauss(0, 6), 45, 98);
    for (const sub of subs) {
      const skill = ability + gauss(0, 7);
      for (const [et, mx] of Object.entries(EXAM_MAX)) {
        const pct = clamp(skill + gauss(0, 6), 5, 100);
        marks.push({ student: st._id, subject: sub._id, examType: et, marksObtained: Math.round((pct / 100) * mx * 2) / 2, maxMarks: mx });
      }
      atts.push({ student: st._id, subject: sub._id, totalClasses: 40, attended: clamp(Math.round(40 * clamp(attBase + gauss(0, 5), 30, 100) / 100), 0, 40) });
    }
  }
  await User.insertMany(users); await Mark.insertMany(marks); await Attendance.insertMany(atts);
  console.log(`Seeded ${n} synthetic students, ${subs.length} subjects (${MONGO_URI}).\nLogin: admin/admin123 or DEMO2401/student123`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
