const { Appointment, User, Service, Bundle, WorkoutPlan, NutritionPlan, ShopSettings } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

/* ════════════════════════════════════════════════════
   Pure-JS XLSX builder  (no npm packages needed)
   Produces a valid .xlsx (Office Open XML) file
   ════════════════════════════════════════════════════ */

function escXML(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

/* Convert column index (0-based) to Excel letter(s): 0→A, 25→Z, 26→AA */
function colLetter(n) {
  let s = '';
  n++;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/* Build one worksheet XML from a 2-D array of rows */
function makeSheet(rows) {
  const rowsXML = rows.map((row, ri) => {
    const cells = row.map((val, ci) => {
      const ref = `${colLetter(ci)}${ri + 1}`;
      const v   = escXML(val);
      return `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rowsXML}</sheetData>
</worksheet>`;
}

/* Build an xlsx ZIP with multiple sheets */
function buildXLSX(sheets) {
  // sheets = [{name, rows}]
  const sheetXMLs  = sheets.map(s => makeSheet(s.rows));
  const sheetNames = sheets.map(s => s.name);

  const sheetsInWorkbook = sheetNames.map((n, i) =>
    `<sheet name="${escXML(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`
  ).join('');

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetsInWorkbook}</sheets>
</workbook>`;

  const wbRels = sheetNames.map((_, i) =>
    `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`
  ).join('');

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${wbRels}
</Relationships>`;

  const overrides = sheetNames.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
</Types>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const files = {
    '[Content_Types].xml':         contentTypes,
    '_rels/.rels':                 pkgRels,
    'xl/workbook.xml':             workbook,
    'xl/_rels/workbook.xml.rels':  wbRelsXml,
  };
  sheetXMLs.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i+1}.xml`] = xml;
  });

  return zipFiles(files);
}

/* Minimal ZIP builder */
function zipFiles(files) {
  const crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crc32Table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

  const entries = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');
    const crc     = crc32(dataBuf);
    const size    = dataBuf.length;

    const lh = Buffer.concat([
      Buffer.from([0x50,0x4B,0x03,0x04]),
      u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBuf.length), u16(0), nameBuf,
    ]);
    entries.push({ name, nameBuf, crc, size, offset, lh, dataBuf });
    offset += lh.length + size;
  }

  const cdOffset = offset;
  const centralDir = entries.map(e => Buffer.concat([
    Buffer.from([0x50,0x4B,0x01,0x02]),
    u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
    u32(e.crc), u32(e.size), u32(e.size),
    u16(e.nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset),
    e.nameBuf,
  ]));

  const cdBuf = Buffer.concat(centralDir);
  const eocd  = Buffer.concat([
    Buffer.from([0x50,0x4B,0x05,0x06]),
    u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cdBuf.length), u32(cdOffset), u16(0),
  ]);

  const parts = [];
  for (const e of entries) { parts.push(e.lh); parts.push(e.dataBuf); }
  parts.push(cdBuf);
  parts.push(eocd);
  return Buffer.concat(parts);
}

/* ─── helpers ─── */
const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '';
const fmtT = d => d ? new Date(d).toLocaleString('en-GB')    : '';
const yn   = v => v ? 'Yes' : 'No';
const num  = v => (v == null || v === '') ? '' : Number(v);

/* ════════════════════════════════════════════════════
   MAIN EXPORT HANDLER  — builds one big xlsx
   with a tab for every data collection
   ════════════════════════════════════════════════════ */
exports.exportAppointments = asyncHandler(async (req, res) => {
  const [appts, users, services, bundles, workoutPlans, nutritionPlans, settings] = await Promise.all([
    Appointment.find()
      .populate('service','name price duration category')
      .populate('user','name email phone')
      .populate('bundleId','name sessions price')
      .sort({ date:1, time:1 }),
    User.find().sort({ createdAt:-1 }),
    Service.find().sort({ category:1, name:1 }),
    Bundle.find().populate('service','name').sort({ name:1 }),
    WorkoutPlan.find()
      .populate('user','name email')
      .populate('service','name')
      .sort({ createdAt:-1 }),
    require('../models').NutritionPlan.find()
      .populate('user','name email')
      .sort({ createdAt:-1 }),
    require('../models').ShopSettings.findOne({ singleton:'main' }),
  ]);

  /* Appointment count per user */
  const apptStats = {};
  for (const a of appts) {
    const uid = String(a.user?._id || a.customerPhone || 'phone');
    if (!apptStats[uid]) apptStats[uid] = { total:0, confirmed:0, cancelled:0, revenue:0 };
    apptStats[uid].total++;
    if (a.status==='confirmed')  apptStats[uid].confirmed++;
    if (a.status==='cancelled')  apptStats[uid].cancelled++;
    if (a.isPaid) apptStats[uid].revenue += (a.paidAmount || 0);
  }

  /* ── Sheet 1: Appointments ── */
  const apptHeaders = [
    'Date','Time','Status','Paid','Amount Paid ($)','Payment Note',
    'Client Name','Client Email','Client Phone','Phone Booking',
    'Service','Category','Duration (min)','Price ($)',
    'Bundle','Bundle Sessions','Bundle Price ($)',
    'Is Bundle','Bundle Group ID',
    'Admin Note','Client Notes','Created At'
  ];
  const apptRows = appts.map(a => [
    a.date, a.time, a.status,
    yn(a.isPaid), num(a.paidAmount), a.paymentNote||'',
    a.isPhoneBooking ? a.customerName  : (a.user?.name  ||''),
    a.isPhoneBooking ? ''              : (a.user?.email ||''),
    a.isPhoneBooking ? a.customerPhone : (a.user?.phone ||''),
    yn(a.isPhoneBooking),
    a.service?.name||'', a.service?.category||'',
    num(a.service?.duration), num(a.paidAmount||a.service?.price),
    a.bundleId?.name||'', num(a.bundleId?.sessions), num(a.bundleId?.price),
    yn(a.isBundle), a.bundleGroupId||'',
    a.adminNote||'', a.notes||'', fmtT(a.createdAt)
  ]);

  /* ── Sheet 2: Clients ── */
  const userHeaders = [
    'Name','Email','Phone','Role','Status',
    'Total Sessions','Confirmed','Cancelled','Total Paid ($)',
    'Joined Date','Last Updated'
  ];
  const userRows = users.map(u => {
    const uid   = String(u._id);
    const stats = apptStats[uid] || { total:0, confirmed:0, cancelled:0, revenue:0 };
    return [
      u.name, u.email, u.phone, u.role,
      u.isActive===false ? 'Deactivated' : 'Active',
      stats.total, stats.confirmed, stats.cancelled, num(stats.revenue),
      fmt(u.createdAt), fmt(u.updatedAt)
    ];
  });

  /* ── Sheet 3: Programs (Services) ── */
  const svcHeaders = [
    'Name','Category','Price ($)','Duration (min)','Active',
    'Sections Count','Section Headings (summary)','Created At'
  ];
  const svcRows = services.map(s => {
    const headings = (s.sections||[]).map(sec => sec.heading).join(' | ');
    return [
      s.name, s.category, num(s.price), num(s.duration),
      yn(s.isActive),
      (s.sections||[]).length, headings||'—',
      fmt(s.createdAt)
    ];
  });

  /* ── Sheet 4: Program Sections Detail ── */
  const secHeaders = ['Program','Category','Section Heading','Item #','Item Title','Item Description'];
  const secRows = [];
  for (const s of services) {
    if (!s.sections || s.sections.length===0) {
      secRows.push([s.name, s.category, '(no sections)', '', '', '']);
      continue;
    }
    for (const sec of s.sections) {
      if (!sec.items || sec.items.length===0) {
        secRows.push([s.name, s.category, sec.heading, '', '(no items)', '']);
        continue;
      }
      sec.items.forEach((it, idx) => {
        secRows.push([
          s.name, s.category, sec.heading,
          idx+1, it.title||'', it.description||''
        ]);
      });
    }
  }

  /* ── Sheet 5: Bundle Packages ── */
  const bndHeaders = [
    'Bundle Name','Description','Sessions','Price ($)',
    'Validity (days)','Linked Program','Active','Created At'
  ];
  const bndRows = bundles.map(b => [
    b.name, b.description||'', num(b.sessions), num(b.price),
    num(b.validDays), b.service?.name||'Any',
    yn(b.isActive), fmt(b.createdAt)
  ]);

  /* ── Sheet 6: Workout Plans ── */
  const wpHeaders = [
    'Plan Title','Description','Client Name','Client Email',
    'Linked Program','Days Count','Exercises Total','Active','Created At'
  ];
  const wpRows = workoutPlans.map(wp => {
    const totalEx = (wp.weeklyPlan||[]).reduce((s,d)=>s+(d.exercises||[]).length,0);
    return [
      wp.title||'', wp.description||'',
      wp.user?.name||'', wp.user?.email||'',
      wp.service?.name||'—',
      (wp.weeklyPlan||[]).length, totalEx,
      yn(wp.isActive), fmt(wp.createdAt)
    ];
  });

  /* ── Sheet 7: Workout Plan Details (exercises) ── */
  const wpDetHeaders = [
    'Client','Plan Title','Day Name','Day Focus',
    'Exercise','Sets','Reps','Weight','Rest (sec)','Notes','Video URL'
  ];
  const wpDetRows = [];
  for (const wp of workoutPlans) {
    for (const day of (wp.weeklyPlan||[])) {
      if (!day.exercises || day.exercises.length===0) {
        wpDetRows.push([wp.user?.name||'', wp.title||'', day.dayName, day.focus||'', '(no exercises)','','','','','','']);
        continue;
      }
      for (const ex of day.exercises) {
        wpDetRows.push([
          wp.user?.name||'', wp.title||'',
          day.dayName, day.focus||'',
          ex.name, num(ex.sets), ex.reps||'', ex.weight||'',
          num(ex.restSeconds), ex.notes||'', ex.videoUrl||''
        ]);
      }
    }
  }

  /* ── Sheet 8: Nutrition Plans ── */
  const nutHeaders = [
    'Client Name','Client Email','Plan Title','Goal',
    'Daily Calories','Protein (g)','Carbs (g)','Fat (g)',
    'Meals Count','Guidelines','Supplements','Last Updated'
  ];
  const nutRows = nutritionPlans.map(n => [
    n.user?.name||'', n.user?.email||'',
    n.title||'', n.goal||'',
    num(n.dailyCalories), num(n.dailyProtein), num(n.dailyCarbs), num(n.dailyFat),
    (n.meals||[]).length, n.guidelines||'', n.supplements||'',
    fmt(n.updatedAt)
  ]);

  /* ── Sheet 9: Nutrition Meals Detail ── */
  const mealHeaders = [
    'Client','Plan Title','Meal Name','Foods',
    'Calories','Protein (g)','Carbs (g)','Fat (g)'
  ];
  const mealRows = [];
  for (const n of nutritionPlans) {
    for (const m of (n.meals||[])) {
      mealRows.push([
        n.user?.name||'', n.title||'',
        m.name||'', m.foods||'',
        num(m.calories), num(m.protein), num(m.carbs), num(m.fat)
      ]);
    }
  }
  if (mealRows.length===0) mealRows.push(['No nutrition meals found','','','','','','','']);

  /* ── Sheet 10: Shop Settings ── */
  const stgHeaders = ['Setting','Value'];
  const stgRows = settings ? [
    ['Shop Name',    settings.shopName],
    ['Tagline',      settings.tagline],
    ['Email',        settings.email],
    ['Phone',        settings.phone],
    ['WhatsApp',     settings.whatsapp],
    ['Address',      settings.address],
    ['Hours Weekdays', settings.hoursWeekdays],
    ['Hours Saturday', settings.hoursSaturday],
    ['Hours Sunday',   settings.hoursSunday],
    ['Facebook',     settings.facebook],
    ['Instagram',    settings.instagram],
    ['TikTok',       settings.tiktok],
    ['Hero Title',   settings.heroTitle],
    ['Hero Subtitle',settings.heroSubtitle],
    ['Stat 1',       `${settings.stat1Value} — ${settings.stat1Label}`],
    ['Stat 2',       `${settings.stat2Value} — ${settings.stat2Label}`],
    ['Stat 3',       `${settings.stat3Value} — ${settings.stat3Label}`],
    ['Stat 4',       `${settings.stat4Value} — ${settings.stat4Label}`],
  ] : [['No settings found','']];

  /* ── Build & send xlsx ── */
  const xlsx = buildXLSX([
    { name: '1. Appointments',         rows: [apptHeaders, ...apptRows]  },
    { name: '2. Clients',              rows: [userHeaders, ...userRows]  },
    { name: '3. Programs',             rows: [svcHeaders,  ...svcRows]   },
    { name: '4. Program Details',      rows: [secHeaders,  ...secRows]   },
    { name: '5. Bundles',              rows: [bndHeaders,  ...bndRows]   },
    { name: '6. Workout Plans',        rows: [wpHeaders,   ...wpRows]    },
    { name: '7. Workout Exercises',    rows: [wpDetHeaders,...wpDetRows] },
    { name: '8. Nutrition Plans',      rows: [nutHeaders,  ...nutRows]   },
    { name: '9. Nutrition Meals',      rows: [mealHeaders, ...mealRows]  },
    { name: '10. Shop Settings',       rows: [stgHeaders,  ...stgRows]   },
  ]);

  const filename = `aya-fit-backup_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xlsx);
});

/* Keep users export as a quick separate route */
exports.exportUsers = asyncHandler(async (req, res) => {
  const [users, appts] = await Promise.all([
    User.find({ role:'customer' }).sort({ createdAt:-1 }),
    Appointment.aggregate([
      { $group: { _id:'$user', total:{$sum:1}, confirmed:{$sum:{$cond:[{$eq:['$status','confirmed']},1,0]}}, revenue:{$sum:{$cond:['$isPaid','$paidAmount',0]}} } }
    ])
  ]);
  const map = {};
  appts.forEach(a => { map[String(a._id)] = a; });

  const headers = ['Name','Email','Phone','Status','Total Sessions','Confirmed','Revenue ($)','Joined'];
  const rows = users.map(u => {
    const s = map[String(u._id)] || { total:0, confirmed:0, revenue:0 };
    return [u.name, u.email, u.phone, u.isActive===false?'Deactivated':'Active', s.total, s.confirmed, num(s.revenue), fmt(u.createdAt)];
  });

  const xlsx = buildXLSX([{ name:'Clients', rows:[headers,...rows] }]);
  const filename = `users_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
  res.send(xlsx);
});
