const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

const Student = mongoose.model('Student', new Schema({
  rollNo: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 12 },
}));

const Subject = mongoose.model('Subject', new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  credits: { type: Number, required: true, min: 1 },
}));

const User = mongoose.model('User', new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'student'], required: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
}));

const markSchema = new Schema({
  student: ref('Student'), subject: ref('Subject'),
  examType: { type: String, enum: ['Quiz', 'Midterm', 'Final'], required: true },
  marksObtained: { type: Number, required: true, min: 0 },
  maxMarks: { type: Number, required: true, min: 1 },
});
markSchema.index({ student: 1, subject: 1, examType: 1 }, { unique: true });
const Mark = mongoose.model('Mark', markSchema);

const attSchema = new Schema({
  student: ref('Student'), subject: ref('Subject'),
  totalClasses: { type: Number, required: true, min: 0 },
  attended: { type: Number, required: true, min: 0, validate: { validator() { return this.attended <= this.totalClasses; }, message: 'attended cannot exceed totalClasses' } },
});
attSchema.index({ student: 1, subject: 1 }, { unique: true });
const Attendance = mongoose.model('Attendance', attSchema);

module.exports = { Student, Subject, User, Mark, Attendance };
