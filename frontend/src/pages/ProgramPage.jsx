import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Clock, DollarSign, ArrowLeft } from 'lucide-react'
import { servicesAPI, purchasesAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import IntakeModal from '../components/IntakeModal'
import toast from 'react-hot-toast'
import './ProgramPage.css'

const CAT_IMAGES = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900&q=80',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=80',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900&q=80',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=900&q=80',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&q=80',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=900&q=80',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900&q=80',
}

export default function ProgramPage() {
  const { user }     = useAuth()
  const { id }       = useParams()
  const navigate     = useNavigate()
  const [svc,        setSvc]        = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [showIntake, setShowIntake] = useState(false)
  const [buying,     setBuying]     = useState(false)

  useEffect(() => {
    servicesAPI.getById(id).then(svcRes => {
      setSvc(svcRes.data.data)
    }).catch(() => {
      toast.error('Program not found')
      navigate('/services')
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'60vh'}}>
      <div className="spinner spinner-dark"/>
    </div>
  )
  if (!svc) return null

  const isCustom = svc.trainingType === 'self'

  const handleBuyClick = () => {
    if (!user) { toast('Please sign in to purchase a program'); navigate('/login'); return }
    setShowIntake(true)
  }

  const startPurchase = async (svcArg, intake, wantsNutrition) => {
    setBuying(true)
    try {
      const res = await purchasesAPI.create(svcArg._id, { wantsNutrition, intake })
      const purchase = res.data.data
      sessionStorage.setItem('payState', JSON.stringify({
        purchaseId: purchase._id, totalAmount: purchase.amount,
        serviceName: svcArg.name, type: 'purchase', isCustom: svcArg.trainingType === 'self',
      }))
      navigate('/pay')
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not start purchase'
      toast.error(msg)
      if (err.response?.status === 409) navigate('/dashboard')
    } finally { setBuying(false); setShowIntake(false) }
  }

  return (
    <div className="program-page">
      {/* Hero */}
      <div className="pp-hero">
        <img
          src={svc.imageUrl || CAT_IMAGES[svc.category] || CAT_IMAGES.Other}
          alt={svc.name}
          className="pp-hero-img"
        />
        <div className="pp-hero-overlay"/>
        <div className="pp-hero-content">
          <Link to="/services" className="pp-back-btn">
            <ArrowLeft size={16}/> All Programs
          </Link>
          <span className="pp-cat-badge">{svc.category}</span>
          <h1>{svc.name}</h1>
          <div className="pp-hero-meta">
            <span><DollarSign size={16}/> ${svc.price} one-time</span>
            <span><Clock size={16}/> {svc.duration} min</span>
          </div>
        </div>
      </div>

      <div className="pp-body">
        <div className="pp-grid">

          {/* ── Left — main content ── */}
          <div className="pp-main">

            {/* Description */}
            <div className="pp-section">
              <h2>About This Program</h2>
              <p className="pp-desc">{svc.description}</p>
            </div>

            {/* Dynamic Sections */}
            {svc.sectionsLocked && (
              <div style={{ margin:'0 0 18px', padding:'14px 16px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:10, color:'#92400e' }}>
                🔒 <strong>The full content of this program is locked.</strong> You can preview the section titles below —
                {svc.isCustom
                  ? ' this is a personalized program — after purchase, your trainer builds your plan just for you in "My Plans".'
                  : ' purchase the program to unlock every item, exercise and detail instantly in your dashboard.'}
              </div>
            )}
            {svc.sections && svc.sections.length > 0 && svc.sections.map((sec, si) => (
              <div key={si} className="pp-section">
                <h2>{sec.heading}</h2>
                {sec.items && sec.items.length > 0 ? (
                  <ul className="pp-section-items">
                    {sec.items.map((item, ii) => (
                      <li key={ii} className="pp-section-item">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.title||'item'} className="pp-item-img"/>
                        )}
                        <div className="pp-item-content">
                          {item.title && (
                            <div className="pp-item-title">
                              <span className="pp-item-bullet"/>
                              <strong>{item.title}</strong>
                            </div>
                          )}
                          {item.description && (
                            <p className="pp-item-desc">{item.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  svc.sectionsLocked
                    ? <p className="pp-section-empty">🔒 {sec.itemCount || ''} item{(sec.itemCount||0) !== 1 ? 's' : ''} hidden — unlock by purchasing this program.</p>
                    : <p className="pp-section-empty">No items added yet.</p>
                )}
              </div>
            ))}

          </div>

          {/* ── Right — sidebar ── */}
          <div className="pp-sidebar">

            {/* Price card */}
            <div className="pp-price-card">
              <div className="pp-price-top">
                <span className="pp-price">${svc.price}</span>
                <span className="pp-price-label">one-time</span>
              </div>
              <div className="pp-price-meta">
                <Clock size={14}/> {svc.duration} min
              </div>
              <button className="btn btn-primary pp-book-btn" disabled={buying} onClick={handleBuyClick}>
                {isCustom ? '🎯' : '📋'} {buying ? 'Starting…' : 'Buy Program'}
              </button>
              {!user && (
                <Link to="/register" className="btn btn-outline pp-book-btn">
                  Sign Up Free
                </Link>
              )}
            </div>

            <Link to="/services" className="pp-back-link">
              <ArrowLeft size={14}/> Back to all programs
            </Link>
          </div>
        </div>
      </div>
      {showIntake && (
        <IntakeModal svc={svc} busy={buying} requireIntake={isCustom} onCancel={() => setShowIntake(false)} onSubmit={startPurchase}/>
      )}
    </div>
  )
}
