import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Lock, CheckCircle, AlertCircle, ArrowLeft, Shield, RefreshCw } from 'lucide-react'
import { paymentAPI } from '../services/api'
import toast from 'react-hot-toast'
import './PaymentPage.css'

function fmtExpiry(v) { return v.replace(/\D/g,'').slice(0,4).replace(/^(\d{2})(\d)/,'$1/$2') }

export default function PaymentPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // Get state from navigation or sessionStorage fallback
  const navState = location.state || JSON.parse(sessionStorage.getItem('payState') || '{}')
  const { appointmentIds, purchaseId, totalAmount, sessionCount, programName, serviceName, type, isCustom, currency = 'USD' } = navState
  const isPurchase = type === 'purchase' && !!purchaseId

  const [step,      setStep]     = useState('loading')
  const [paying,    setPaying]   = useState(false)
  const [numValid,  setNumValid]  = useState(null)  // null=untouched, true/false
  const [cvvValid,  setCvvValid]  = useState(null)
  const [orderId,   setOrderId]  = useState(null)
  const [transId,   setTransId]  = useState(null)
  const [errMsg,    setErrMsg]   = useState('')
  const [flexReady, setFlexReady]= useState(false)
  const [flexStatus,setFlexStatus]=useState('Loading secure fields...')

  const [expiry,  setExpiry]  = useState('')
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [address, setAddress] = useState('')
  const [city,    setCity]    = useState('')
  const [country, setCountry] = useState('LB')

  // Single microform ref
  const microformRef = useRef(null)
  const orderRef     = useRef(null)
  const didInit      = useRef(false)

  useEffect(() => {
    if (!appointmentIds?.length && !isPurchase) { navigate('/book'); return }
    if (didInit.current) return
    didInit.current = true
    initOrder()
  }, [])

  const initOrder = async () => {
    setStep('loading')
    setFlexReady(false)
    setFlexStatus('Loading secure fields...')
    microformRef.current = null

    try {
      const res = await paymentAPI.createOrder(isPurchase ? { purchaseIds: [purchaseId], currency } : { appointmentIds, currency })
      const { orderId: oid, clientToken, clientLibrary, clientLibraryIntegrity } = res.data

      if (!clientToken) {
        setErrMsg('Payment system temporarily unavailable. Please try again.')
        setStep('error')
        return
      }

      setOrderId(oid)
      orderRef.current = oid

      // Per official docs: use clientLibrary URL from JWT
      const scriptSrc = clientLibrary
        || 'https://testflex.cybersource.com/microform/bundle/v2.0.2/flex-microform.min.js'

      // Show form first so DOM containers exist
      setStep('form')

      // Wait for React to render the form, then load script and init Flex
      setTimeout(async () => {
        try {
          await loadFlexScript(scriptSrc, clientLibraryIntegrity)
          initFlex(clientToken)
        } catch (e) {
          console.error('Script load error:', e)
          setErrMsg('Could not load secure payment. Please refresh and try again.')
          setStep('error')
        }
      }, 500)

    } catch (err) {
      setErrMsg(err.response?.data?.message || 'Could not initiate payment.')
      setStep('error')
    }
  }

  const loadFlexScript = (src, integrity) => {
    return new Promise((resolve, reject) => {
      // Remove old script
      document.getElementById('cs-flex-script')?.remove()

      const script    = document.createElement('script')
      script.id       = 'cs-flex-script'
      script.src      = src
      script.async    = true

      // Per docs: use SRI integrity for PCI compliance
      if (integrity) {
        script.integrity   = integrity
        script.crossOrigin = 'anonymous'
      }

      script.onload  = () => { console.log('✅ Flex script loaded'); resolve() }
      script.onerror = () => reject(new Error('Failed to load CyberSource script'))
      document.head.appendChild(script)
    })
  }

  const initFlex = (captureContext) => {
    // Retry up to 10 times waiting for DOM containers
    let tries = 0
    const attempt = () => {
      const numEl = document.getElementById('cs-number-container')
      const cvvEl = document.getElementById('cs-cvv-container')

      if (!numEl || !cvvEl) {
        if (tries++ < 10) {
          setTimeout(attempt, 200)
        } else {
          setErrMsg('Payment fields could not load. Please refresh.')
          setStep('error')
        }
        return
      }

      try {
        // Per official v2 API reference: integration type ('card') is the
        // required first argument to flex.microform() in Microform v2.
        const flex      = new window.Flex(captureContext)
        const microform = flex.microform('card', {
          styles: {
            input: {
              'font-size':   '14px',
              'font-family': 'helvetica, tahoma, calibri, sans-serif',
              'color':       '#555',
            },
            ':focus':   { color: '#1e3a8a' },
            ':disabled':{ cursor: 'not-allowed' },
            'valid':    { color: '#3c763d' },
            'invalid':  { color: '#a94442' },
          }
        })

        const numberField = microform.createField('number',       { placeholder: '1234 5678 9012 3456' })
        const cvvField    = microform.createField('securityCode', { placeholder: '•••' })

        // Listen for field ready events
        numberField.on('load', () => {
          console.log('✅ Number field loaded')
          setFlexStatus('Card field ready')
        })
        cvvField.on('load', () => {
          console.log('✅ CVV field loaded')
          setFlexReady(true)
          setFlexStatus('Ready')
        })
        numberField.on('change', (data) => {
          console.log('Card field change:', data)
          if (data?.empty) setNumValid(null)
          else setNumValid(!!data?.valid)
        })
        cvvField.on('change', (data) => {
          if (data?.empty) setCvvValid(null)
          else setCvvValid(!!data?.valid)
        })
        // Surface field-level errors we were previously not listening for at all
        numberField.on('error', (err) => console.error('❌ Number field error event:', JSON.stringify(err)))
        cvvField.on('error',    (err) => console.error('❌ CVV field error event:', JSON.stringify(err)))

        // Load fields into DOM containers
        numberField.load(numEl)
        cvvField.load(cvvEl)

        // Store the microform instance
        microformRef.current = microform
        console.log('✅ Flex Microform initialized')

      } catch (e) {
        console.error('Flex init error:', e)
        setErrMsg('Could not initialize payment. Please refresh.')
        setStep('error')
      }
    }

    attempt()
  }

  const handlePay = async () => {
    if (!name.trim())           { toast.error('Please enter cardholder name'); return }
    if (!expiry || expiry.length < 5) { toast.error('Please enter expiry date'); return }

    const [mm, yy] = expiry.split('/')
    if (!mm || !yy || mm.length !== 2 || yy.length !== 2) {
      toast.error('Use MM/YY format e.g. 12/27'); return
    }
    if (!microformRef.current) {
      toast.error('Card fields not ready. Please refresh.'); return
    }

    // CRITICAL: do NOT setStep('processing') here. Changing step unmounts the
    // form — destroying the CyberSource iframes — and createToken would then
    // message iframes that no longer exist, hanging forever with no error.
    // Tokenize FIRST (iframes must stay mounted), THEN switch screens.
    setPaying(true)

    try {
      console.log('🔄 Calling createToken...')

      // Per official docs: expirationMonth and expirationYear as strings
      const tokenData = await new Promise((resolve, reject) => {
        let settled = false
        const startedAt = Date.now()

        const timeout = setTimeout(() => {
          settled = true
          console.error(`❌ Our own 30s UI timeout fired. CyberSource's createToken callback has NOT responded yet — waiting to see if it eventually does...`)
          reject(new Error('Token creation timed out. Please check your card details and try again.'))
        }, 30000)

        microformRef.current.createToken(
          {
            expirationMonth: mm,
            expirationYear:  `20${yy}`,
          },
          (err, token) => {
            const elapsed = Date.now() - startedAt
            if (settled) {
              // This is the important diagnostic line: if this ever logs,
              // CyberSource DID respond — just slower than our 30s UI timeout,
              // and the real reason is in this log line, not "timed out".
              console.error(`⚠️ createToken callback fired AFTER our timeout (${elapsed}ms elapsed). Real CyberSource response:`, JSON.stringify(err || token))
              return
            }
            clearTimeout(timeout)
            settled = true
            if (err) {
              console.error(`createToken error after ${elapsed}ms:`, JSON.stringify(err))
              const msgs = {
                'CREATE_TOKEN_VALIDATION_FIELDS':     'Please check your card number and CVV.',
                'CREATE_TOKEN_VALIDATION_PARAMS':     'Invalid expiry date.',
                'CREATE_TOKEN_NO_FIELDS_LOADED':      'Card fields not loaded. Please refresh.',
                'CREATE_TOKEN_TIMEOUT':               'Timed out. Please try again.',
                'CREATE_TOKEN_NO_FIELDS':             'No card fields found. Please refresh.',
                'CREATE_TOKEN_VALIDATION_SERVERSIDE': 'Card declined by server. Please try another card.',
                'CREATE_TOKEN_UNABLE_TO_START':       'Could not start. Please refresh.',
              }
              reject(new Error(msgs[err.reason] || err.message || 'Card validation failed.'))
            } else {
              console.log(`✅ Token created successfully after ${elapsed}ms:`, JSON.stringify(token).slice(0, 50))
              resolve(token)
            }
          }
        )
      })

      // Token obtained — iframes no longer needed, NOW it's safe to unmount the form
      setStep('processing')

      // Per official docs: stringify the token object before sending
      const transientToken = typeof tokenData === 'string'
        ? tokenData
        : JSON.stringify(tokenData)

      console.log('🔄 Sending to backend...')

      const [firstName, ...rest] = name.trim().split(' ')
      const res = await paymentAPI.capture({
        orderId:        orderId || orderRef.current,
        transientToken,
        billingDetails: {
          firstName,
          lastName:  rest.join(' ') || firstName,
          email:     email   || '',
          address:   address || 'N/A',
          city:      city    || 'Beirut',
          country,
          postal:    '00000',
        },
      })

      console.log('✅ Payment captured!')
      sessionStorage.removeItem('payState')
      setTransId(res.data.transactionId)
      setStep('success')

    } catch (err) {
      const msg = err.message || err?.response?.data?.message || 'Payment failed.'
      console.error('Payment error:', msg)
      setErrMsg(msg)
      setStep('error')
    } finally {
      setPaying(false)
    }
  }

  /* ═══════════ SCREENS ═══════════ */

  if (step === 'loading') return (
    <div className="pay-page">
      <div className="pay-processing">
        <div className="pay-spinner"/>
        <h2>Preparing Secure Payment…</h2>
        <p>Loading CyberSource Flex Microform</p>
      </div>
    </div>
  )

  if (step === 'processing') return (
    <div className="pay-page">
      <div className="pay-processing">
        <div className="pay-spinner"/>
        <h2>Processing Payment…</h2>
        <p>Please do not close this page</p>
      </div>
    </div>
  )

  if (step === 'success') return (
    <div className="pay-page">
      <div className="pay-result-card fade-up">
        <div className="pay-result-icon success"><CheckCircle size={52}/></div>
        <h2>Payment Successful! 🎉</h2>
        {isPurchase
          ? (isCustom
              ? <p>You purchased <strong>{serviceName || programName}</strong>. Your trainer will now build your personalized plan — watch the <strong>My Plans</strong> tab in your dashboard.</p>
              : <p>You now own <strong>{serviceName || programName}</strong>. Find the full program in your dashboard.</p>)
          : <p>Your {sessionCount} session{sessionCount > 1 ? 's' : ''} for <strong>{programName}</strong> have been paid.</p>}
        <div className="pay-trans-id">
          <span>Transaction ID</span>
          <code>{transId || orderId}</code>
        </div>
        <p className="pay-note">{isPurchase ? (isCustom ? 'Your trainer has been notified.' : 'The program content is now unlocked.') : 'Your trainer will confirm the sessions shortly.'}</p>
        <div className="pay-result-actions">
          <Link to="/dashboard" className="btn btn-primary">{isPurchase ? 'Open My Program' : 'View My Sessions'}</Link>
          <Link to={isPurchase ? '/services' : '/book'} className="btn btn-outline">{isPurchase ? 'Browse More' : 'Book More'}</Link>
        </div>
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="pay-page">
      <div className="pay-result-card fade-up">
        <div className="pay-result-icon error"><AlertCircle size={52}/></div>
        <h2>Payment Failed</h2>
        <p>{errMsg}</p>
        <div className="pay-result-actions">
          <button className="btn btn-primary" onClick={() => {
            didInit.current = false
            microformRef.current = null
            setFlexReady(false)
            setErrMsg('')
            initOrder()
          }}>
            <RefreshCw size={14}/> Try Again
          </button>
          <Link to="/dashboard" className="btn btn-outline">My Sessions</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="pay-page">
      <div className="pay-grid fade-up">

        <div className="pay-summary">
          <Link to="/book" className="pay-back"><ArrowLeft size={15}/> Back</Link>
          <h2>Order Summary</h2>
          <div className="pay-summary-row"><span>Program</span><strong>{serviceName || programName}</strong></div>
          {isPurchase && <div className="pay-summary-row"><span>Type</span><strong>Self-training program (one-time)</strong></div>}
          <div className="pay-summary-row"><span>Sessions</span><strong>{sessionCount}</strong></div>
          <div className="pay-summary-row total">
            <span>Total</span>
            <strong>${totalAmount} {currency}</strong>
          </div>
          <div className="pay-secure-badge"><Shield size={14}/><span>Secured by CyberSource Flex Microform</span></div>
          <div className="pay-card-icons">
            <span className="pci-badge">VISA</span>
            <span className="pci-badge">MC</span>
            <span className="pci-badge">AMEX</span>
          </div>
        </div>

        <div className="pay-form-box">
          <div className="pay-form-header">
            <Lock size={16}/>
            <h3>Secure Card Payment</h3>
            {flexReady && <span className="flex-badge">🔒 PCI Secured</span>}
          </div>

          <div className="form-group">
            <label>Card Number {!flexReady && <span style={{fontSize:'0.72rem',color:'var(--grey)'}}>({flexStatus})</span>}</label>
            <div className="pay-flex-field"
                 style={{ borderColor: numValid === true ? '#16a34a' : numValid === false ? '#dc2626' : undefined,
                          borderWidth: numValid !== null ? 2 : undefined }}
                 id="cs-number-container"/>
            {numValid === false && <span style={{fontSize:'.75rem',color:'#dc2626'}}>Card number looks invalid</span>}
            {numValid === true  && <span style={{fontSize:'.75rem',color:'#16a34a'}}>✓ Looks good</span>}
          </div>

          <div className="pay-row-2">
            <div className="form-group">
              <label>Expiry (MM/YY)</label>
              <input type="text" inputMode="numeric" placeholder="MM/YY"
                value={expiry} onChange={e => setExpiry(fmtExpiry(e.target.value))}
                maxLength={5} autoComplete="cc-exp"/>
            </div>
            <div className="form-group">
              <label>CVV</label>
              <div className="pay-flex-field"
                   style={{ borderColor: cvvValid === true ? '#16a34a' : cvvValid === false ? '#dc2626' : undefined,
                            borderWidth: cvvValid !== null ? 2 : undefined }}
                   id="cs-cvv-container"/>
              {cvvValid === false && <span style={{fontSize:'.75rem',color:'#dc2626'}}>Invalid CVV</span>}
              {cvvValid === true  && <span style={{fontSize:'.75rem',color:'#16a34a'}}>✓ Looks good</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Cardholder Name</label>
            <input type="text" placeholder="Name on card"
              value={name} onChange={e => setName(e.target.value)} autoComplete="cc-name"/>
          </div>

          <div className="pay-section-label">Billing Details</div>

          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Address</label>
            <input type="text" placeholder="Street address"
              value={address} onChange={e => setAddress(e.target.value)}/>
          </div>
          <div className="pay-row-2">
            <div className="form-group">
              <label>City</label>
              <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)}/>
            </div>
            <div className="form-group">
              <label>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)}>
                <option value="LB">Lebanon</option>
                <option value="AE">UAE</option>
                <option value="SA">Saudi Arabia</option>
                <option value="KW">Kuwait</option>
                <option value="QA">Qatar</option>
                <option value="BH">Bahrain</option>
                <option value="JO">Jordan</option>
                <option value="EG">Egypt</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary pay-submit-btn" onClick={handlePay} disabled={!flexReady || paying}>
            <Lock size={15}/>
            {paying ? 'Securing card…' : flexReady ? `Pay $${totalAmount} ${currency}` : `${flexStatus}`}
          </button>
        </div>
      </div>
    </div>
  )
}
