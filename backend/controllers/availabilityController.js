const { Appointment, WorkingHours, DateOverride } = require('../models');
const moment = require('moment');
const { asyncHandler } = require('../middleware/errorHandler');

const generateSlots = (open, close, duration) => {
  const slots = [];
  let cur = moment(open, 'HH:mm');
  const end = moment(close, 'HH:mm');
  while (cur.isBefore(end)) { slots.push(cur.format('HH:mm')); cur.add(duration, 'minutes'); }
  return slots;
};

const resolveSchedule = async (date) => {
  const override = await DateOverride.findOne({ date });
  if (override) return { isOpen: override.isOpen, openTime: override.openTime, closeTime: override.closeTime, slotDuration: override.slotDuration, reason: override.reason, source: 'override' };
  const dayOfWeek = moment(date, 'YYYY-MM-DD').day();
  const wh = await WorkingHours.findOne({ dayOfWeek });
  if (!wh) return { isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60, source: 'default' };
  return { isOpen: wh.isOpen, openTime: wh.openTime, closeTime: wh.closeTime, slotDuration: wh.slotDuration, reason: '', source: 'weekly' };
};

exports.getSlots = asyncHandler(async (req, res) => {
  const { date } = req.params;
  if (!date || !moment(date, 'YYYY-MM-DD', true).isValid())
    return res.status(400).json({ success: false, message: 'Invalid date. Use YYYY-MM-DD.' });
  const schedule = await resolveSchedule(date);
  if (!schedule.isOpen) return res.json({ success: true, date, isOpen: false, reason: schedule.reason || 'Closed', slots: [] });
  const booked = await Appointment.find({ date, status: { $in: ['pending','confirmed'] } }).select('time');
  const bookedSet = new Set(booked.map(a => a.time));
  const allSlots = generateSlots(schedule.openTime, schedule.closeTime, schedule.slotDuration);
  const isToday = date === moment().format('YYYY-MM-DD');
  const nowPlus30 = moment().add(30, 'minutes');
  const slots = allSlots.map(t => {
    const slotTime = moment(t, 'HH:mm');
    const isPast = isToday && slotTime.isSameOrBefore(nowPlus30);
    return { time: t, available: !bookedSet.has(t) && !isPast, isPast };
  });
  res.json({ success: true, date, isOpen: true, openTime: schedule.openTime, closeTime: schedule.closeTime, slotDuration: schedule.slotDuration, source: schedule.source, slots });
});

exports.getMonth = asyncHandler(async (req, res) => {
  const today = moment().startOf('day');
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = today.clone().add(i, 'days');
    const dateStr = d.format('YYYY-MM-DD');
    const schedule = await resolveSchedule(dateStr);
    if (!schedule.isOpen) { days.push({ date: dateStr, isOpen: false, reason: schedule.reason || '', source: schedule.source, totalSlots: 0, availableSlots: 0 }); continue; }
    const allSlots = generateSlots(schedule.openTime, schedule.closeTime, schedule.slotDuration);
    const bookedCnt = await Appointment.countDocuments({ date: dateStr, status: { $in: ['pending','confirmed'] } });
    const isToday = dateStr === moment().format('YYYY-MM-DD');
    const nowPlus30 = moment().add(30, 'minutes');
    const futureSlots = isToday ? allSlots.filter(t => moment(t, 'HH:mm').isAfter(nowPlus30)) : allSlots;
    days.push({ date: dateStr, isOpen: true, openTime: schedule.openTime, closeTime: schedule.closeTime, source: schedule.source, totalSlots: futureSlots.length, availableSlots: Math.max(0, futureSlots.length - bookedCnt) });
  }
  res.json({ success: true, data: days });
});

exports.getWorkingHours = asyncHandler(async (req, res) => {
  const wh = await WorkingHours.find().sort({ dayOfWeek: 1 });
  res.json({ success: true, data: wh });
});

exports.updateWorkingHours = asyncHandler(async (req, res) => {
  const day = Number(req.params.dayOfWeek);
  if (isNaN(day) || day < 0 || day > 6) return res.status(400).json({ success: false, message: 'dayOfWeek must be 0–6' });
  const wh = await WorkingHours.findOneAndUpdate({ dayOfWeek: day }, { $set: req.body }, { new: true, upsert: true, runValidators: true });
  res.json({ success: true, data: wh, message: 'Schedule updated' });
});

exports.getDateOverrides = asyncHandler(async (req, res) => {
  const overrides = await DateOverride.find().sort({ date: 1 });
  res.json({ success: true, data: overrides });
});

exports.setDateOverride = asyncHandler(async (req, res) => {
  const { date, isOpen, openTime, closeTime, slotDuration, reason } = req.body;
  if (!date) return res.status(400).json({ success: false, message: 'Date is required' });
  if (!moment(date, 'YYYY-MM-DD', true).isValid()) return res.status(400).json({ success: false, message: 'Invalid date format' });
  if (typeof isOpen !== 'boolean') return res.status(400).json({ success: false, message: 'isOpen must be true or false' });
  const override = await DateOverride.findOneAndUpdate({ date }, { isOpen, openTime: openTime || '06:00', closeTime: closeTime || '21:00', slotDuration: slotDuration || 60, reason: reason || '' }, { new: true, upsert: true, runValidators: true });
  res.json({ success: true, data: override, message: isOpen ? `${date} is now OPEN` : `${date} is now CLOSED` });
});

exports.removeDateOverride = asyncHandler(async (req, res) => {
  const override = await DateOverride.findByIdAndDelete(req.params.id);
  if (!override) return res.status(404).json({ success: false, message: 'Override not found' });
  res.json({ success: true, message: `Override removed — ${override.date} now follows weekly schedule` });
});

exports.seedWorkingHours = asyncHandler(async (req, res) => {
  const count = await WorkingHours.countDocuments();
  if (count > 0) return res.json({ success: true, message: 'Already seeded' });
  await WorkingHours.insertMany([
    { dayOfWeek: 0, isOpen: false },
    { dayOfWeek: 1, isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60 },
    { dayOfWeek: 2, isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60 },
    { dayOfWeek: 3, isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60 },
    { dayOfWeek: 4, isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60 },
    { dayOfWeek: 5, isOpen: true, openTime: '06:00', closeTime: '21:00', slotDuration: 60 },
    { dayOfWeek: 6, isOpen: true, openTime: '07:00', closeTime: '17:00', slotDuration: 60 },
  ]);
  res.json({ success: true, message: 'Working hours seeded!' });
});
