import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'

const HomePage      = lazy(() => import('./pages/HomePage'))
const ServicesPage  = lazy(() => import('./pages/ServicesPage'))
const BMIPage       = lazy(() => import('./pages/BMIPage'))
const ProgramPage   = lazy(() => import('./pages/ProgramPage'))
const PaymentPage   = lazy(() => import('./pages/PaymentPage'))
const BookingPage   = lazy(() => import('./pages/BookingPage'))
const LoginPage     = lazy(() => import('./pages/LoginPage'))
const RegisterPage  = lazy(() => import('./pages/RegisterPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const AdminPage     = lazy(() => import('./pages/AdminPage'))
const NotFoundPage  = lazy(() => import('./pages/NotFoundPage'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><div className="spinner spinner-dark"/></div>
  return user ? children : <Navigate to="/login" replace/>
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><div className="spinner spinner-dark"/></div>
  if (!user) return <Navigate to="/login" replace/>
  if (!isAdmin) return <Navigate to="/dashboard" replace/>
  return children
}

function AppInner() {
  return (
    <div className="page-wrapper">
      <Navbar/>
      <main className="main-content">
        <Suspense fallback={<div style={{display:'flex',justifyContent:'center',padding:'80px'}}><div className="spinner spinner-dark"/></div>}>
          <Routes>
            <Route path="/"             element={<HomePage/>}/>
            <Route path="/services"     element={<ServicesPage/>}/>
            <Route path="/services/:id" element={<ProgramPage/>}/>
            <Route path="/bmi"          element={<BMIPage/>}/>
            <Route path="/login"     element={<LoginPage/>}/>
            <Route path="/register"  element={<RegisterPage/>}/>
            <Route path="/book"      element={<ProtectedRoute><BookingPage/></ProtectedRoute>}/>
            <Route path="/pay"       element={<ProtectedRoute><PaymentPage/></ProtectedRoute>}/>
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage/></ProtectedRoute>}/>
            <Route path="/admin"     element={<AdminRoute><AdminPage/></AdminRoute>}/>
            <Route path="*"          element={<NotFoundPage/>}/>
          </Routes>
        </Suspense>
      </main>
      <Footer/>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" toastOptions={{
            style: { fontFamily:'var(--font-body)', background:'#fff', color:'var(--dark)', borderLeft:'4px solid var(--primary)', borderRadius:'12px' },
            success: { iconTheme: { primary:'var(--primary)', secondary:'#fff' } }
          }}/>
          <AppInner/>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  )
}
