import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Clock, DollarSign, ArrowRight, Filter, Package,
         ChevronDown, ChevronUp, Lock, Dumbbell, BookOpen, Video, Users } from 'lucide-react'
import { servicesAPI, appointmentsAPI, purchasesAPI, settingsAPI } from '../services/api'
import IntakeModal from '../components/IntakeModal'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import './ServicesPage.css'

const CATEGORIES = ['All','Strength','Cardio','Flexibility','Combat','Wellness','Nutrition','Other']
const CAT_IMAGES  = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&q=80',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80',
}

/* ── Global session-bundle deals (appointments are program-agnostic now) ── */
function BundlesBanner({ bundles }) {
  const [open, setOpen] = useState(false)
  const relevant = bundles.filter(b => !b.service)
  if (relevant.length === 0) return null
  return (
    <div className="bundles-section" style={{ marginBottom: 18 }}>
      <button className={`bundles-toggle-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <Package size={13}/>
        <span>{relevant.length} session bundle deal{relevant.length !== 1 ? 's' : ''} available</span>
        {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
      </button>
      {open && (
        <div className="bundles-list">
          {relevant.map(b => (
            <div key={b._id} className="bundle-pill">
              <div className="bp-left">
                <strong>{b.name}</strong>
                <span>{b.sessions} sessions · {b.validDays} days validity</span>
                {b.description && <span className="bp-desc">{b.description}</span>}
              </div>
              <div className="bp-price">${b.price}<small>flat</small></div>
            </div>
          ))}
          <Link to="/book" className="bundles-cta">
            Book & apply bundle <ArrowRight size={12}/>
          </Link>
        </div>
      )}
    </div>
  )
}

export default function ServicesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [services,  setServices]  = useState([])
  const [bundles,   setBundles]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [activecat, setActivecat] = useState('All')
  const [trainType, setTrainType] = useState('all')   // 'all' | 'pt' | 'self'
  const [buying,    setBuying]    = useState(null)

  const [intakeSvc, setIntakeSvc] = useState(null)   // custom program being purchased

  /* Buy a program directly (custom programs ask intake questions first;
     predefined programs skip straight to nutrition + confirm) */
  const handleBuyProgram = (svc) => {
    if (!user) { toast('Please sign in to purchase a program'); navigate('/login'); return }
    setIntakeSvc(svc)
  }

  /* Called by the intake modal once questions are answered */
  const startPurchase = async (svc, intake, wantsNutrition) => {
    setBuying(svc._id)
    try {
      const res = await purchasesAPI.create(svc._id, { wantsNutrition, intake })
      const purchase = res.data.data
      // Hand off to the payment page in "purchase" mode
      sessionStorage.setItem('payState', JSON.stringify({
        purchaseId: purchase._id,
        totalAmount: purchase.amount,
        serviceName: svc.name,
        type: 'purchase',
        isCustom: svc.trainingType === 'self',
      }))
      navigate('/pay')
    } catch (err) {
      const msg = err.response?.data?.message || 'Could not start purchase'
      toast.error(msg)
      if (err.response?.status === 409) navigate('/dashboard')
    } finally { setBuying(null); setIntakeSvc(null) }
  }

  useEffect(() => {
    Promise.all([
      servicesAPI.getAll(),
      appointmentsAPI.getBundles(),
    ]).then(([svcRes, bRes]) => {
      setServices(svcRes.data.data)
      setBundles(bRes.data.data || [])
    }).catch(() => toast.error('Could not load programs'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = services.filter(s => {
    const matchCat    = activecat === 'All' || s.category === activecat
    const matchType   = trainType === 'all' || (s.trainingType || 'pt') === trainType
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                        s.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchType && matchSearch
  })

  return (
    <div className="services-page">
      <div className="services-hero">
        <div className="services-hero-bg"/>
        <div className="services-hero-content">
          <p className="eyebrow-light">What We Offer</p>
          <h1>Training Programs</h1>
          <p>Choose a program and view full details, highlights and recipes</p>
        </div>
      </div>

      <div className="services-body">
        {/* Search + filters */}
        <div className="services-controls">
          <div className="search-box">
            <Search size={16}/>
            <input
              placeholder="Search programs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="cat-filters type-filters">
            {[
              { key:'all',  label:'All Programs',        icon:<Filter size={13}/> },
              { key:'pt',   label:'Predefined Programs', icon:<Users size={13}/> },
              { key:'self', label:'Custom Programs',     icon:<BookOpen size={13}/> },
            ].map(t => (
              <button key={t.key}
                className={`cat-btn ${trainType === t.key ? 'active' : ''}`}
                onClick={() => setTrainType(t.key)}
              >{t.icon} {t.label}</button>
            ))}
            <Link to="/book" className="cat-btn">
              📅 Book an Appointment
            </Link>
          </div>
          <div className="cat-filters">
            <Filter size={14}/>
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={`cat-btn ${activecat === c ? 'active' : ''}`}
                onClick={() => setActivecat(c)}
              >{c}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="services-loading">
            <div className="spinner spinner-dark"/>
            <p>Loading programs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="services-empty"><p>No programs found.</p></div>
        ) : (
          <>
            <p className="results-count">{filtered.length} program{filtered.length !== 1 ? 's' : ''} found</p>
            <BundlesBanner bundles={bundles}/>
            <div className="services-grid">
              {filtered.map((svc, i) => (
                <div key={svc._id} className="svc-card fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                  <div className="svc-img-wrap">
                    <img
                      src={svc.imageUrl || CAT_IMAGES[svc.category] || CAT_IMAGES.Other}
                      alt={svc.name}
                      className="svc-img"
                    />
                    <span className="svc-cat-overlay">{svc.category}</span>
                    <span className="svc-cat-overlay" style={{ left:'auto', right:'10px', background:(svc.trainingType==='self') ? '#7c3aed' : '#0f766e' }}>
                      {(svc.trainingType==='self') ? '🎯 Custom Program' : '📋 Predefined Program'}
                    </span>
                  </div>

                  <div className="svc-card-body">
                    <h3>{svc.name}</h3>
                    <p>{svc.description}</p>

                    {/* Hints */}
                    <div className="svc-hints">
                      {svc.sections && svc.sections.length > 0 && (
                        <span className="svc-hint">📋 {svc.sections.length} section{svc.sections.length !== 1 ? 's' : ''}</span>
                      )}
                      {(svc.trainingType === 'self') ? (
                        <span className="svc-hint" style={{ color:'#7c3aed' }}>
                          🎯 Personalized — answer a few questions, buy, and your trainer builds your plan
                        </span>
                      ) : svc.sectionsLocked && (
                        <span className="svc-hint" style={{ color:'#b45309' }}>
                          <Lock size={11}/> Full program unlocks after purchase
                        </span>
                      )}
                    </div>

                    {/* View Details button */}
                    <Link to={`/services/${svc._id}`} className="btn btn-outline btn-sm svc-details-btn">
                      View Details <ArrowRight size={13}/>
                    </Link>
                  </div>

                  <div className="svc-card-footer">
                    <div className="svc-meta">
                      <span><DollarSign size={13}/>{svc.price}<small> one-time</small></span>
                      <span><Clock size={13}/>{svc.duration} min</span>
                    </div>
                    <button className="btn btn-primary btn-sm" disabled={buying === svc._id}
                            onClick={() => handleBuyProgram(svc)}>
                      {buying === svc._id ? 'Starting…' : <>Buy Program <ArrowRight size={13}/></>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {intakeSvc && (
        <IntakeModal svc={intakeSvc} busy={buying === intakeSvc._id} requireIntake={intakeSvc.trainingType === 'self'}
                     onCancel={() => setIntakeSvc(null)} onSubmit={startPurchase}/>
      )}
    </div>
  )
}
