import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, Eye, EyeOff, CheckCircle, Dumbbell } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '../utils/countryCodes'
import './AuthPages.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ name:'', email:'', phone:'', password:'', confirmPassword:'' })
  const [countryName, setCountryName] = useState('Lebanon')
  const countryCode = COUNTRY_CODES.find(c => c.name === countryName)?.code || DEFAULT_COUNTRY_CODE
  const [showPw,   setShowPw]   = useState(false)
  const [showCPw,  setShowCPw]  = useState(false)
  const [loading,  setLoading]  = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const pwMatch   = form.confirmPassword.length > 0 && form.password === form.confirmPassword
  const pwNoMatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.name || !form.email || !form.phone || !form.password || !form.confirmPassword)
      { toast.error('Please fill in all fields'); return }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return }
    setLoading(true)
    try {
      const { confirmPassword, ...payload } = form
      // Combine country code + local number into international format
      payload.phone = `${countryCode} ${form.phone.replace(/^0+/, '').trim()}`
      const res = await authAPI.register(payload)
      login(res.data.token, res.data.user)
      toast.success(`Welcome, ${res.data.user.name.split(' ')[0]}! Let's get started 💪`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-brand"><Dumbbell size={32}/></div>
          <h2>Join Us Today</h2>
          <p>Create an account and start your fitness transformation journey.</p>
          <div className="auth-features">
            <div className="af-item">⚡ Book sessions online 24/7</div>
            <div className="af-item">✅ Get instant confirmations</div>
            <div className="af-item">📋 Track all your sessions</div>
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-card fade-up">
          <div className="auth-header">
            <h1>Create Account</h1>
            <p>Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="Your full name" value={form.name} onChange={set('name')} autoComplete="name"/>
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email"/>
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <div style={{ display:'flex', gap:'8px' }}>
                <select
                  value={countryName}
                  onChange={e => setCountryName(e.target.value)}
                  aria-label="Country"
                  style={{ flex:'0 0 170px', minWidth:0 }}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.name} value={c.name}>{c.flag} {c.name} ({c.code})</option>
                  ))}
                </select>
                <input type="tel" placeholder="3 123 456" value={form.phone}
                       onChange={set('phone')} autoComplete="tel" style={{ flex:1 }}/>
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="pw-wrap">
                <input type={showPw?'text':'password'} placeholder="Min. 8 characters, 1 uppercase, 1 number" value={form.password} onChange={set('password')} autoComplete="new-password"/>
                <button type="button" className="pw-toggle" onClick={()=>setShowPw(s=>!s)}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <div className={`pw-wrap ${pwMatch?'pw-match':''} ${pwNoMatch?'pw-nomatch':''}`}>
                <input type={showCPw?'text':'password'} placeholder="Re-enter your password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password"/>
                <button type="button" className="pw-toggle" onClick={()=>setShowCPw(s=>!s)}>
                  {showCPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
                {pwMatch && <CheckCircle size={16} className="pw-check-icon match"/>}
              </div>
              {pwNoMatch && <p className="pw-error">Passwords do not match</p>}
              {pwMatch   && <p className="pw-ok">Passwords match ✓</p>}
            </div>
            <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? <div className="spinner"/> : <><UserPlus size={16}/> Create Account</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
