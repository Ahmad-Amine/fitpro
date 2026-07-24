import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, Dumbbell, Plus, BookOpen, User, Lock, CreditCard,
         ChevronDown, ChevronUp, BarChart2, Apple, Activity, Package, TrendingUp} from 'lucide-react'
import toast from 'react-hot-toast'
import { appointmentsAPI, workoutAPI, purchasesAPI, authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import './DashboardPage.css'

/* ── YouTube embed helper ── */
function getYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function VideoEmbed({ url }) {
  const [open, setOpen] = useState(false)
  const ytId = getYouTubeId(url)

  if (!ytId) {
    // Not a YouTube URL — open as external link
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="er-video">
        ▶ Watch video
      </a>
    )
  }

  return (
    <div className="er-video-wrap">
      <button className="er-video" onClick={() => setOpen(o => !o)}>
        {open ? '▼ Hide video' : '▶ Watch video'}
      </button>
      {open && (
        <div className="er-youtube-embed">
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
            title="Exercise video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}

const STATUS_CFG = {
  pending:   { label:'Pending',   color:'#F59E0B', bg:'#FFFBEB', icon:<AlertCircle size={13}/> },
  confirmed: { label:'Confirmed', color:'#10B981', bg:'#ECFDF5', icon:<CheckCircle size={13}/> },
  rejected:  { label:'Rejected',  color:'#EF4444', bg:'#FEF2F2', icon:<XCircle size={13}/> },
  cancelled: { label:'Cancelled', color:'#6B7280', bg:'#F9FAFB', icon:<XCircle size={13}/> },
}
const CAT_IMAGES = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=70',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=70',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&q=70',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=70',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=70',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70',
}

const TABS = [
  { key:'sessions',   label:'Sessions',    icon:<Calendar size={15}/> },
  { key:'programs',   label:'Predefined Programs', icon:<BookOpen size={15}/> },
  { key:'plans',      label:'Custom Programs',    icon:<Dumbbell size={15}/> },
  { key:'progress',   label:'Progress',    icon:<TrendingUp size={15}/> },
  { key:'nutrition',  label:'Nutrition',   icon:<Apple size={15}/> },
  { key:'profile',    label:'My Profile',  icon:<User size={15}/> },
]

const CAT_IMAGES_DASH = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=70',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=70',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&q=70',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=70',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=70',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=70',
}

/* ── Predefined program unlocked via paid sessions.
   Same visual card as the Services page — click through to the full
   program page, where the content is already unlocked server-side
   for this user (they have a paid appointment for it). ── */
function OwnedProgramCard({ svc }) {
  const img = svc.imageUrl || CAT_IMAGES_DASH[svc.category] || CAT_IMAGES_DASH.Other
  return (
    <Link to={`/services/${svc._id}`} className="plan-card" style={{ marginBottom: 14, display:'block', textDecoration:'none', color:'inherit', padding:0, overflow:'hidden' }}>
      <div style={{ display:'flex', gap:14, alignItems:'stretch' }}>
        <div style={{ width:110, minWidth:110, backgroundImage:`url(${img})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ padding:'12px 14px 12px 0', flex:1, minWidth:0 }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:'.7rem', background:'#0f766e', color:'#fff', borderRadius:6, padding:'2px 7px' }}>{svc.category}</span>
            <span style={{ fontSize:'.7rem', background:'#e0f2fe', color:'#075985', borderRadius:6, padding:'2px 7px' }}>✅ Unlocked</span>
          </div>
          <h3 style={{ margin:0, fontSize:'1.02rem' }}>📋 {svc.name}</h3>
          <p style={{ margin:'4px 0 0', opacity:.75, fontSize:'.85rem', overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {svc.description}
          </p>
          <span style={{ fontSize:'.78rem', opacity:.6 }}>Included with your booked sessions — tap to open →</span>
        </div>
      </div>
    </Link>
  )
}

/* ── Purchased self-training program card ── */
function ProgramCard({ purchase, onPayNow, onGoPlans }) {
  const [open, setOpen] = useState(false)
  const svc  = purchase.service || {}
  const paid = purchase.paymentStatus === 'paid'
  const isCustom = Boolean(svc.isCustom)
  return (
    <div className="plan-card" style={{ marginBottom: 14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div>
          <h3 style={{ margin:0 }}>{svc.name}</h3>
          <p style={{ margin:'4px 0 0', opacity:.75, fontSize:'.85rem' }}>{svc.description}</p>
          <span style={{ fontSize:'.78rem', opacity:.6 }}>
            {paid
              ? `Purchased ${purchase.paidAt ? format(new Date(purchase.paidAt), 'MMM d, yyyy') : ''} · $${purchase.amount}`
              : `Not paid yet · $${purchase.amount}`}
          </span>
        </div>
        {paid ? (
          isCustom ? (
            <button className="btn btn-outline btn-sm" onClick={onGoPlans}>
              Go to My Plans
            </button>
          ) : (
          <button className="btn btn-outline btn-sm" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide Program' : 'Open Program'}
          </button>
          )
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onPayNow(purchase)}>
            <CreditCard size={13}/> Complete Payment
          </button>
        )}
      </div>

      {!paid && (
        <div style={{ marginTop:10, padding:'10px 12px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, fontSize:'.85rem', color:'#9a3412' }}>
          <Lock size={12}/> You must complete payment to unlock and view this program.
        </div>
      )}

      {paid && isCustom && (
        <div style={{ marginTop:10, padding:'10px 12px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, fontSize:'.85rem', color:'#6b21a8' }}>
          🎯 <strong>Personalized program.</strong> Your trainer is preparing your custom plan —
          it will appear in the <strong>My Plans</strong> tab once ready.
        </div>
      )}

      {paid && !isCustom && open && (
        <div style={{ marginTop: 12 }}>
          {(svc.sections || []).length === 0 && <p style={{ opacity:.7 }}>The trainer has not added content yet — check back soon.</p>}
          {(svc.sections || []).map(sec => (
            <div key={sec._id} style={{ marginBottom: 12 }}>
              <h4 style={{ margin:'0 0 6px' }}>{sec.heading}</h4>
              {(sec.items || []).map(it => (
                <div key={it._id} style={{ padding:'8px 10px', background:'var(--surface-2, #f8f8f8)', borderRadius:8, marginBottom:6 }}>
                  {it.title && <strong style={{ display:'block' }}>{it.title}</strong>}
                  {it.description && <span style={{ fontSize:'.88rem', whiteSpace:'pre-wrap' }}>{it.description}</span>}
                  {it.imageUrl && <img src={it.imageUrl} alt={it.title || 'item'} style={{ maxWidth:'100%', borderRadius:6, marginTop:6 }}/>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Progress Log Modal ──────────────────────────────────────────
function LogModal({ onClose, onLogged }) {
  const [type, setType]     = useState('body')
  const [form, setForm]     = useState({ date: format(new Date(),'yyyy-MM-dd'), notes:'', energyLevel:3, durationMins:0, sessionTitle:'', bodyWeight:'', bodyFat:'', chestCm:'', waistCm:'', hipsCm:'', armCm:'', thighCm:'' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(p => ({...p, [k]: e.target.value}))
  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form, type }
      // convert empty strings to null for numbers
      ;['bodyWeight','bodyFat','chestCm','waistCm','hipsCm','armCm','thighCm','energyLevel','durationMins']
        .forEach(k => { payload[k] = form[k] === '' ? null : Number(form[k]) })
      await workoutAPI.logProgress(payload)
      toast.success('Progress logged! 📊')
      onLogged()
      onClose()
    } catch(err) { toast.error(err.response?.data?.message || 'Failed') }
    finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box log-modal fade-up" onClick={e=>e.stopPropagation()}>
        <div className="modal-top-bar">
          <h3>Log Progress</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="log-type-tabs">
          <button className={`ltt-btn ${type==='body'?'active':''}`} onClick={()=>setType('body')}>📏 Body Stats</button>
          <button className={`ltt-btn ${type==='workout'?'active':''}`} onClick={()=>setType('workout')}>💪 Workout</button>
        </div>
        <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={set('date')}/></div>
        {type === 'body' ? (
          <div className="log-body-grid">
            <div className="form-group"><label>Weight (kg)</label><input type="number" step="0.1" placeholder="70.5" value={form.bodyWeight} onChange={set('bodyWeight')}/></div>
            <div className="form-group"><label>Body Fat %</label><input type="number" step="0.1" placeholder="18.0" value={form.bodyFat} onChange={set('bodyFat')}/></div>
            <div className="form-group"><label>Chest (cm)</label><input type="number" placeholder="95" value={form.chestCm} onChange={set('chestCm')}/></div>
            <div className="form-group"><label>Waist (cm)</label><input type="number" placeholder="80" value={form.waistCm} onChange={set('waistCm')}/></div>
            <div className="form-group"><label>Hips (cm)</label><input type="number" placeholder="95" value={form.hipsCm} onChange={set('hipsCm')}/></div>
            <div className="form-group"><label>Arm (cm)</label><input type="number" placeholder="35" value={form.armCm} onChange={set('armCm')}/></div>
            <div className="form-group"><label>Thigh (cm)</label><input type="number" placeholder="55" value={form.thighCm} onChange={set('thighCm')}/></div>
          </div>
        ) : (
          <>
            <div className="form-group"><label>Session Name</label><input placeholder="e.g. Push Day A" value={form.sessionTitle} onChange={set('sessionTitle')}/></div>
            <div className="log-body-grid">
              <div className="form-group"><label>Duration (min)</label><input type="number" placeholder="60" value={form.durationMins} onChange={set('durationMins')}/></div>
              <div className="form-group">
                <label>Energy Level ({form.energyLevel}/5)</label>
                <input type="range" min="1" max="5" value={form.energyLevel} onChange={set('energyLevel')} style={{padding:'8px 0'}}/>
              </div>
            </div>
          </>
        )}
        <div className="form-group"><label>Notes</label><textarea rows={2} placeholder="How did it go?" value={form.notes} onChange={set('notes')}/></div>
        <div className="modal-actions">
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner spinner-sm"/> : 'Save Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Plan detail card ────────────────────────────────────────────
function PlanCard({ plan }) {
  const [open, setOpen] = useState(false)
  const [activeDay, setActiveDay] = useState(null)
  const img = plan.service?.imageUrl || CAT_IMAGES[plan.service?.category] || CAT_IMAGES.Other
  return (
    <div className="plan-card">
      <div className="plan-card-header" onClick={() => setOpen(o => !o)}>
        <img src={img} alt={plan.title} className="plan-thumb"/>
        <div className="plan-header-info">
          <strong>{plan.title}</strong>
          {plan.service && <span className="plan-cat">{plan.service.category}</span>}
          <p>{plan.description || `${plan.weeklyPlan?.length || 0} day${plan.weeklyPlan?.length !== 1 ? 's' : ''} of training`}</p>
        </div>
        <button className="plan-toggle">{open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</button>
      </div>
      {open && (
        <div className="plan-body">
          {(!plan.weeklyPlan || plan.weeklyPlan.length === 0) ? (
            <p className="plan-empty">Your trainer hasn't added exercises yet. Check back soon!</p>
          ) : (
            <div className="plan-days-layout">
              <div className="plan-days-nav">
                {plan.weeklyPlan.map((day, i) => (
                  <button key={i}
                    className={`plan-day-btn ${activeDay === i ? 'active' : ''}`}
                    onClick={() => setActiveDay(activeDay === i ? null : i)}>
                    <strong>{day.dayName}</strong>
                    {day.focus && <span>{day.focus}</span>}
                    <span className="pdb-count">{day.exercises?.length || 0} exercises</span>
                  </button>
                ))}
              </div>
              {activeDay !== null && plan.weeklyPlan[activeDay] && (
                <div className="plan-exercises">
                  <div className="pe-header">
                    <h4>{plan.weeklyPlan[activeDay].dayName}</h4>
                    {plan.weeklyPlan[activeDay].focus && <span className="pe-focus">{plan.weeklyPlan[activeDay].focus}</span>}
                  </div>
                  {plan.weeklyPlan[activeDay].notes && (
                    <div className="pe-day-note">📋 {plan.weeklyPlan[activeDay].notes}</div>
                  )}
                  {(plan.weeklyPlan[activeDay].exercises || []).map((ex, j) => (
                    <div key={j} className="exercise-row">
                      <div className="er-num">{j+1}</div>
                      <div className="er-info">
                        <strong>{ex.name}</strong>
                        <div className="er-chips">
                          <span>{ex.sets} sets</span>
                          <span>{ex.reps} reps</span>
                          {ex.weight && <span>⚖️ {ex.weight}</span>}
                          {ex.restSeconds && <span>⏱ {ex.restSeconds}s rest</span>}
                        </div>
                        {ex.notes && <p className="er-notes">{ex.notes}</p>}
                        {ex.videoUrl && <VideoEmbed url={ex.videoUrl} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const [tab,          setTab]          = useState('sessions')
  const [appointments, setAppointments] = useState([])
  const [plans,        setPlans]        = useState([])
  const [progressLogs, setProgressLogs] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState('all')
  const [showLogModal, setShowLogModal] = useState(false)
  const [purchases,    setPurchases]    = useState([])
  const [ownedProgs,   setOwnedProgs]   = useState([])   // predefined programs unlocked via paid sessions
  const [profile,      setProfile]      = useState({ name: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [graphType,    setGraphType]    = useState('weight') // weight | fat | measurements | energy

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [apptRes, planRes, progRes, purchRes] = await Promise.all([
        appointmentsAPI.getMine(),
        workoutAPI.getMyPlans(),
        workoutAPI.getMyProgress({ limit: 60 }),
        purchasesAPI.mine().catch(() => ({ data: { data: [] } })),
      ])
      setAppointments(apptRes.data.data)
      setPlans(planRes.data.data)
      setProgressLogs(progRes.data.data)
      setPurchases(purchRes.data.data || [])
      setOwnedProgs(purchRes.data.owned || [])
    } catch { toast.error('Could not load dashboard') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const cancel = async (id) => {
    if (!window.confirm('Cancel this session?')) return
    try {
      await appointmentsAPI.cancel(id)
      setAppointments(p => p.map(a => a._id===id ? {...a,status:'cancelled'} : a))
      toast.success('Session cancelled')
    } catch(err) { toast.error(err.response?.data?.message || 'Failed') }
  }

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', phone: user.phone || '' })
  }, [user])

  const saveProfile = async () => {
    if (!profile.name.trim()) { toast.error('Name is required'); return }
    if (!/^\+\d{1,4}[\d\s-]{5,15}$/.test(profile.phone.trim()))
      { toast.error('Phone must include country code, e.g. +961 3 123456'); return }
    setSavingProfile(true)
    try {
      await authAPI.updateMe({ name: profile.name.trim(), phone: profile.phone.trim() })
      toast.success('Profile updated')
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed') }
    finally { setSavingProfile(false) }
  }

  const isCustomPurchase = (pc) => Boolean(pc.service?.isCustom || pc.service?.trainingType === 'self')
  const customPurchases   = purchases.filter(isCustomPurchase)
  const standardPurchases = purchases.filter(pc => !isCustomPurchase(pc))

  const payForPurchase = (purchase) => {
    sessionStorage.setItem('payState', JSON.stringify({
      purchaseId: purchase._id,
      totalAmount: purchase.amount,
      serviceName: purchase.service?.name,
      type: 'purchase',
    }))
    navigate('/pay')
  }

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter)
  const counts = {
    confirmed: appointments.filter(a => a.status==='confirmed').length,
    pending:   appointments.filter(a => a.status==='pending').length,
  }

  // Build chart data from progress logs
  const bodyLogs = [...progressLogs].filter(l => l.type === 'body').reverse()
  const wkLogs   = [...progressLogs].filter(l => l.type === 'workout').reverse()

  const weightData    = bodyLogs.filter(l => l.bodyWeight).map(l => ({ date: l.date, value: l.bodyWeight }))
  const fatData       = bodyLogs.filter(l => l.bodyFat).map(l => ({ date: l.date, value: l.bodyFat }))
  const measData      = bodyLogs.filter(l => l.waistCm || l.chestCm || l.armCm).map(l => ({ date: l.date, waist: l.waistCm, chest: l.chestCm, arm: l.armCm }))
  const energyData    = wkLogs.filter(l => l.energyLevel).map(l => ({ date: l.date, energy: l.energyLevel, duration: l.durationMins }))

  return (
    <div className="dashboard-page">
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-hero-bg"/>
        <div className="dash-hero-content">
          <h1>Welcome, {user?.name?.split(' ')[0]} 💪</h1>
          <p>Track your sessions, workouts and progress all in one place</p>
        </div>
        <Link to="/book" className="btn btn-accent dash-book-btn">
          <Plus size={15}/> Book Session
        </Link>
      </div>

      {/* Summary */}
      <div className="dash-summary">
        <div className="summary-card"><Dumbbell size={18}/><div><strong>{appointments.length}</strong><span>Total Sessions</span></div></div>
        <div className="summary-card green"><CheckCircle size={18}/><div><strong>{counts.confirmed}</strong><span>Confirmed</span></div></div>
        <div className="summary-card orange"><AlertCircle size={18}/><div><strong>{counts.pending}</strong><span>Pending</span></div></div>
        <div className="summary-card blue"><BarChart2 size={18}/><div><strong>{progressLogs.length}</strong><span>Progress Logs</span></div></div>
      </div>

      {/* Tab nav */}
      <div className="dash-tab-nav">
        {TABS.map(t => (
          <button key={t.key} className={`dash-tab-btn ${tab===t.key?'active':''}`} onClick={()=>setTab(t.key)}>
            {t.icon} {t.label}
            {t.key==='plans' && plans.length > 0 && <span className="tab-badge">{plans.length}</span>}
          </button>
        ))}
      </div>

      <div className="dash-body">
        {loading ? (
          <div className="dash-loading"><div className="spinner spinner-dark"/></div>
        ) : (
          <>
            {/* ── SESSIONS TAB ── */}
            {tab === 'sessions' && (
              <>
                <div className="dash-filters">
                  {['all','pending','confirmed','rejected','cancelled'].map(f => (
                    <button key={f} className={`filter-pill ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>
                      {f.charAt(0).toUpperCase()+f.slice(1)}
                    </button>
                  ))}
                </div>
                {filtered.length === 0 ? (
                  <div className="dash-empty">
                    <Calendar size={38}/>
                    <p>{filter==='all' ? "You haven't booked any sessions yet." : `No ${filter} sessions found.`}</p>
                    <Link to="/book" className="btn btn-primary">Book Your First Session</Link>
                  </div>
                ) : (
                  <div className="appt-list">
                    {(() => {
                      /* Group sessions bought together (bundle or multi-slot order)
                         into one card: chips for every date/time + purchase info */
                      const groups = []
                      const byKey  = {}
                      for (const a of filtered) {
                        const key = a.bundleGroupId || a.cyberSourceOrderId || a._id
                        if (!byKey[key]) { byKey[key] = { key, appts: [] }; groups.push(byKey[key]) }
                        byKey[key].appts.push(a)
                      }
                      // Newest booking/action first, regardless of status or session date.
                      groups.sort((g1, g2) =>
                        Math.max(...g2.appts.map(a => new Date(a.createdAt).getTime())) -
                        Math.max(...g1.appts.map(a => new Date(a.createdAt).getTime())))
                      return groups.map((g, i) => {
                        const first = g.appts[0]
                        const multi = g.appts.length > 1
                        const st    = STATUS_CFG[first.status] || STATUS_CFG.pending
                        const img   = first.service?.imageUrl || CAT_IMAGES[first.service?.category] || ''
                        const paidTotal = g.appts.filter(a => a.paymentStatus !== 'refunded').reduce((sum, a) => sum + Number(a.paidAmount || a.service?.price || 0), 0)
                        const refundedTotal = g.appts.filter(a => a.paymentStatus === 'refunded').reduce((sum, a) => sum + Number(a.paidAmount || a.service?.price || 0), 0)
                        const purchasedAt = first.paidAt ? format(new Date(first.paidAt), 'MMM d, yyyy · HH:mm') : null
                        return (
                          <div key={g.key} className="appt-card fade-up" style={{animationDelay:`${i*0.05}s`}}>
                            {img && <div className="appt-img-strip" style={{backgroundImage:`url(${img})`}}/>}
                            <div className="appt-status-bar" style={{background:st.color}}/>
                            <div className="appt-body">
                              <div className="appt-top">
                                <div className="appt-main">
                                  <strong>{first.service?.name || 'Training Session'}</strong>
                                  {multi && (
                                    <span className="chip chip-bundle" style={{marginLeft:8}}>
                                      <Package size={11}/> {first.isBundle ? 'Bundle · ' : ''}{g.appts.length} sessions
                                    </span>
                                  )}
                                  <div className="appt-chips" style={{marginTop:6}}>
                                    {g.appts.map(a => {
                                      const ast = STATUS_CFG[a.status] || STATUS_CFG.pending
                                      return (
                                        <span key={a._id} className="chip" title={ast.label}
                                              style={{display:'inline-flex',alignItems:'center',gap:4}}>
                                          <Calendar size={11}/>{a.date} <Clock size={11}/>{a.time}
                                          <span style={{color:ast.color,fontSize:'.72rem'}}>{ast.label}</span>
                                          {['pending','confirmed'].includes(a.status) && (
                                            <button className="btn-cancel" style={{padding:'0 4px',fontSize:'.7rem'}}
                                                    onClick={()=>cancel(a._id)}>✕</button>
                                          )}
                                        </span>
                                      )
                                    })}
                                    {first.service?.duration && <span className="chip">⏱ {first.service.duration}min</span>}
                                    {first.mode && <span className="chip">{first.mode === 'online' ? '💻 Online' : '🏟️ Live'}</span>}
                                  </div>
                                </div>
                                <span className="appt-badge" style={{background:st.bg,color:st.color}}>
                                  {st.icon} {st.label}
                                </span>
                              </div>
                              {g.appts.some(a => a.adminNote) && (
                                <div className="appt-note">Trainer note: {g.appts.find(a => a.adminNote)?.adminNote}</div>
                              )}
                              <div className="appt-paid">
                                {paidTotal > 0 && <>✅ Paid ${paidTotal}{purchasedAt ? <> · purchased {purchasedAt}</> : null}</>}
                                {refundedTotal > 0 && (
                                  <span style={{ marginLeft: paidTotal > 0 ? 8 : 0, color:'#7c3aed' }}>
                                    💸 Refunded ${refundedTotal}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                )}
              </>
            )}

            {/* ── PLANS TAB ── */}
            {/* ── MY PROGRAMS TAB (purchased self-training) ── */}
            {tab === 'programs' && (
              <>
                {standardPurchases.length === 0 && ownedProgs.length === 0 ? (
                  <div className="dash-empty">
                    <BookOpen size={40}/>
                    <p>No programs yet. Book sessions of a predefined program to unlock its content here, or get a custom program built just for you.</p>
                    <Link to="/services" className="btn btn-primary btn-sm">Browse Programs</Link>
                  </div>
                ) : (
                  <>
                    {ownedProgs.map(svc => <OwnedProgramCard key={svc._id} svc={svc}/>)}
                    {standardPurchases.map(pc => <ProgramCard key={pc._id} purchase={pc} onPayNow={payForPurchase} onGoPlans={() => setTab('plans')}/>)}
                  </>
                )}
              </>
            )}

            {/* ── PROFILE TAB ── */}
            {tab === 'profile' && (
              <div className="plan-card" style={{ maxWidth: 520 }}>
                <h3 style={{ marginTop:0 }}>My Personal Information</h3>
                <p style={{ fontSize:'.85rem', opacity:.7 }}>This is the information the trainer sees. Keep it up to date.</p>
                <div className="form-group">
                  <label>Full Name</label>
                  <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label>Phone (with country code)</label>
                  <input value={profile.phone} placeholder="+961 3 123456"
                         onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}/>
                </div>
                <div className="form-group">
                  <label>Email (cannot be changed)</label>
                  <input value={user?.email || ''} disabled style={{ opacity:.6 }}/>
                </div>
                <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}

            {tab === 'plans' && customPurchases.length > 0 && (
              <div style={{marginBottom:14}}>
                {customPurchases.map(pc => (
                  <div key={pc._id} className="plan-card" style={{marginBottom:10, borderLeft:'4px solid #7c3aed'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      <div>
                        <h3 style={{margin:0}}>🎯 {pc.service?.name}</h3>
                        <p style={{margin:'4px 0 0',fontSize:'.85rem',opacity:.75}}>
                          Purchased {pc.paidAt ? format(new Date(pc.paidAt), 'MMM d, yyyy') : ''} · ${pc.amount}
                          {pc.wantsNutrition && ' · 🥗 nutrition included'}
                        </p>
                      </div>
                      <span style={{fontSize:'.8rem',background:'#faf5ff',color:'#6b21a8',borderRadius:8,padding:'6px 10px'}}>
                        ⏳ Your trainer is building your personalized plan — it will appear below once ready.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'plans' && (
              <div className="plans-tab">
                {plans.length === 0 ? (
                  <div className="dash-empty">
                    <Dumbbell size={38}/>
                    <p>Your trainer hasn't assigned a workout plan yet.</p>
                    <p style={{fontSize:'0.85rem',color:'var(--grey)'}}>Book a session and ask your trainer to set up your program!</p>
                  </div>
                ) : (
                  <div className="plans-list">
                    {plans.map(plan => <PlanCard key={plan._id} plan={plan}/>)}
                  </div>
                )}
              </div>
            )}

            {/* ── PROGRESS TAB ── */}
            {tab === 'progress' && (
              <div className="progress-tab">
                <div className="progress-header">
                  <h3>Your Progress</h3>
                  <button className="btn btn-primary btn-sm" onClick={()=>setShowLogModal(true)}>
                    <Plus size={14}/> Log Progress
                  </button>
                </div>

                {progressLogs.length === 0 ? (
                  <div className="dash-empty">
                    <TrendingUp size={38}/>
                    <p>No progress data yet. Start logging to see your charts!</p>
                    <button className="btn btn-primary" onClick={()=>setShowLogModal(true)}>Log Your First Entry</button>
                  </div>
                ) : (
                  <>
                    {/* Graph type selector */}
                    <div className="graph-tabs">
                      {[
                        { key:'weight', label:'⚖️ Body Weight' },
                        { key:'fat',    label:'📊 Body Fat %' },
                        { key:'measurements', label:'📏 Measurements' },
                        { key:'energy', label:'⚡ Workout Energy' },
                      ].map(g => (
                        <button key={g.key} className={`graph-tab-btn ${graphType===g.key?'active':''}`} onClick={()=>setGraphType(g.key)}>
                          {g.label}
                        </button>
                      ))}
                    </div>

                    <div className="chart-box">
                      {graphType === 'weight' && (
                        weightData.length < 2 ? <div className="chart-nodata">Log at least 2 body weight entries to see this chart.</div> : (
                          <>
                            <div className="chart-title">Body Weight (kg)</div>
                            <ResponsiveContainer width="100%" height={260}>
                              <AreaChart data={weightData}>
                                <defs>
                                  <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#1E40AF" stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor="#1E40AF" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                                <XAxis dataKey="date" tick={{fontSize:11}} tickFormatter={d=>d.slice(5)}/>
                                <YAxis tick={{fontSize:11}} domain={['auto','auto']}/>
                                <Tooltip formatter={(v)=>[`${v} kg`,'Weight']} labelStyle={{fontSize:12}}/>
                                <Area type="monotone" dataKey="value" stroke="#1E40AF" strokeWidth={2.5} fill="url(#wg)" dot={{r:4, fill:'#1E40AF'}} activeDot={{r:6}}/>
                              </AreaChart>
                            </ResponsiveContainer>
                          </>
                        )
                      )}
                      {graphType === 'fat' && (
                        fatData.length < 2 ? <div className="chart-nodata">Log at least 2 body fat entries to see this chart.</div> : (
                          <>
                            <div className="chart-title">Body Fat (%)</div>
                            <ResponsiveContainer width="100%" height={260}>
                              <AreaChart data={fatData}>
                                <defs>
                                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                                <XAxis dataKey="date" tick={{fontSize:11}} tickFormatter={d=>d.slice(5)}/>
                                <YAxis tick={{fontSize:11}} domain={['auto','auto']} unit="%"/>
                                <Tooltip formatter={(v)=>[`${v}%`,'Body Fat']}/>
                                <Area type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2.5} fill="url(#fg)" dot={{r:4, fill:'#F59E0B'}}/>
                              </AreaChart>
                            </ResponsiveContainer>
                          </>
                        )
                      )}
                      {graphType === 'measurements' && (
                        measData.length < 2 ? <div className="chart-nodata">Log at least 2 measurement entries to see this chart.</div> : (
                          <>
                            <div className="chart-title">Body Measurements (cm)</div>
                            <ResponsiveContainer width="100%" height={260}>
                              <LineChart data={measData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                                <XAxis dataKey="date" tick={{fontSize:11}} tickFormatter={d=>d.slice(5)}/>
                                <YAxis tick={{fontSize:11}} domain={['auto','auto']} unit="cm"/>
                                <Tooltip formatter={(v,name)=>[`${v} cm`, name]} labelStyle={{fontSize:12}}/>
                                <Legend wrapperStyle={{fontSize:'12px'}}/>
                                <Line type="monotone" dataKey="chest" stroke="#1E40AF" strokeWidth={2} dot={{r:3}} name="Chest"/>
                                <Line type="monotone" dataKey="waist" stroke="#EF4444" strokeWidth={2} dot={{r:3}} name="Waist"/>
                                <Line type="monotone" dataKey="arm"   stroke="#10B981" strokeWidth={2} dot={{r:3}} name="Arm"/>
                              </LineChart>
                            </ResponsiveContainer>
                          </>
                        )
                      )}
                      {graphType === 'energy' && (
                        energyData.length < 2 ? <div className="chart-nodata">Log at least 2 workout sessions to see this chart.</div> : (
                          <>
                            <div className="chart-title">Workout Energy Level (1-5) & Duration</div>
                            <ResponsiveContainer width="100%" height={260}>
                              <BarChart data={energyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                                <XAxis dataKey="date" tick={{fontSize:11}} tickFormatter={d=>d.slice(5)}/>
                                <YAxis yAxisId="left" tick={{fontSize:11}} domain={[0,5]}/>
                                <YAxis yAxisId="right" orientation="right" tick={{fontSize:11}} unit="min"/>
                                <Tooltip/>
                                <Legend wrapperStyle={{fontSize:'12px'}}/>
                                <Bar yAxisId="left" dataKey="energy" name="Energy (1-5)" fill="#1E40AF" radius={[4,4,0,0]}/>
                                <Bar yAxisId="right" dataKey="duration" name="Duration (min)" fill="#F59E0B" radius={[4,4,0,0]}/>
                              </BarChart>
                            </ResponsiveContainer>
                          </>
                        )
                      )}
                    </div>

                    {/* Recent logs table */}
                    <div className="logs-table">
                      <h4>Recent Logs</h4>
                      {progressLogs.slice(0, 10).map((log, i) => (
                        <div key={log._id} className="log-row fade-up" style={{animationDelay:`${i*0.04}s`}}>
                          <span className={`log-type-badge ${log.type}`}>{log.type === 'body' ? '📏 Body' : '💪 Workout'}</span>
                          <span className="log-date">{log.date}</span>
                          {log.type === 'body' && (
                            <span className="log-vals">
                              {log.bodyWeight && `${log.bodyWeight}kg`}
                              {log.bodyFat && ` · ${log.bodyFat}% fat`}
                              {log.waistCm && ` · ${log.waistCm}cm waist`}
                            </span>
                          )}
                          {log.type === 'workout' && (
                            <span className="log-vals">
                              {log.sessionTitle || 'Session'} · {log.durationMins}min · ⚡{log.energyLevel}/5
                            </span>
                          )}
                          {log.notes && <span className="log-note">{log.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── NUTRITION TAB ── */}
            {tab === 'nutrition' && (
              <div className="nutrition-tab">
                <div className="dash-empty">
                  <Apple size={38}/>
                  <p>🚧 Nutrition — Coming Soon</p>
                  <p style={{fontSize:'0.85rem',color:'var(--grey)'}}>
                    Personalized nutrition plans are temporarily paused. Check back soon!
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showLogModal && <LogModal onClose={()=>setShowLogModal(false)} onLogged={loadAll}/>}
    </div>
  )
}
