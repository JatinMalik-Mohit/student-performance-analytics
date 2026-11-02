const test = require('node:test');
const assert = require('node:assert/strict');
const an = require('../analytics');

// Alice: S1 18+27+45=90 (O), S2 10+15+25=50 (B); attendance 36/40 + 24/40
// Bob:   S1  8+12+20=40 (C), S2  4+ 6+10=20 (F); attendance 20/40 + 20/40
const subjects = [{ _id: 's1', code: 'S1', name: 'Sub One', credits: 4 }, { _id: 's2', code: 'S2', name: 'Sub Two', credits: 2 }];
const students = [{ _id: 'a', rollNo: 'A', name: 'Alice', department: 'CS', semester: 1 }, { _id: 'b', rollNo: 'B', name: 'Bob', department: 'CS', semester: 1 }];
const mk = (student, subject, vals) => ['Quiz', 'Midterm', 'Final'].map((examType, i) => ({ student, subject, examType, marksObtained: vals[i], maxMarks: an.EXAM_MAX[examType] }));
const marks = [...mk('a', 's1', [18, 27, 45]), ...mk('a', 's2', [10, 15, 25]), ...mk('b', 's1', [8, 12, 20]), ...mk('b', 's2', [4, 6, 10])];
const attendance = [['a', 's1', 36], ['a', 's2', 24], ['b', 's1', 20], ['b', 's2', 20]].map(([student, subject, attended]) => ({ student, subject, totalClasses: 40, attended }));
const built = an.build({ students, subjects, marks, attendance });
const [A, B] = built;

test('grade boundaries', () => {
  assert.deepEqual(an.grade(90), ['O', 10]); assert.deepEqual(an.grade(89.99), ['A+', 9]);
  assert.deepEqual(an.grade(40), ['C', 5]); assert.deepEqual(an.grade(39.99), ['F', 0]);
});
test('subject percentages', () => assert.deepEqual(A.subjects.map((x) => x.pct), [90, 50]));
test('overall percentage and credit-weighted CGPA', () => {
  assert.equal(A.overall_pct, 70); assert.equal(A.cgpa, 8.67); // (10*4+6*2)/6
  assert.equal(B.overall_pct, 30); assert.equal(B.cgpa, 3.33); // (5*4+0*2)/6
});
test('attendance and rank', () => {
  assert.equal(A.att_pct, 75); assert.equal(B.att_pct, 50);
  assert.deepEqual([A.rank, B.rank], [1, 2]);
});
test('risk flags (exactly 75% is not below the threshold)', () => {
  assert.equal(A.at_risk, false); assert.equal(B.risk_reasons.length, 3);
});
test('pearson', () => {
  assert.equal(an.pearson([1, 2, 3], [2, 4, 6]), 1); assert.equal(an.pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(an.pearson([1, 2], [1, 2]), null); assert.equal(an.pearson([1, 1, 1], [1, 2, 3]), null);
});
test('class summary', () => {
  const s = an.classSummary(built);
  assert.deepEqual([s.mean_pct, s.median_pct, s.pass_rate, s.at_risk], [50, 50, 50, 1]);
});
