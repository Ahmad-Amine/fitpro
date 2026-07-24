import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, ArrowRight, Info } from 'lucide-react'
import './BMIPage.css'

const BMI_CATEGORIES = [
  { min: 0,    max: 18.4, label: 'Underweight',      color: '#3B82F6', bg: '#EFF6FF', tip: 'You may need to gain some weight. Consider consulting a nutritionist.' },
  { min: 18.5, max: 24.9, label: 'Normal Weight',    color: '#10B981', bg: '#ECFDF5', tip: 'Great! You have a healthy weight. Keep maintaining your lifestyle.' },
  { min: 25,   max: 29.9, label: 'Overweight',       color: '#F59E0B', bg: '#FFFBEB', tip: 'Consider light exercise and a balanced diet to reach a healthier weight.' },
  { min: 30,   max: 34.9, label: 'Obese (Class I)',  color: '#F97316', bg: '#FFF7ED', tip: 'Regular exercise and dietary changes are recommended. Consult a doctor.' },
  { min: 35,   max: 39.9, label: 'Obese (Class II)', color: '#EF4444', bg: '#FEF2F2', tip: 'Medical supervision is strongly advised. Contact a healthcare professional.' },
  { min: 40,   max: 999,  label: 'Obese (Class III)',color: '#991B1B', bg: '#FEF2F2', tip: 'Please consult a doctor immediately for medical guidance.' },
]

function getCategory(bmi) {
  return BMI_CATEGORIES.find(c => bmi >= c.min && bmi <= c.max) || BMI_CATEGORIES[0]
}

function getBMIPosition(bmi) {
  const clamped = Math.min(Math.max(bmi, 10), 45)
  return ((clamped - 10) / (45 - 10)) * 100
}

