import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Dumbbell, Menu, X, LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import './Navbar.css'

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAdmin } = useAuth()
  const { settings } = useSettings()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const handleLogout = () => { logout(); navigate('/') }

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="navbar-brand">
        <Dumbbell size={20}/>
        <span>{settings.shopName}</span>
      </Link>

      <div className={`navbar-links ${open ? 'open' : ''}`}>
        <Link to="/"        className={`nav-link ${pathname==='/'        ? 'active':''}`}>Home</Link>
        <Link to="/bmi"     className={`nav-link ${pathname==='/bmi'     ? 'active':''}`}>BMI Calculator</Link>
        <Link to="/services" className={`nav-link ${pathname==='/services' ? 'active':''}`}>Programs</Link>
        {user ? (
          <>
            <Link to="/book" className={`nav-link ${pathname==='/book' ? 'active':''}`}>Book Session</Link>
            {isAdmin
              ? <Link to="/admin"     className={`nav-link ${pathname==='/admin'     ? 'active':''}`}><ShieldCheck size={14}/> Admin</Link>
              : <Link to="/dashboard" className={`nav-link ${pathname==='/dashboard' ? 'active':''}`}><LayoutDashboard size={14}/> Dashboard</Link>
            }
            <div className="nav-user">
              <span className="nav-avatar">{user.name.charAt(0).toUpperCase()}</span>
              <span className="nav-name">{user.name.split(' ')[0]}</span>
            </div>
            <button className="nav-logout-btn" onClick={handleLogout}>
              <LogOut size={15}/><span>Logout</span>
            </button>
          </>
        ) : (
          <>
            <Link to="/login"    className={`nav-link ${pathname==='/login'    ? 'active':''}`}>Login</Link>
            <Link to="/register" className={`nav-link nav-cta ${pathname==='/register' ? 'active':''}`}>Sign Up</Link>
          </>
        )}
      </div>

      <button className="menu-btn" onClick={() => setOpen(o => !o)}>
        {open ? <X size={22}/> : <Menu size={22}/>}
      </button>
    </nav>
  )
}
