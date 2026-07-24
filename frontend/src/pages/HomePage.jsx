import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Zap, Target, Calendar, Trophy, ChevronRight, Star, Play } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { servicesAPI } from '../services/api'
import './HomePage.css'

const CAT_IMAGES = {
  Strength:    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
  Cardio:      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
  Flexibility: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
  Combat:      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&q=80',
  Wellness:    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
  Nutrition:   'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80',
  Other:       'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80',
}
const FEAT_ICONS = [<Zap size={22}/>, <Target size={22}/>, <Calendar size={22}/>, <Trophy size={22}/>]

export default function HomePage() {
  const { settings } = useSettings()
  const [services, setServices] = useState([])

  useEffect(() => {
    servicesAPI.getAll().then(r => setServices(r.data.data.slice(0, 3))).catch(() => {})
  }, [])

  const stats = [
    { value: settings.stat1Value, label: settings.stat1Label },
    { value: settings.stat2Value, label: settings.stat2Label },
    { value: settings.stat3Value, label: settings.stat3Label },
    { value: settings.stat4Value, label: settings.stat4Label },
  ]
  const features = [
    { title: settings.feature1Title, desc: settings.feature1Desc, icon: FEAT_ICONS[0] },
    { title: settings.feature2Title, desc: settings.feature2Desc, icon: FEAT_ICONS[1] },
    { title: settings.feature3Title, desc: settings.feature3Desc, icon: FEAT_ICONS[2] },
    { title: settings.feature4Title, desc: settings.feature4Desc, icon: FEAT_ICONS[3] },
  ]

  return (
    <div className="home">

      {/* ── HERO with real photo ─────────────────────────────── */}
      <section className="hero">
        <div className="hero-photo-side">
          <img
            src="/images/image1.jpg"
            alt="Personal training session"
            className="hero-photo"
          />
          <div className="hero-photo-overlay"/>
          {/* floating card on photo */}
          <div className="hero-float-card">
            <div className="hfc-row">
              <div className="hfc-icon">💪</div>
              <div>
                <strong>Book in under 2 minutes</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-content fade-up">
          <div className="hero-badge"><Zap size={13}/> Professional Training</div>
          <h1 className="hero-title">{settings.heroTitle}</h1>
          <p className="hero-sub">{settings.heroSubtitle}</p>
          <div className="hero-actions">
            <Link to="/book" className="btn btn-accent hero-cta">
              Book a Session <ArrowRight size={17}/>
            </Link>
            <Link to="/services" className="btn hero-outline">
              View Programs
            </Link>
          </div>
          <div className="hero-trust">
            <div className="trust-stars">{[...Array(5)].map((_,i)=><Star key={i} size={13} fill="#F59E0B" color="#F59E0B"/>)}</div>
            <span>Trusted by 500+ clients</span>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────── */}
      <div className="stats-bar">
        {stats.map((s,i) => (
          <div key={i} className="stat-item">
            <strong>{s.value}</strong><span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── SECOND PHOTO BANNER ───────────────────────────────── */}
      <section className="photo-banner">
        <div className="pb-photo">
          <img
            src="https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=900&q=85"
            alt="Group training"
          />
          <div className="pb-overlay"/>
        </div>
        <div className="pb-content fade-up">
          <p className="eyebrow-light">Why FitPro?</p>
          <h2>Train Smarter.<br/>Get Results Faster.</h2>
          <p>Every session is science-backed, personalized to your body, and designed to push your limits — safely.</p>
          <Link to="/register" className="btn btn-accent">
            Start Today <ArrowRight size={16}/>
          </Link>
        </div>
      </section>

      {/* ── FEATURED SERVICES with photos ─────────────────────── */}
      {services.length > 0 && (
        <section className="section">
          <div className="section-header">
            <div>
              <p className="eyebrow">What We Offer</p>
              <h2 className="section-title">Training Programs</h2>
            </div>
            <Link to="/services" className="btn btn-outline btn-sm">All Programs <ChevronRight size={14}/></Link>
          </div>
          <div className="featured-services">
            {services.map((svc, i) => (
              <div key={svc._id} className="fsc fade-up" style={{animationDelay:`${i*0.1}s`}}>
                <div className="fsc-img-wrap">
                  <img src={svc.imageUrl || CAT_IMAGES[svc.category] || CAT_IMAGES.Other} alt={svc.name} className="fsc-img"/>
                  <span className="fsc-cat-badge">{svc.category}</span>
                </div>
                <div className="fsc-body">
                  <h3>{svc.name}</h3>
                  <p>{svc.description}</p>
                  <div className="fsc-footer">
                    <span className="fsc-price">${svc.price}</span>
                    <span className="fsc-dur">⏱ {svc.duration} min</span>
                    <Link to="/book" className="btn btn-primary btn-sm">Book</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section className="section features-section">
        <p className="eyebrow" style={{textAlign:'center'}}>Why Choose Us</p>
        <h2 className="section-title" style={{textAlign:'center',marginBottom:'40px'}}>Built for Results</h2>
        <div className="features-grid">
          {features.map((f,i) => (
            <div key={i} className="feature-card fade-up" style={{animationDelay:`${i*0.1}s`}}>
              <div className="fc-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2>{settings.ctaTitle}</h2>
          <p>{settings.ctaSubtitle}</p>
          <Link to="/book" className="btn btn-accent btn-lg">
            Book Your First Session <ArrowRight size={18}/>
          </Link>
        </div>
      </section>
    </div>
  )
}
