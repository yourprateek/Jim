const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { User, Session, Booking, Waitlist } = require('../models');

const HOUR = 3600000;
const IST = '+05:30'; // gym runs on Indian time (see README Assumptions)

// ---------- helpers ----------
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const oid = (v) => { if (!mongoose.isValidObjectId(v)) throw fail(400, 'Invalid id'); return v; };

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => [...crypto.randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');

async function createBooking(session, member) {
  for (let i = 0; i < 3; i++) {
    try { return await Booking.create({ session, member, code: makeCode() }); }
    catch (e) { if (!(e.code === 11000 && String(e.message).includes('code_1'))) throw e; }
  }
  throw fail(500, 'Could not create code');
}

// ---------- middleware ----------
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); next(); }
  catch { next(fail(401, 'Please log in')); }
};
const admin = (req, res, next) => (req.user.role === 'admin' ? next() : next(fail(403, 'Admins only')));

// ---------- accounts ----------
router.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw fail(400, 'Name is required');
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) throw fail(400, 'A valid email is required');
  if (typeof password !== 'string' || password.length < 6) throw fail(400, 'Password must be at least 6 characters');
  try { await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) }); }
  catch (e) { if (e.code === 11000) throw fail(409, 'Email already registered'); throw e; }
  res.status(201).json({ message: 'Registered' });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') throw fail(400, 'Email and password are required');
  const u = await User.findOne({ email: email.toLowerCase().trim() });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw fail(401, 'Wrong email or password');
  const token = jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { name: u.name, role: u.role } });
}));

