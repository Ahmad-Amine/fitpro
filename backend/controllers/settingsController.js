const { ShopSettings } = require('../models');
const { asyncHandler }  = require('../middleware/errorHandler');

exports.getSettings = asyncHandler(async (req, res) => {
  let settings = await ShopSettings.findOne({ singleton: 'main' });
  if (!settings) settings = await ShopSettings.create({ singleton: 'main' });
  res.json({ success: true, data: settings });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const allowed = [
    'shopName','tagline','address','googleMapsUrl','email',
    'hoursWeekdays','hoursSaturday','hoursSunday',
    'phone','whatsapp','facebook','instagram','tiktok',
    'heroTitle','heroSubtitle',
    'stat1Value','stat1Label','stat2Value','stat2Label',
    'stat3Value','stat3Label','stat4Value','stat4Label',
    'feature1Title','feature1Desc','feature2Title','feature2Desc',
    'feature3Title','feature3Desc','feature4Title','feature4Desc',
    'ctaTitle','ctaSubtitle','nutritionPrice','sessionPriceLive','sessionPriceOnline',
  ];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  for (const key of ['nutritionPrice', 'sessionPriceLive', 'sessionPriceOnline']) {
    if (updates[key] === undefined) continue;
    const n = Number(updates[key]);
    if (isNaN(n) || n < 0 || n > 100000)
      return res.status(400).json({ success: false, message: `Invalid ${key}` });
    updates[key] = n;
  }
  const settings = await ShopSettings.findOneAndUpdate(
    { singleton: 'main' }, { $set: updates }, { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: settings, message: 'Settings saved!' });
});
