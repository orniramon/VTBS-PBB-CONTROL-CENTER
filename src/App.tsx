import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import './App.css'
import MainLayout from './MainLayout'
import { TABS } from './MainLayout'
import type { TabName } from './MainLayout'
import CheckinPage from './CheckinPage'
import CheckinRecordPage from './CheckinRecordPage'
import PhotoPage from './PhotoPage'
import EsummaryPage from './EsummaryPage'
import RoomCheckinPage from './RoomCheckinPage'
import RoomCheckinRecordPage from './RoomCheckinRecordPage'

// TODO: เปลี่ยนเป็น URL ของ Cloudflare Worker "login" ที่ deploy ไว้จริง
const WORKER_LOGIN_URL = 'https://login.or-niramon.workers.dev'

type Session = {
  initial: string
  fullName: string
  role: string
  expiry: number
}

// หมายเลขห้องพนักงานจะมีเครื่องหมาย "-" อยู่ในชื่อเสมอ (เช่น S1-G1-376-3)
// ต่างจากหลุมจอดเครื่องบินที่ไม่มี "-" (เช่น A3, S105)
// ใช้จุดสังเกตนี้ตัดสินว่าสแกน QR แล้วควรเปิดแท็บไหนให้อัตโนมัติ
function initialTabFromQr(): TabName {
  const params = new URLSearchParams(window.location.search)
  const qr = params.get('qr')

  // มาจากการสแกน QR เสมอ -> เปิดแท็บตามรูปแบบ QR ทันที ไม่ใช้แท็บที่จำไว้
  // (QR หลุมจอด ไม่มี "-" -> VTBS PBB CHECK, QR ห้องพนักงาน มี "-" -> Check-in)
  if (qr) return qr.includes('-') ? 'Check-in' : 'VTBS PBB CHECK'

  // ไม่ได้มาจากการสแกน QR -> ใช้แท็บล่าสุดที่เปิดไว้ก่อนรีเฟรช (ถ้ามี)
  // เพื่อไม่ให้รีเฟรชหน้าเว็บแล้วเด้งกลับไปแท็บแรกเสมอ
  const savedTab = localStorage.getItem('plb_active_tab')
  if (savedTab && (TABS as readonly string[]).includes(savedTab)) return savedTab as TabName

  return 'VTBS PBB CHECK'
}

function App() {
  const [initial, setInitial] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [activeTab, setActiveTab] = useState<TabName>(initialTabFromQr)

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

  // เอา ?qr=... ออกจาก URL หลังจากอ่านไปใช้ตอนเปิดหน้าเว็บครั้งนี้แล้ว ไม่งั้นค่า qr จะติดอยู่
  // ใน URL ตลอด ทำให้กดรีเฟรชหน้าเว็บครั้งต่อไป (ไม่ว่าจะอยู่แท็บไหน) ถูกเข้าใจผิดว่าเพิ่งสแกน
  // QR ซ้ำทุกครั้ง แล้วเด้งไปแท็บ VTBS PBB CHECK
  //
  // ต้องรอให้มี session ก่อน (เช็ค session != null) เพราะตอนเพิ่งเปิดหน้าเว็บ ถ้ายังไม่ login
  // หน้าจอจะเรนเดอร์ "ฟอร์ม Login" ก่อน (ยังไม่ได้แสดง MainLayout/แท็บ VTBS PBB CHECK เลย)
  // ถ้าลบ qr ออกจาก URL ตอนนั้น พอ login ผ่านแล้วแท็บ VTBS PBB CHECK ค่อยถูกสร้างขึ้นจริง
  // มันจะหาค่า qr ใน URL ไม่เจอแล้ว (หลุมจอดจะไม่โชว์เลย - ตามที่เจอปัญหา) การรอให้มี
  // session ก่อน ทำให้แท็บ VTBS PBB CHECK/Check-in ได้อ่านค่า qr ไปกรอกหลุมจอด/ห้องให้
  // เรียบร้อยก่อนเสมอ ก่อนที่ effect นี้จะมาลบ qr ออกจาก URL ทีหลัง
  useEffect(() => {
    if (!session) return
    const params = new URLSearchParams(window.location.search)
    if (params.has('qr')) {
      params.delete('qr')
      const query = params.toString()
      const newUrl = window.location.pathname + (query ? '?' + query : '') + window.location.hash
      window.history.replaceState({}, '', newUrl)
    }
  }, [session])

  // จำแท็บล่าสุดที่เปิดไว้ ไว้ใน localStorage ทุกครั้งที่สลับแท็บ
  // เพื่อให้กดรีเฟรชหน้าเว็บแล้วยังอยู่แท็บเดิม ไม่เด้งกลับไปแท็บแรก
  useEffect(() => {
    localStorage.setItem('plb_active_tab', activeTab)
  }, [activeTab])

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
        <div style={{ display: activeTab === 'VTBS PBB CHECK' ? 'block' : 'none' }}>
          <CheckinPage />
        </div>
        <div style={{ display: activeTab === 'PBB Check Record' ? 'block' : 'none' }}>
          <CheckinRecordPage role={session.role} myInitial={session.initial} isActive={activeTab === 'PBB Check Record'} />
        </div>
        <div style={{ display: activeTab === 'PBB Photo' ? 'block' : 'none' }}>
          <PhotoPage myInitial={session.initial} role={session.role} isActive={activeTab === 'PBB Photo'} />
        </div>
        <div style={{ display: activeTab === 'PBB Operator' ? 'block' : 'none' }}>
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>หน้านี้ยังไม่ได้พัฒนา (ขั้นตอนถัดไป)</div>
        </div>
        <div style={{ display: activeTab === 'e-Summary' ? 'block' : 'none' }}>
          <EsummaryPage isActive={activeTab === 'e-Summary'} myInitial={session.initial} role={session.role} />
        </div>
        <div style={{ display: activeTab === 'Check-in' ? 'block' : 'none' }}>
          <RoomCheckinPage myInitial={session.initial} myFullName={session.fullName} />
        </div>
        <div style={{ display: activeTab === 'Check-in Record' ? 'block' : 'none' }}>
          <RoomCheckinRecordPage role={session.role} myInitial={session.initial} isActive={activeTab === 'Check-in Record'} />
        </div>
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