export default function BMIPage() {
  const [unit,   setUnit]   = useState('metric') // metric | imperial
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [feet,   setFeet]   = useState('')
  const [inches, setInches] = useState('')
  const [lbs,    setLbs]    = useState('')
  const [bmi,    setBmi]    = useState(null)
  const [cat,    setCat]    = useState(null)

  const calculate = () => {
    let bmiVal = null
    if (unit === 'metric') {
      const h = parseFloat(height) / 100 // cm to m
      const w = parseFloat(weight)
      if (!h || !w || h <= 0 || w <= 0) return
      bmiVal = w / (h * h)
    } else {
      const totalInches = (parseFloat(feet) || 0) * 12 + (parseFloat(inches) || 0)
      const w = parseFloat(lbs)
      if (!totalInches || !w || totalInches <= 0 || w <= 0) return
      bmiVal = (w / (totalInches * totalInches)) * 703
    }
    const rounded = Math.round(bmiVal * 10) / 10
    setBmi(rounded)
    setCat(getCategory(rounded))
  }

  const reset = () => {
    setHeight(''); setWeight(''); setFeet(''); setInches(''); setLbs('')
    setBmi(null); setCat(null)
  }

  return (
    <div className="bmi-page">
      {/* Hero */}
      <div className="bmi-hero">
        <div className="bmi-hero-bg"/>
        <div className="bmi-hero-content">
          <div className="bmi-hero-badge"><Calculator size={14}/> Free Tool</div>
          <h1>BMI Calculator</h1>
          <p>Calculate your Body Mass Index and understand what it means for your health</p>
        </div>
      </div>

      <div className="bmi-body">
        <div className="bmi-grid">

          {/* Left — Calculator */}
          <div className="bmi-card">
            <h2>Calculate Your BMI</h2>

            {/* Unit toggle */}
            <div className="unit-toggle">
              <button className={unit==='metric'?'active':''} onClick={()=>{setUnit('metric');reset()}}>
                Metric (kg / cm)
              </button>
              <button className={unit==='imperial'?'active':''} onClick={()=>{setUnit('imperial');reset()}}>
                Imperial (lb / ft)
              </button>
            </div>

            {unit === 'metric' ? (
              <div className="bmi-inputs">
                <div className="form-group">
                  <label>Height (cm)</label>
                  <input type="number" placeholder="e.g. 175" min="50" max="300"
                    value={height} onChange={e=>setHeight(e.target.value)}/>
                </div>
                <div className="form-group">
                  <label>Weight (kg)</label>
                  <input type="number" placeholder="e.g. 70" min="1" max="500"
                    value={weight} onChange={e=>setWeight(e.target.value)}/>
                </div>
              </div>
            ) : (
              <div className="bmi-inputs">
                <div className="form-group">
                  <label>Height</label>
                  <div className="imperial-height">
                    <input type="number" placeholder="Feet" min="1" max="9"
                      value={feet} onChange={e=>setFeet(e.target.value)}/>
                    <span>ft</span>
                    <input type="number" placeholder="Inches" min="0" max="11"
                      value={inches} onChange={e=>setInches(e.target.value)}/>
                    <span>in</span>
                  </div>
                </div>
                <div className="form-group">
                  <label>Weight (lbs)</label>
                  <input type="number" placeholder="e.g. 154" min="1" max="1000"
                    value={lbs} onChange={e=>setLbs(e.target.value)}/>
                </div>
              </div>
            )}

            <button className="btn btn-primary bmi-calc-btn" onClick={calculate}>
              <Calculator size={16}/> Calculate BMI
            </button>

            {/* Result */}
            {bmi && cat && (
              <div className="bmi-result fade-up" style={{borderColor: cat.color}}>
                <div className="bmi-result-top">
                  <div>
                    <span className="bmi-label">Your BMI</span>
                    <span className="bmi-value" style={{color: cat.color}}>{bmi}</span>
                  </div>
                  <div className="bmi-category-badge" style={{background: cat.bg, color: cat.color}}>
                    {cat.label}
                  </div>
                </div>

                {/* Scale bar */}
                <div className="bmi-scale">
                  <div className="bmi-scale-bar">
                    <div className="bs-segment" style={{background:'#3B82F6',flex:1}}/>
                    <div className="bs-segment" style={{background:'#10B981',flex:1.3}}/>
                    <div className="bs-segment" style={{background:'#F59E0B',flex:1}}/>
                    <div className="bs-segment" style={{background:'#F97316',flex:1}}/>
                    <div className="bs-segment" style={{background:'#EF4444',flex:1}}/>
                    <div className="bs-segment" style={{background:'#991B1B',flex:1}}/>
                    <div className="bmi-marker" style={{left: `${getBMIPosition(bmi)}%`}}>
                      <div className="bmi-marker-dot"/>
                      <div className="bmi-marker-label">{bmi}</div>
                    </div>
                  </div>
                  <div className="bmi-scale-labels">
                    <span>10</span><span>18.5</span><span>25</span>
                    <span>30</span><span>35</span><span>40</span><span>45</span>
                  </div>
                </div>

                <div className="bmi-tip" style={{background: cat.bg, borderColor: cat.color}}>
                  <Info size={14} style={{color: cat.color, flexShrink:0}}/>
                  <p style={{color: cat.color}}>{cat.tip}</p>
                </div>

                <button className="bmi-cta-link" onClick={reset}>Recalculate</button>
              </div>
            )}
          </div>

          {/* Right — Info */}
          <div className="bmi-info-col">
            <div className="bmi-info-card">
              <h3>What is BMI?</h3>
              <p>Body Mass Index (BMI) is a measure of body fat based on height and weight. It's a useful screening tool but doesn't measure body fat directly.</p>
              <div className="bmi-formula">
                <strong>Formula (Metric):</strong>
                <code>BMI = weight(kg) ÷ height²(m)</code>
              </div>
            </div>

            <div className="bmi-ranges-card">
              <h3>BMI Ranges</h3>
              {BMI_CATEGORIES.map((c, i) => (
                <div key={i} className="bmi-range-row">
                  <div className="brr-dot" style={{background: c.color}}/>
                  <div className="brr-info">
                    <strong style={{color: c.color}}>{c.label}</strong>
                    <span>{c.min} – {c.max === 999 ? '40+' : c.max}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bmi-cta-card">
              <h3>Ready to Transform?</h3>
              <p>BMI is just a starting point. Our personal training programs are tailored to your specific goals and body type.</p>
              <Link to="/services" className="btn btn-primary" style={{justifyContent:'center'}}>
                View Programs <ArrowRight size={15}/>
              </Link>
              <Link to="/register" className="btn btn-outline" style={{justifyContent:'center',marginTop:'8px'}}>
                Sign Up Free
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
