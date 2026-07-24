import React, { createContext, useContext, useState, useEffect } from 'react'
import { settingsAPI } from '../services/api'

const SettingsContext = createContext(null)

const DEFAULTS = {
  shopName: 'FitPro Training', tagline: 'Transform Your Body, Transform Your Life',
  address: 'Your City, Country', googleMapsUrl: '', email: '',
  hoursWeekdays: 'Mon–Fri: 6 AM – 9 PM', hoursSaturday: 'Saturday: 7 AM – 5 PM', hoursSunday: 'Sunday: Closed',
  phone: '', whatsapp: '', facebook: '', instagram: '', tiktok: '',
  heroTitle: 'Transform Your Body',
  heroSubtitle: "Expert personal training tailored to your goals. Whether you want to lose weight, build muscle, or improve your fitness — I'm here to guide you every step of the way.",
  stat1Value: '500+', stat1Label: 'Clients Trained',
  stat2Value: '8+',   stat2Label: 'Years Experience',
  stat3Value: '98%',  stat3Label: 'Success Rate',
  stat4Value: '50+',  stat4Label: 'Programs',
  feature1Title: 'Personalized Plans',  feature1Desc: 'Every program is tailored specifically to your body, goals and fitness level.',
  feature2Title: 'Expert Guidance',     feature2Desc: 'Certified trainer with years of experience in strength and conditioning.',
  feature3Title: 'Flexible Schedule',   feature3Desc: 'Book sessions at times that work for you, 6 days a week.',
  feature4Title: 'Proven Results',      feature4Desc: 'Join hundreds of clients who have already transformed their lives.',
  ctaTitle: 'Ready to Start Your Journey?',
  ctaSubtitle: 'Book your first session today and take the first step towards the body and lifestyle you deserve.',
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)

  const reload = () => {
    settingsAPI.get()
      .then(r => setSettings({ ...DEFAULTS, ...r.data.data }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  return (
    <SettingsContext.Provider value={{ settings, setSettings, loading, reload }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)
