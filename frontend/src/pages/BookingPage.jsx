import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, ChevronRight, ChevronLeft, CheckCircle, X, Package, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { appointmentsAPI, availabilityAPI, settingsAPI } from '../services/api'
import { format, addDays, startOfToday, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isBefore, isAfter, isSameDay } from 'date-fns'
import './BookingPage.css'

const STEPS = ['Dates & Times','Bundle','Review']

export default function BookingPage() {
  const navigate  = useNavigate()
  const [step,      setStep]      = useState(1)
  const [bundles,   setBundles]   = useState([])
  const [selBundle, setSelBundle] = useState(null) // null = no bundle

  // Multi-date: array of { date: Date, time: string, mode }
  const [selSlots,  setSelSlots]  = useState([])

  // For the calendar+time picker
  const [calMonth,  setCalMonth]  = useState(startOfToday())
  const [focusDate, setFocusDate] = useState(null)   // which date we're picking time for
  const [slotsMap,  setSlotsMap]  = useState({})     // { 'YYYY-MM-DD': [{time,available}] }
  const [loadingSlots, setLoadingSlots] = useState({})
  const [notes,     setNotes]     = useState('')
  const [priceLive,   setPriceLive]   = useState(0)
  const [priceOnline, setPriceOnline] = useState(0)
  const [submitting,setSubmitting]= useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [bookedAppts, setBookedAppts] = useState([])

  const today = startOfToday()
  const maxDate = addDays(today, 30)

  useEffect(() => {
    settingsAPI.get().then(r => {
      setPriceLive(Number(r.data.data?.sessionPriceLive || 0))
      setPriceOnline(Number(r.data.data?.sessionPriceOnline || 0))
    }).catch(() => {})
    appointmentsAPI.getBundles().then(r => setBundles(r.data.data || [])).catch(() => {})
  }, [])

  // Only global bundles (not tied to a specific program) apply here now —
  // appointments are booked independently of any program purchase.
  const applicableBundles = bundles.filter(b => !b.service)

  const loadSlots = useCallback(async (dateStr) => {
    if (slotsMap[dateStr] !== undefined) return
    setLoadingSlots(p => ({ ...p, [dateStr]: true }))
    try {
      const r = await availabilityAPI.getSlots(dateStr)
      setSlotsMap(p => ({ ...p, [dateStr]: r.data.slots || [] }))
    } catch {
      setSlotsMap(p => ({ ...p, [dateStr]: [] }))
    } finally {
      setLoadingSlots(p => ({ ...p, [dateStr]: false }))
    }
  }, [slotsMap])

  const handleDateClick = (day) => {
    if (isBefore(day, today) || isAfter(day, maxDate)) return
    const dateStr = format(day, 'yyyy-MM-dd')
    const alreadySelected = selSlots.find(s => format(s.date, 'yyyy-MM-dd') === dateStr)
    if (alreadySelected) {
      // Toggle off this date
      setSelSlots(p => p.filter(s => format(s.date, 'yyyy-MM-dd') !== dateStr))
      if (focusDate && format(focusDate, 'yyyy-MM-dd') === dateStr) setFocusDate(null)
    } else {
      loadSlots(dateStr)
      setFocusDate(day)
    }
  }

  const handleTimeSelect = (day, time) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    const existing = selSlots.findIndex(s => format(s.date, 'yyyy-MM-dd') === dateStr)
    if (existing >= 0) {
      setSelSlots(p => p.map((s, i) => i === existing ? { ...s, time } : s))
    } else {
      setSelSlots(p => [...p, { date: day, time }])
    }
  }

  const removeSlot = (dateStr) => {
    setSelSlots(p => p.filter(s => format(s.date, 'yyyy-MM-dd') !== dateStr))
    if (focusDate && format(focusDate, 'yyyy-MM-dd') === dateStr) setFocusDate(null)
  }

  // Calendar grid
  const calDays = () => {
    const first = startOfMonth(calMonth)
    const last  = endOfMonth(calMonth)
    const days  = eachDayOfInterval({ start: first, end: last })
    const padStart = getDay(first)
    return { days, padStart }
  }
  const { days, padStart } = calDays()

  const isSelDate = (day) => selSlots.some(s => isSameDay(s.date, day))
  const isFocused = (day) => focusDate && isSameDay(focusDate, day)
  const isDisabled = (day) => isBefore(day, today) || isAfter(day, maxDate)
  const slotForDate = (day) => selSlots.find(s => isSameDay(s.date, day))

  // Pricing
  /* Price of one session in a given mode (live/online), from admin settings */
  const priceFor = (mode) => mode === 'online' ? priceOnline : priceLive
  const slotPrice   = (s) => priceFor(s.mode || 'live')
  const sessionsSum = () => selSlots.reduce((sum, s) => sum + slotPrice(s), 0)
  /* Toggle one slot between live and online */
  const toggleSlotMode = (idx) => setSelSlots(prev =>
    prev.map((s, i) => i === idx ? { ...s, mode: (s.mode || 'live') === 'live' ? 'online' : 'live' } : s))

  const totalPrice = () => (selBundle && selSlots.length > 0) ? selBundle.price : sessionsSum()
  const allSlotsHaveTime = selSlots.length > 0 && selSlots.every(s => !!s.time)

  const handleBook = async () => {
    if (selSlots.length === 0 || !allSlotsHaveTime) {
      toast.error('Please complete all selections'); return
    }
    setSubmitting(true)
    try {
      const slots = selSlots.map(s => ({ date: format(s.date, 'yyyy-MM-dd'), time: s.time, mode: s.mode || 'live' }))
      let res
      if (slots.length === 1 && !selBundle) {
        res = await appointmentsAPI.create({ mode: slots[0].mode, date: slots[0].date, time: slots[0].time, notes })
      } else {
        res = await appointmentsAPI.createMulti({ slots, notes, bundleId: selBundle?._id || null })
      }
      const booked = res.data.data || []
      setBookedAppts(booked)

      // Navigate to payment page with appointment IDs and amount
      const appointmentIds = booked.map(a => a._id)
      const payState = {
        appointmentIds,
        totalAmount:  totalPrice(),
        sessionCount: selSlots.length,
        programName:  'Training Session',
        currency:     'USD',
      }
      sessionStorage.setItem('payState', JSON.stringify(payState))
      navigate('/pay', { state: payState })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed')
    } finally { setSubmitting(false) }
  }

  if (submitted) {
    return (
      <div className="booking-success">
        <div className="success-card fade-up">
          <div className="success-icon"><CheckCircle size={52}/></div>
          <h2>Sessions Booked! 💪</h2>
          <p>{bookedAppts.length} session{bookedAppts.length !== 1 ? 's' : ''} submitted and awaiting confirmation.</p>
          {selBundle && <div className="success-bundle-tag"><Package size={14}/> {selBundle.name} applied · ${selBundle.price}</div>}
          <div className="success-sessions">
            {selSlots.map((s, i) => (
              <div key={i} className="ss-row">
                <span className="ss-num">{i+1}</span>
                <span>{format(s.date, 'EEE, MMM d')}</span>
                <span className="ss-time"><Clock size={12}/>{s.time}</span>
                <span className="ss-price">${selBundle ? (selBundle.price/selBundle.sessions).toFixed(0) : slotPrice(s)}</span>
              </div>
            ))}
            <div className="ss-total">Total: <strong>${totalPrice()}</strong></div>
          </div>
          <div className="success-actions">
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>View My Sessions</button>
            <button className="btn btn-outline" onClick={() => { setStep(1); setSelBundle(null); setSelSlots([]); setNotes(''); setSubmitted(false); }}>Book More</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="booking-page">
      <div className="booking-hero">
        <h1>Book an Appointment</h1>
        <p>Pick your dates and times, and book multiple sessions at once</p>
      </div>

      {/* Stepper */}
      <div className="stepper">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`step ${step > i+1 ? 'done' : ''} ${step === i+1 ? 'active' : ''}`}
                 onClick={() => step > i+1 && setStep(i+1)} style={{cursor: step > i+1 ? 'pointer' : 'default'}}>
              <div className="step-num">{step > i+1 ? <CheckCircle size={13}/> : i+1}</div>
              <span>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`step-line ${step > i+1 ? 'done' : ''}`}/>}
          </React.Fragment>
        ))}
      </div>

      <div className="booking-body">

        {/* ── STEP 1: Calendar + Time ── */}
        {step === 1 && (
          <div className="step-panel fade-up">
            <div className="step2-header">
              <div>
                <h2>Choose Your Dates</h2>
                <p className="step-sub">Select one or multiple dates. Click a date to pick a time slot.</p>
              </div>
              {selSlots.length > 0 && (
                <div className="sel-count-badge">{selSlots.length} date{selSlots.length > 1 ? 's' : ''} selected</div>
              )}
            </div>

            <div className="cal-layout">
              {/* Calendar */}
              <div className="calendar-box">
                <div className="cal-nav">
                  <button className="cal-nav-btn" onClick={() => setCalMonth(m => addDays(startOfMonth(m), -1))}>
                    <ChevronLeft size={16}/>
                  </button>
                  <span>{format(calMonth, 'MMMM yyyy')}</span>
                  <button className="cal-nav-btn" onClick={() => setCalMonth(m => addDays(endOfMonth(m), 1))}>
                    <ChevronRight size={16}/>
                  </button>
                </div>
                <div className="cal-weekdays">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="cal-grid">
                  {[...Array(padStart)].map((_, i) => <div key={`pad-${i}`} className="cal-cell empty"/>)}
                  {days.map(day => {
                    const disabled = isDisabled(day)
                    const selected = isSelDate(day)
                    const focused  = isFocused(day)
                    const slot     = slotForDate(day)
                    return (
                      <div key={day.toISOString()}
                           className={`cal-cell ${disabled ? 'disabled' : 'available'} ${selected ? 'selected' : ''} ${focused ? 'focused' : ''}`}
                           onClick={() => !disabled && handleDateClick(day)}>
                        <span className="cal-day-num">{format(day, 'd')}</span>
                        {selected && slot?.time && <span className="cal-time-chip">{slot.time}</span>}
                        {selected && !slot?.time && <span className="cal-time-chip pending">Pick time</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="cal-legend">
                  <span className="leg-item"><span className="leg-dot selected"/><span>Selected</span></span>
                  <span className="leg-item"><span className="leg-dot available"/><span>Available</span></span>
                  <span className="leg-item"><span className="leg-dot disabled"/><span>Unavailable</span></span>
                </div>
              </div>

              {/* Time picker panel */}
              <div className="time-panel">
                {!focusDate ? (
                  <div className="time-panel-empty">
                    <Calendar size={32}/>
                    <p>Click a date on the calendar to pick a time slot</p>
                  </div>
                ) : (
                  <>
                    <h4>Time slots for {format(focusDate, 'EEE, MMM d')}</h4>
                    {loadingSlots[format(focusDate, 'yyyy-MM-dd')] ? (
                      <div className="tp-loading"><div className="spinner spinner-dark"/></div>
                    ) : (slotsMap[format(focusDate, 'yyyy-MM-dd')] || []).length === 0 ? (
                      <p className="tp-empty">No available slots for this date.</p>
                    ) : (
                      <div className="tp-slots">
                        {(slotsMap[format(focusDate, 'yyyy-MM-dd')] || []).map((s, i) => {
                          const curSlot = slotForDate(focusDate)
                          return (
                            <button key={i}
                              className={`tp-slot ${!s.available || s.isPast ? 'taken' : ''} ${curSlot?.time === s.time ? 'selected' : ''}`}
                              onClick={() => { if (s.available && !s.isPast) { handleTimeSelect(focusDate, s.time) } }}
                              disabled={!s.available || s.isPast}>
                              {s.time}
                              {s.isPast && <small>Passed</small>}
                              {!s.isPast && !s.available && <small>Booked</small>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* Selected slots summary */}
                {selSlots.length > 0 && (
                  <div className="sel-slots-list">
                    <h5>Your selected sessions</h5>
                    {selSlots.map((s, i) => (
                      <div key={i} className={`ssl-row ${!s.time ? 'no-time' : ''}`}>
                        <span className="ssl-num">{i+1}</span>
                        <span>{format(s.date, 'EEE, MMM d')}</span>
                        {s.time ? <span className="ssl-time"><Clock size={11}/>{s.time}</span> : <span className="ssl-warn">No time yet</span>}
                        {!selBundle && (
                          <button type="button" className="btn btn-sm btn-outline" style={{padding:'2px 8px',fontSize:'.74rem'}}
                                  title="Switch between live and online for this session"
                                  onClick={() => toggleSlotMode(i)}>
                            {(s.mode || 'live') === 'live' ? <>🏟️ Live · ${priceFor('live')}</> : <>💻 Online · ${priceFor('online')}</>}
                          </button>
                        )}
                        <button className="ssl-remove" onClick={() => removeSlot(format(s.date, 'yyyy-MM-dd'))}><X size={12}/></button>
                      </div>
                    ))}
                    {!selBundle && selSlots.length > 0 && (
                      <p style={{fontSize:'.78rem',opacity:.7,margin:'6px 0'}}>💡 Tap the Live/Online button on each session to switch it — you can mix both, each priced separately.</p>
                    )}
                    <div className="ssl-price">
                      {selBundle
                        ? <><Package size={13}/> Bundle price: <strong>${selBundle.price}</strong></>
                        : <><span>Sessions total:</span> <strong>${sessionsSum()}</strong> ({selSlots.filter(x=>(x.mode||'live')==='live').length} live · {selSlots.filter(x=>x.mode==='online').length} online)</>
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="step-actions">
              <button className="btn btn-primary"
                disabled={selSlots.length === 0 || !allSlotsHaveTime}
                onClick={() => setStep(2)}>
                {selSlots.length === 0 ? 'Select at least 1 date' : !allSlotsHaveTime ? 'Pick times for all dates' : `Next: Bundle →`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Bundle ── */}
        {step === 2 && (
          <div className="step-panel fade-up">
            <h2>Apply a Bundle (Optional)</h2>
            <p className="step-sub">Bundles give you a flat price for multiple sessions. Or skip and pay per session.</p>

            <div className="bundle-grid">
              {/* No bundle option */}
              <div className={`bundle-card ${!selBundle ? 'selected' : ''}`} onClick={() => setSelBundle(null)}>
                <div className="bc-icon">💵</div>
                <div className="bc-info">
                  <strong>Pay Per Session</strong>
                  <p>{selSlots.length} session{selSlots.length > 1 ? 's' : ''} · {selSlots.filter(x=>(x.mode||'live')==='live').length} live, {selSlots.filter(x=>x.mode==='online').length} online</p>
                </div>
                <div className="bc-price">${totalPrice()}</div>
                {!selBundle && <CheckCircle size={20} className="bc-check" color="var(--primary)"/>}
              </div>

              {applicableBundles.length === 0 && (
                <div className="bundle-empty"><Info size={18}/><p>No bundles available right now.</p></div>
              )}

              {applicableBundles.map(b => {
                const valid           = selSlots.length <= b.sessions
                const pricePerSession = priceLive
                const fullPrice       = pricePerSession * Number(b.sessions)
                const bundlePrice     = Number(b.price)
                const savings         = fullPrice - bundlePrice

                return (
                  <div key={b._id}
                    className={`bundle-card ${selBundle?._id === b._id ? 'selected' : ''} ${!valid ? 'bundle-disabled' : ''}`}
                    onClick={() => valid && setSelBundle(b)}>
                    <div className="bc-icon"><Package size={22}/></div>
                    <div className="bc-info">
                      <strong>{b.name}</strong>
                      <p>Up to {b.sessions} sessions · valid {b.validDays} days</p>
                      {!valid && <span className="bc-warn">You selected {selSlots.length} sessions (max {b.sessions})</span>}
                      {valid && savings > 0 && (
                        <span className="bc-save">
                          🎉 Save ${savings} — {b.sessions} sessions for ${bundlePrice} instead of ${fullPrice}
                        </span>
                      )}
                      {valid && savings <= 0 && (
                        <span className="bc-warn">Same price as paying per session</span>
                      )}
                      {b.description && <p className="bc-desc">{b.description}</p>}
                    </div>
                    <div className="bc-price">${b.price}<small>flat</small></div>
                    {selBundle?._id === b._id && <CheckCircle size={20} className="bc-check" color="var(--primary)"/>}
                  </div>
                )
              })}
            </div>

            <div className="bundle-total">
              {selBundle
                ? <><Package size={16}/> Bundle: {selBundle.name} · <strong>${selBundle.price} flat</strong></>
                : <><span>Total:</span> <strong>${totalPrice()}</strong></>
              }
            </div>

            <div className="step-actions">
              <button className="btn btn-outline" onClick={() => setStep(1)}><ChevronLeft size={16}/> Back</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Review Booking <ChevronRight size={16}/></button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Review ── */}
        {step === 3 && (
          <div className="step-panel fade-up">
            <h2>Review & Confirm</h2>
            <div className="review-card">
              <div className="review-row"><span>Sessions</span><strong>{selSlots.length}</strong></div>
              {selBundle && <div className="review-row"><span>Bundle</span><strong><Package size={13}/> {selBundle.name}</strong></div>}
              <div className="review-sessions">
                {selSlots.map((s, i) => (
                  <div key={i} className="rs-row">
                    <span className="rs-n">{i+1}</span>
                    <span>{format(s.date, 'EEE, MMMM d')}</span>
                    <span><Clock size={11}/> {s.time}</span>
                    {!selBundle && <span>{(s.mode||'live')==='live' ? '🏟️ Live' : '💻 Online'} · ${slotPrice(s)}</span>}
                  </div>
                ))}
              </div>
              <div className="review-row total">
                <span>{selBundle ? 'Total (bundle)' : 'Total'}</span>
                <strong>${totalPrice()}</strong>
              </div>
            </div>
            <div className="form-group" style={{marginTop:'16px'}}>
              <label>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Injuries, goals, or anything your trainer should know..."/>
            </div>
            <div className="step-actions">
              <button className="btn btn-outline" onClick={() => setStep(2)}><ChevronLeft size={16}/> Back</button>
              <button className="btn btn-primary" onClick={handleBook} disabled={submitting}>
                {submitting ? <><div className="spinner"/> Processing...</> : <>Confirm & Pay ${totalPrice()} 💳</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
