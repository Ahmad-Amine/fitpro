import React, { useState } from 'react'
import toast from 'react-hot-toast'

export default function IntakeModal({ svc, busy, onCancel, onSubmit, requireIntake = true }) {
  const [form, setForm] = useState({ daysPerWeek:'3', weightKg:'', heightCm:'', age:'', goal:'Build muscle', notes:'' })
  // Nutrition add-on is not available for purchase yet — always false.
  const wantsNutrition = false
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const total = Number(svc.price)
  const submit = () => {
    if (requireIntake && (!form.weightKg || !form.age)) { toast.error('Please fill in your weight and age'); return }
    onSubmit(svc, requireIntake ? {
      daysPerWeek: Number(form.daysPerWeek), weightKg: Number(form.weightKg),
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      age: Number(form.age), goal: form.goal, notes: form.notes,
    } : null, wantsNutrition)
  }
  return (
    <div className="modal-overlay" onClick={onCancel} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:'22px 20px',width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto'}}>
        <h3 style={{marginTop:0}}>{requireIntake ? '🎯' : '📋'} {svc.name}</h3>
        {requireIntake ? (
          <>
            <p style={{fontSize:'.86rem',opacity:.75,marginTop:-6}}>Answer a few questions so your trainer can build the right plan for you.</p>
            <div className="form-group"><label>Training days per week *</label>
              <select value={form.daysPerWeek} onChange={set('daysPerWeek')}>
                {[1,2,3,4,5,6,7].map(d=><option key={d} value={d}>{d} day{d>1?'s':''}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:10}}>
              <div className="form-group" style={{flex:1}}><label>Weight (kg) *</label>
                <input type="number" min="20" max="400" value={form.weightKg} onChange={set('weightKg')} placeholder="e.g. 75"/></div>
              <div className="form-group" style={{flex:1}}><label>Height (cm)</label>
                <input type="number" min="80" max="260" value={form.heightCm} onChange={set('heightCm')} placeholder="e.g. 175"/></div>
              <div className="form-group" style={{flex:1}}><label>Age *</label>
                <input type="number" min="10" max="100" value={form.age} onChange={set('age')} placeholder="e.g. 28"/></div>
            </div>
            <div className="form-group"><label>Main goal</label>
              <select value={form.goal} onChange={set('goal')}>
                {['Build muscle','Lose weight','Get fitter','Strength','Rehab / mobility','Sport performance','Other'].map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Injuries or notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Anything your trainer should know..."/></div>
          </>
        ) : (
          <p style={{fontSize:'.86rem',opacity:.75,marginTop:-6}}>Confirm your purchase below — its full content unlocks immediately after payment.</p>
        )}
        <label aria-disabled="true"
             style={{background:'#f3f4f6', border:'2px solid #e5e7eb',
                     borderRadius:10, padding:'10px 12px', margin:'8px 0', cursor:'not-allowed', userSelect:'none',
                     display:'flex', alignItems:'center', gap:10, opacity:.65}}>
          <span aria-hidden="true" style={{width:22,height:22,minWidth:22,borderRadius:6,display:'inline-flex',alignItems:'center',justifyContent:'center',
                 background:'#fff', border:'2px solid #d1d5db'}}/>
          <span>🥗 Personalized <strong>nutrition plan</strong> — <em>Coming soon</em></span>
        </label>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14}}>
          <strong style={{fontSize:'1.05rem'}}>Total: ${total}</strong>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>
              {busy ? 'Starting…' : `Continue to Payment`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}