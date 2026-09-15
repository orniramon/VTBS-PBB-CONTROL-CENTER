import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import './App.css'
import MainLayout from './MainLayout'
import type { TabName } from './MainLayout'
import CheckinPage from './CheckinPage'
import CheckinRecordPage from './CheckinRecordPage'
import PhotoPage from './PhotoPage'

// TODO: เปลี่ยนเป็น URL ของ Cloudflare Worker "login" ที่ deploy ไว้จริง
const WORKER_LOGIN_URL = 'https://login.or-niramon.workers.dev'

type Session = {
  initial: string
  fullName: string
  role: string
  expiry: number
}

function App() {
  const [initial, setInitial] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [activeTab, setActiveTab] = useState<TabName>('VTBS PBB CHECK')

  // ตอนเปิดหน้าเว็บ เช็คว่ามี session เก่าที่ยังไม่หมดอายุไหม (เหมือนระบบเดิม)
  useEffect(() => {
    const saved = localStorage.getItem('plb_session')
    if (saved) {
      const parsed: Session = JSON.parse(saved)
      if (parsed.expiry > Date.now()) {
        setSession(parsed)
      } else {
        localStorage.removeItem('plb_session')
      }
    }
  }, [])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!initial.trim() || !password.trim()) {
      setError('กรุณากรอก Initial และรหัสผ่านให้ครบ')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(WORKER_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial: initial.trim(), password: password.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Initial หรือรหัสผ่านไม่ถูกต้อง')
        return
      }

      const newSession: Session = {
        initial: data.initial,
        fullName: data.full_name,
        role: data.group,
        expiry: Date.now() + 5 * 60 * 60 * 1000, // 5 ชั่วโมง เหมือนระบบเดิม
      }
      localStorage.setItem('plb_session', JSON.stringify(newSession))
      setSession(newSession)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('plb_session')
    setSession(null)
    setInitial('')
    setPassword('')
  }

  // ---------- หน้าหลังล็อกอินสำเร็จ ----------
  if (session) {
    return (
      <MainLayout initial={session.initial} role={session.role} onLogout={handleLogout} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'VTBS PBB CHECK' && <CheckinPage />}
        {activeTab === 'PBB Check Record' && <CheckinRecordPage role={session.role} myInitial={session.initial} />}
        {activeTab === 'PBB Photo' && <PhotoPage myInitial={session.initial} />}
        {activeTab === 'PBB Operator' && (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>หน้านี้ยังไม่ได้พัฒนา (ขั้นตอนถัดไป)</div>
        )}
      </MainLayout>
    )
  }

  // ---------- หน้า Login ----------
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'TH Sarabun PSK', 'Sarabun', sans-serif",
        background: '#f5f6f8',
        colorScheme: 'light',
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '30px 24px',
          maxWidth: 360,
          width: '100%',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#000', fontSize: 22, lineHeight: 1.3, margin: '0 0 8px' }}>
          VTBS AEROBRIDGE
          <br />
          CONTROL CENTER
        </h2>
        <p style={{ color: '#666', fontSize: 14 }}>กรุณากรอก Initial และรหัสผ่าน</p>

        <input
          type="text"
          placeholder="Initial เช่น NI"
          value={initial}
          maxLength={4}
          autoComplete="off"
          onChange={(e) => setInitial(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="••••"
          inputMode="numeric"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 14,
            background: '#1a73e8',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'กำลังตรวจสอบ...' : 'Login'}
        </button>

        {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
      </form>
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 14,
  fontSize: 18,
  textAlign: 'center',
  border: '2px solid #ddd',
  borderRadius: 8,
  margin: '8px 0',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#000',
  colorScheme: 'light',
}

export default App