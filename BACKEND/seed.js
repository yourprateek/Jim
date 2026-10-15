require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Session, Booking, Waitlist } = require('./models');

const HOUR = 3600000, OFFSET = 5.5 * HOUR; // IST

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User, Session, Booking, Waitlist].map((M) => M.deleteMany({})));

  const hash = (p) => bcrypt.hash(p, 10);
  await User.create({ name: 'Gym Admin', email: 'admin@gym.test', passwordHash: await hash('admin123'), role: 'admin' });
  await User.create({ name: 'Riya', email: 'riya@gym.test', passwordHash: await hash('member123') });
  await User.create({ name: 'Aman', email: 'aman@gym.test', passwordHash: await hash('member123') });

  // next full hour in IST, then sessions across 3 days
  const base = Math.ceil((Date.now() + OFFSET) / HOUR) * HOUR - OFFSET;
  const offsets = [1, 2, 3, 25, 26, 27, 49, 50];
  const sessions = await Session.insertMany(offsets.map((h) => ({ startAt: new Date(base + h * HOUR) })));

  // make the 2nd session FULL with 20 dummy members
  const full = sessions[1], pw = await hash('x-dummy-x');
  for (let i = 1; i <= 20; i++) {
    const u = await User.create({ name: `Dummy ${i}`, email: `dummy${i}@gym.test`, passwordHash: pw });
    await Booking.create({ session: full._id, member: u._id, code: crypto.randomBytes(4).toString('hex').toUpperCase() });
  }
  await Session.updateOne({ _id: full._id }, { bookedCount: 20 });

  console.log('Seeded. admin@gym.test/admin123, riya@gym.test & aman@gym.test/member123');
  await mongoose.disconnect();
})();
