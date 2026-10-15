const { Schema, model } = require('mongoose');

const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['member', 'admin'], default: 'member' },
}));

// unique startAt = two sessions can't share a start time
const Session = model('Session', new Schema({
  startAt: { type: Date, required: true, unique: true },
  capacity: { type: Number, default: 20 },
  bookedCount: { type: Number, default: 0 },
}));

const bookingSchema = new Schema({
  session: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true, unique: true },
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
  checkedInAt: Date,
}, { timestamps: true });
// one ACTIVE booking per member per session (cancelled ones are ignored)
bookingSchema.index({ session: 1, member: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
const Booking = model('Booking', bookingSchema);

const waitSchema = new Schema({
  session: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
waitSchema.index({ session: 1, member: 1 }, { unique: true });
const Waitlist = model('Waitlist', waitSchema);

module.exports = { User, Session, Booking, Waitlist };