// ---------- sessions ----------
router.post('/sessions', auth, admin, wrap(async (req, res) => {
  const { date, hour } = req.body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail(400, 'date must be YYYY-MM-DD');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw fail(400, 'hour must be a whole number 0-23');
  const startAt = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00${IST}`);
  if (isNaN(startAt)) throw fail(400, 'Invalid date');
  if (startAt <= new Date()) throw fail(400, 'Session must be in the future');
  try { const s = await Session.create({ startAt }); res.status(201).json({ id: s.id, startAt: s.startAt }); }
  catch (e) { if (e.code === 11000) throw fail(409, 'A session already starts at that time'); throw e; }
}));

router.get('/sessions', auth, wrap(async (req, res) => {
  const q = {};
  if (req.query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) throw fail(400, 'date must be YYYY-MM-DD');
    const s = new Date(`${req.query.date}T00:00:00${IST}`);
    if (isNaN(s)) throw fail(400, 'Invalid date');
    q.startAt = { $gte: s, $lt: new Date(+s + 24 * HOUR) };
  } else q.startAt = { $gte: new Date() };
  const sessions = await Session.find(q).sort('startAt');
  const ids = sessions.map((s) => s._id);
  const [bk, wl] = await Promise.all([
    Booking.find({ session: { $in: ids }, member: req.user.id, status: 'confirmed' }),
    Waitlist.find({ session: { $in: ids }, member: req.user.id }),
  ]);
  res.json(sessions.map((s) => ({
    id: s.id, startAt: s.startAt, seatsLeft: s.capacity - s.bookedCount,
    bookingId: bk.find((b) => b.session.equals(s._id))?.id || null,
    waitlisted: wl.some((w) => w.session.equals(s._id)),
  })));
}));

// ---------- bookings ----------
router.post('/sessions/:id/book', auth, wrap(async (req, res) => {
  const sid = oid(req.params.id);
  // check + take seat in ONE atomic step: two people can't both get the last seat
  const s = await Session.findOneAndUpdate(
    { _id: sid, startAt: { $gt: new Date() }, $expr: { $lt: ['$bookedCount', '$capacity'] } },
    { $inc: { bookedCount: 1 } });
  if (!s) {
    const ex = await Session.findById(sid);
    if (!ex) throw fail(404, 'Session not found');
    throw fail(409, ex.startAt <= new Date() ? 'Session already started' : 'Session is full');
  }
  let b;
  try { b = await createBooking(sid, req.user.id); }
  catch (e) {
    await Session.updateOne({ _id: sid }, { $inc: { bookedCount: -1 } }); // give the seat back
    if (e.code === 11000) throw fail(409, 'You already booked this session');
    throw e;
  }
  await Waitlist.deleteOne({ session: sid, member: req.user.id });
  res.status(201).json({ id: b.id, code: b.code });
}));

router.delete('/bookings/:id', auth, wrap(async (req, res) => {
  const b = await Booking.findById(oid(req.params.id));
  if (!b) throw fail(404, 'Booking not found');
  if (!b.member.equals(req.user.id)) throw fail(403, 'Not your booking');
  const s = await Session.findById(b.session);
  if (s.startAt <= new Date()) throw fail(409, 'Session already started');
  const done = await Booking.findOneAndUpdate({ _id: b._id, status: 'confirmed' }, { status: 'cancelled' });
  if (!done) throw fail(409, 'Already cancelled');
  const next = await Waitlist.findOneAndDelete({ session: s._id }, { sort: { createdAt: 1 } });
  if (next) await createBooking(s._id, next.member); // seat passes on, count unchanged
  else await Session.updateOne({ _id: s._id }, { $inc: { bookedCount: -1 } });
  res.json({ message: 'Cancelled' });
}));

router.get('/bookings/me', auth, wrap(async (req, res) => {
  const [bk, wl] = await Promise.all([
    Booking.find({ member: req.user.id }).populate('session').sort('-createdAt'),
    Waitlist.find({ member: req.user.id }).populate('session').sort('createdAt'),
  ]);
  res.json({
    bookings: bk.map((b) => ({ id: b.id, code: b.code, status: b.status, startAt: b.session.startAt, checkedIn: !!b.checkedInAt })),
    waitlist: wl.map((w) => ({ sessionId: w.session.id, startAt: w.session.startAt })),
  });
}));

router.get('/sessions/:id/bookings', auth, admin, wrap(async (req, res) => {
  const list = await Booking.find({ session: oid(req.params.id) }).populate('member', 'name email');
  res.json(list.map((b) => ({ id: b.id, name: b.member.name, email: b.member.email, status: b.status, checkedIn: !!b.checkedInAt })));
}));

// ---------- waitlist ----------
router.post('/sessions/:id/waitlist', auth, wrap(async (req, res) => {
  const s = await Session.findById(oid(req.params.id));
  if (!s) throw fail(404, 'Session not found');
  if (s.startAt <= new Date()) throw fail(409, 'Session already started');
  if (s.bookedCount < s.capacity) throw fail(409, 'Seats are free, book directly');
  if (await Booking.exists({ session: s._id, member: req.user.id, status: 'confirmed' })) throw fail(409, 'You already booked this session');
  try { await Waitlist.create({ session: s._id, member: req.user.id }); }
  catch (e) { if (e.code === 11000) throw fail(409, 'Already on the waitlist'); throw e; }
  res.status(201).json({ message: 'Joined waitlist' });
}));

router.delete('/sessions/:id/waitlist', auth, wrap(async (req, res) => {
  const r = await Waitlist.deleteOne({ session: oid(req.params.id), member: req.user.id });
  if (!r.deletedCount) throw fail(404, 'You are not on this waitlist');
  res.json({ message: 'Left waitlist' });
}));

// ---------- check-in ----------
router.post('/checkin', auth, admin, wrap(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) throw fail(400, 'Code is required');
  const b = await Booking.findOne({ code }).populate('member', 'name email').populate('session');
  if (!b) throw fail(404, 'Code not found');
  if (b.status !== 'confirmed') throw fail(409, 'Booking was cancelled');
  if (b.checkedInAt) throw fail(409, 'Code already used');
  const now = Date.now(), st = +b.session.startAt;
  if (now < st || now >= st + HOUR) throw fail(409, 'Not during this session\'s hour');
  const r = await Booking.updateOne({ _id: b._id, status: 'confirmed', checkedInAt: null }, { checkedInAt: new Date() });
  if (!r.modifiedCount) throw fail(409, 'Code already used');
  res.json({ name: b.member.name, email: b.member.email });
}));

module.exports = router;
