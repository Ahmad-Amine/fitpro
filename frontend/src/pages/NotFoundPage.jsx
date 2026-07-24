import React from 'react'
import { Link } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'calc(100vh - 72px)', padding:'40px', textAlign:'center' }}>
      <Dumbbell size={64} style={{color:'var(--primary)', marginBottom:'24px'}}/>
      <h1 style={{fontFamily:'var(--font-display)', fontSize:'5rem', color:'var(--dark)', lineHeight:1}}>404</h1>
      <p style={{color:'var(--grey)', fontSize:'1.1rem', margin:'16px 0 32px'}}>Looks like this page skipped leg day. It doesn't exist!</p>
      <Link to="/" className="btn btn-primary">Back to Home</Link>
    </div>
  )
}
