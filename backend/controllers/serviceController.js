const { Service, Appointment, Purchase } = require('../models');
const { asyncHandler }    = require('../middleware/errorHandler');
const { sanitizeImageUrl } = require('../middleware/security');

/* Has this user unlocked full program content for this service?
   - Admins always have access
   - PT services: any PAID appointment on that service
   - Self-training: a PAID purchase of that service */
async function userHasAccess(user, serviceId, isCustom = false) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Custom program content is delivered personally via "My Plans" —
  // the stored sections are an admin-only template, never shown to users.
  if (isCustom) return false;
  const [paidAppt, paidPurchase] = await Promise.all([
    Appointment.exists({ user: user._id, service: serviceId, paymentStatus: 'paid' }),
    Purchase.exists({ user: user._id, service: serviceId, paymentStatus: 'paid' }),
  ]);
  return Boolean(paidAppt || paidPurchase);
}

/* Strip section items for locked viewers: keep headings as a teaser,
   remove all item content, and flag it so the UI shows a purchase CTA. */
function lockSections(serviceDoc) {
  const s = serviceDoc.toObject ? serviceDoc.toObject() : { ...serviceDoc };
  s.sectionsLocked = true;
  s.sections = (s.sections || []).map(sec => ({
    _id: sec._id, heading: sec.heading, items: [], itemCount: (sec.items || []).length,
  }));
  return s;
}

const VALID_CATS = ['Strength','Cardio','Flexibility','Combat','Wellness','Nutrition','Other'];
const CAT_IMAGES = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&q=80',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80',
};

/* Sanitize sections: [{heading, items:[{title,description}]}] */
function cleanSections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(s => s && typeof s.heading === 'string' && s.heading.trim())
    .map(s => ({
      heading: String(s.heading).trim().slice(0, 200),
      items: Array.isArray(s.items)
        ? s.items
            .filter(it => it && (String(it.title||'').trim() || String(it.description||'').trim()))
            .map(it => ({
              title:       String(it.title       || '').trim().slice(0, 200),
              description: String(it.description || '').trim().slice(0, 1000),
              imageUrl:    String(it.imageUrl    || '').trim().slice(0, 500),
            }))
        : [],
    }));
}

exports.getAllServices = asyncHandler(async (req, res) => {
  const services = await Service.find({ isActive: true }).sort({ category: 1, name: 1 });
  // Lock section contents per service unless this viewer has purchased it
  const out = await Promise.all(services.map(async (svc) => {
    if (!svc.sections?.length) return svc;
    return (await userHasAccess(req.user, svc._id, svc.isCustom)) ? svc : lockSections(svc);
  }));
  res.json({ success: true, data: out });
});

exports.getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
  if (service.sections?.length && !(await userHasAccess(req.user, service._id, service.isCustom)))
    return res.json({ success: true, data: lockSections(service) });
  res.json({ success: true, data: service });
});

exports.createService = asyncHandler(async (req, res) => {
  const { name, description, price, duration, category, imageUrl, sections, trainingType, priceLive, priceOnline, isCustom } = req.body;
  if (!name || !description || !price || !duration)
    return res.status(400).json({ success: false, message: 'Name, description, price and duration are required' });
  if (String(name).length > 100)
    return res.status(400).json({ success: false, message: 'Name too long (max 100 chars)' });
  if (String(description).length > 1000)
    return res.status(400).json({ success: false, message: 'Description too long (max 1000 chars)' });

  const cat      = VALID_CATS.includes(category) ? category : 'Other';
  const img      = sanitizeImageUrl(imageUrl) || CAT_IMAGES[cat] || CAT_IMAGES.Other;
  const priceNum = Number(price);
  const durNum   = Number(duration);
  if (isNaN(priceNum) || priceNum < 0 || priceNum > 100000)
    return res.status(400).json({ success: false, message: 'Invalid price' });
  if (isNaN(durNum) || durNum < 1 || durNum > 480)
    return res.status(400).json({ success: false, message: 'Invalid duration (1–480 min)' });

  const tType = trainingType === 'self' ? 'self' : 'pt';
  const parseModePrice = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (isNaN(n) || n < 0 || n > 100000) return NaN;
    return n;
  };
  const pLive   = parseModePrice(priceLive);
  const pOnline = parseModePrice(priceOnline);
  if (Number.isNaN(pLive) || Number.isNaN(pOnline))
    return res.status(400).json({ success: false, message: 'Invalid live/online price' });

  const service = await Service.create({
    name: String(name).trim(), description: String(description).trim(),
    price: priceNum, duration: durNum, category: cat, imageUrl: img,
    sections: cleanSections(sections),
    trainingType: tType,
    priceLive:   tType === 'pt' ? pLive   : null,
    priceOnline: tType === 'pt' ? pOnline : null,
    // Custom programs ARE the 'self' type in the new model — a 'self'
    // service is always custom (personalized, built per-user in My Plans)
    isCustom:    tType === 'self' ? true : Boolean(isCustom),
  });
  res.status(201).json({ success: true, data: service, message: 'Service created' });
});

