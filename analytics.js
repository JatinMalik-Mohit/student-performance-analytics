// All analytics calculations. Pure functions: they take plain arrays (no database access).
const EXAM_MAX = { Quiz: 20, Midterm: 30, Final: 50 }; // a subject is out of 100
const GRADES = [[90, 'O', 10], [80, 'A+', 9], [70, 'A', 8], [60, 'B+', 7], [50, 'B', 6], [40, 'C', 5], [0, 'F', 0]];
const PASS_PCT = 40, RISK_OVERALL_PCT = 50, RISK_ATTENDANCE = 75;

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pstdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

function grade(pct) {
  for (const [cut, letter, points] of GRADES) if (pct >= cut) return [letter, points];
  return ['F', 0];
}

/** students: [{_id,rollNo,name,department,semester}], subjects: [{_id,code,name,credits}],
 *  marks: [{student,subject,marksObtained,maxMarks}], attendance: [{student,subject,totalClasses,attended}] */
function build({ students, subjects, marks, attendance }) {
  const m = new Map(), a = new Map();
  for (const x of marks) { const k = `${x.student}|${x.subject}`, c = m.get(k) || { obt: 0, mx: 0 }; c.obt += x.marksObtained; c.mx += x.maxMarks; m.set(k, c); }
  for (const x of attendance) a.set(`${x.student}|${x.subject}`, x);
  const out = students.map((st) => {
    const s = { id: String(st._id), roll_no: st.rollNo, name: st.name, department: st.department, semester: st.semester, subjects: [] };
    for (const sub of subjects) {
      const k = `${st._id}|${sub._id}`, mk = m.get(k), at = a.get(k);
      const pct = mk && mk.mx ? r2((mk.obt / mk.mx) * 100) : null;
      const [letter, pts] = pct !== null ? grade(pct) : [null, null];
      s.subjects.push({ subject_id: String(sub._id), code: sub.code, subject: sub.name, credits: sub.credits,
        obtained: mk ? mk.obt : null, max: mk ? mk.mx : null, pct, grade: letter, points: pts,
        attended: at ? at.attended : null, total_classes: at ? at.totalClasses : null,
        att_pct: at && at.totalClasses ? r2((at.attended / at.totalClasses) * 100) : null });
    }
    const graded = s.subjects.filter((x) => x.pct !== null), atts = s.subjects.filter((x) => x.att_pct !== null);
    s.overall_pct = graded.length ? r2(mean(graded.map((x) => x.pct))) : null;
    const cr = graded.reduce((t, x) => t + x.credits, 0);
    s.cgpa = cr ? r2(graded.reduce((t, x) => t + x.points * x.credits, 0) / cr) : null;
    const tot = atts.reduce((t, x) => t + x.total_classes, 0);
    s.att_pct = tot ? r2((atts.reduce((t, x) => t + x.attended, 0) / tot) * 100) : null;
    const reasons = [];
    if (s.overall_pct !== null && s.overall_pct < RISK_OVERALL_PCT) reasons.push(`Overall below ${RISK_OVERALL_PCT}%`);
    if (s.att_pct !== null && s.att_pct < RISK_ATTENDANCE) reasons.push(`Attendance below ${RISK_ATTENDANCE}%`);
    const failed = graded.filter((x) => x.pct < PASS_PCT).map((x) => x.code);
    if (failed.length) reasons.push('Failing: ' + failed.join(', '));
    s.risk_reasons = reasons; s.at_risk = reasons.length > 0; s.rank = null;
    return s;
  });
  out.filter((s) => s.overall_pct !== null).sort((x, y) => y.overall_pct - x.overall_pct).forEach((s, i) => { s.rank = i + 1; });
  return out;
}

function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  const sx = Math.sqrt(xs.reduce((t, x) => t + (x - mx) ** 2, 0)), sy = Math.sqrt(ys.reduce((t, y) => t + (y - my) ** 2, 0));
  if (!sx || !sy) return null;
  return Math.round((xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / (sx * sy)) * 1000) / 1000;
}

function classSummary(students) {
  const v = students.map((s) => s.overall_pct).filter((x) => x !== null), at = students.map((s) => s.att_pct).filter((x) => x !== null),
    cg = students.map((s) => s.cgpa).filter((x) => x !== null);
  const passing = students.filter((s) => !s.subjects.some((x) => x.pct !== null && x.pct < PASS_PCT)).length;
  return { students: students.length, mean_pct: v.length ? r2(mean(v)) : null, median_pct: v.length ? r2(median(v)) : null,
    std_pct: v.length ? r2(pstdev(v)) : null, avg_cgpa: cg.length ? r2(mean(cg)) : null, avg_attendance: at.length ? r2(mean(at)) : null,
    pass_rate: students.length ? r2((passing / students.length) * 100) : null, at_risk: students.filter((s) => s.at_risk).length };
}

module.exports = { EXAM_MAX, GRADES, PASS_PCT, RISK_OVERALL_PCT, RISK_ATTENDANCE, grade, build, pearson, classSummary, r2, mean };