exports.updateService = asyncHandler(async (req, res) => {
  const { name, description, price, duration, category, imageUrl, sections, trainingType, priceLive, priceOnline, isCustom } = req.body;
  const update = {};

  if (name !== undefined)        { if (String(name).length > 100) return res.status(400).json({success:false,message:'Name too long'}); update.name = String(name).trim(); }
  if (description !== undefined) { if (String(description).length > 1000) return res.status(400).json({success:false,message:'Description too long'}); update.description = String(description).trim(); }
  if (price !== undefined)       { const p = Number(price); if (isNaN(p)||p<0||p>100000) return res.status(400).json({success:false,message:'Invalid price'}); update.price = p; }
  if (duration !== undefined)    { const d = Number(duration); if (isNaN(d)||d<1||d>480) return res.status(400).json({success:false,message:'Invalid duration'}); update.duration = d; }
  if (category !== undefined)    { update.category = VALID_CATS.includes(category) ? category : 'Other'; }
  if (imageUrl !== undefined)    { update.imageUrl = sanitizeImageUrl(imageUrl) || CAT_IMAGES[update.category || 'Other']; }
  if (sections !== undefined)    { update.sections = cleanSections(sections); }
  if (trainingType !== undefined){ update.trainingType = trainingType === 'self' ? 'self' : 'pt'; }
  if (isCustom !== undefined)    { update.isCustom = Boolean(isCustom); }
  if (update.trainingType === 'self') { update.isCustom = true; }
  const parseModePrice = (v) => { if (v === null || v === '') return null; const n = Number(v); return (isNaN(n)||n<0||n>100000) ? NaN : n; };
  if (priceLive !== undefined)   { const p = parseModePrice(priceLive);   if (Number.isNaN(p)) return res.status(400).json({success:false,message:'Invalid live price'});   update.priceLive = p; }
  if (priceOnline !== undefined) { const p = parseModePrice(priceOnline); if (Number.isNaN(p)) return res.status(400).json({success:false,message:'Invalid online price'}); update.priceOnline = p; }

  if (Object.keys(update).length === 0)
    return res.status(400).json({ success: false, message: 'No valid fields to update' });

  const service = await Service.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
  res.json({ success: true, data: service, message: 'Service updated' });
});

exports.deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
  res.json({ success: true, message: 'Service removed' });
});

exports.seedServices = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ success: false, message: 'Seed disabled in production' });
  const count = await Service.countDocuments();
  if (count > 0) return res.json({ success: true, message: 'Already seeded' });
  await Service.insertMany([
    { name: 'Weight Training',     description: 'Build strength and muscle with personalized weight training programs designed for your level.',    price: 60,  duration: 60, category: 'Strength',    imageUrl: CAT_IMAGES.Strength    },
    { name: 'HIIT Session',        description: 'High-intensity interval training to burn fat fast and boost your cardiovascular fitness.',          price: 50,  duration: 45, category: 'Cardio',      imageUrl: CAT_IMAGES.Cardio      },
    { name: 'Cardio Endurance',    description: 'Improve stamina and cardiovascular health with structured endurance training sessions.',            price: 45,  duration: 60, category: 'Cardio',      imageUrl: CAT_IMAGES.Cardio      },
    { name: 'Yoga & Flexibility',  description: 'Increase flexibility, reduce stress and improve posture with guided yoga sessions.',                price: 40,  duration: 60, category: 'Flexibility', imageUrl: CAT_IMAGES.Flexibility },
    { name: 'Boxing Fundamentals', description: 'Learn boxing techniques while getting a full-body workout. Great for fitness and self-defense.',    price: 55,  duration: 60, category: 'Combat',      imageUrl: CAT_IMAGES.Combat      },
    { name: 'Nutrition Coaching',  description: 'Personalized nutrition plan and guidance to support your fitness goals and lifestyle.',             price: 70,  duration: 45, category: 'Nutrition',   imageUrl: CAT_IMAGES.Nutrition   },
    { name: 'Recovery & Mobility', description: 'Targeted mobility work and recovery techniques to keep your body performing at its best.',         price: 40,  duration: 45, category: 'Wellness',    imageUrl: CAT_IMAGES.Wellness    },
    { name: 'Full Body Bootcamp',  description: 'Intense full-body workout combining strength, cardio and core exercises for maximum results.',      price: 50,  duration: 60, category: 'Cardio',      imageUrl: CAT_IMAGES.Cardio      },
  ]);
  res.json({ success: true, message: '8 training services seeded!' });
});
