import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

// TODO: เปลี่ยนเป็น URL จริงของ Worker "checkin-api" (ตัวเดียวกับหน้า VTBS PBB CHECK)
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

type Props = {
  myInitial: string
  myFullName?: string
}

type SuccessInfo = {
  roomCode: string
  time: string
}

function RoomCheckinPage({ myInitial, myFullName }: Props) {
  // ---------- นาฬิกา ----------
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ---------- หมายเลขห้อง (มาจากสแกน QR เท่านั้น) + GPS ----------
  const [roomCode, setRoomCode] = useState('')
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [gpsMessage, setGpsMessage] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)

  // ---------- ฟอร์ม ----------
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null)

  // อ่านหมายเลขห้องจาก URL เช่น ?qr=S1-G1-376-3 (จากการสแกน QR Code จริง)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qr = params.get('qr')
    if (qr) setRoomCode(qr.toUpperCase())
  }, [])

  // พอมีหมายเลขห้องแล้ว ลองตรวจ GPS ให้อัตโนมัติทันที
  useEffect(() => {
    if (roomCode) handleGetGps(roomCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode])

  function handleGetGps(roomOverride?: string) {
    const room = roomOverride || roomCode
    if (!room) {
      setGpsMessage('กรุณาสแกน QR Code ที่หน้าห้องก่อน')
      setGpsStatus('error')
      return
    }
    if (!navigator.geolocation) {
      setGpsMessage('อุปกรณ์นี้ไม่รองรับ GPS')
      setGpsStatus('error')
      return
    }

    setGpsStatus('loading')
    setGpsMessage('กำลังค้นหาตำแหน่ง...')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude
        const newLng = pos.coords.longitude
        setLat(newLat)
        setLng(newLng)

        try {
          const res = await fetch(CHECKIN_API_URL + '/validate-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode: room, lat: newLat, lng: newLng }),
          })
          const data = await res.json()
          const dist = Math.round(data.distanceM || 0)
          if (data.valid) {
            setGpsStatus('success')
            setGpsMessage(`สำเร็จ (ห่างจากห้อง ${dist} ม.)`)
          } else {
            setGpsStatus('error')
            setGpsMessage(`ไม่สำเร็จ (ระยะห่างจากห้อง ${dist} ม.)`)
          }
        } catch {
          setGpsStatus('error')
          setGpsMessage('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
        }
      },
      () => {
        setGpsStatus('error')
        setGpsMessage('ไม่สามารถดึงตำแหน่ง GPS ได้ กรุณาเปิดสิทธิ์ Location แล้วลองใหม่')
      },
      { enableHighAccuracy: true, timeout: 20000 }
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!roomCode) {
      setError('ไม่พบหมายเลขห้อง กรุณาสแกน QR ใหม่')
      return
    }
    if (gpsStatus !== 'success') {
      setError('กรุณาตรวจสอบตำแหน่ง GPS ให้ผ่านก่อน')
      return
    }
    if (!myInitial) {
      setError('ไม่พบข้อมูลผู้ใช้ กรุณา Login ใหม่')
      return
    }

    const snapshotRoom = roomCode

    setSubmitting(true)
    try {
      const res = await fetch(CHECKIN_API_URL + '/room-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: snapshotRoom,
          initial: myInitial,
          note,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const timeStr = new Date(data.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        setSuccessInfo({ roomCode: snapshotRoom, time: timeStr })
        setNote('')
      } else {
        setError(data.message || 'บันทึกไม่สำเร็จ')
      }
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  const dateStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <>
      <div style={{ padding: '0 12px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 480, margin: '16px auto', background: '#fff', borderRadius: 12, padding: 20, boxSizing: 'border-box' }}>
          <h2 style={{ color: '#000', textAlign: 'left', margin: '0 0 10px' }}>PBB ROOM CHECK</h2>
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#3c4043' }}>{dateStr}</div>
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#1a73e8', marginBottom: 12 }}>{timeStr}</div>

          {!roomCode && (
            <div style={{ background: '#fce8e6', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#c5221f', marginBottom: 8 }}>
              ⚠️ กรุณาสแกน QR Code ที่หน้าห้องด้วยกล้องมือถือ เพื่อเช็คอิน
            </div>
          )}

          <label style={labelStyle}>หมายเลขห้อง *</label>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              textAlign: 'center',
              padding: 16,
              background: '#e8f0fe',
              color: '#1a56c4',
              border: '2px solid #1a73e8',
              borderRadius: 8,
              letterSpacing: 1,
            }}
          >
            {roomCode || '—'}
          </div>

          {gpsMessage && (
            <div style={{ fontSize: 13, marginTop: 6, color: gpsStatus === 'success' ? '#137333' : '#c5221f' }}>
              {gpsStatus === 'loading' ? '📍 ' : ''}
              {gpsMessage}
            </div>
          )}
          <button
            type="button"
            onClick={() => handleGetGps()}
            disabled={gpsStatus === 'loading'}
            style={{ ...buttonStyle, background: '#e8f0fe', color: '#1a73e8', marginTop: 6 }}
          >
            Update Location
          </button>

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Initial</label>
            <div
              style={{
                padding: 12,
                border: '1px solid #ccc',
                borderRadius: 8,
                fontSize: 16,
                background: '#f1f3f4',
                color: '#000',
              }}
            >
              {myInitial || '—'}
              {myFullName ? <span style={{ color: '#666', fontSize: 13 }}> ({myFullName})</span> : null}
            </div>

            <label style={labelStyle}>หมายเหตุ</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ถ้ามี)" style={inputStyle} />

            <button
              type="submit"
              disabled={submitting}
              style={{ ...buttonStyle, background: '#34a853', color: '#fff', marginTop: 20 }}
            >
              {submitting ? 'กำลังบันทึก...' : 'CHECK-IN'}
            </button>

            {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
          </form>
        </div>
      </div>

      {/* ---------- Pop up สำเร็จ ---------- */}
      {successInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center', position: 'relative' }}>
            <button
              onClick={() => setSuccessInfo(null)}
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}
            >
              ✕
            </button>

            <div style={{ marginBottom: 10 }}>
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="25" fill="#e6f4ea" stroke="#137333" strokeWidth="1.5" />
                <path d="M15 27l7 7 15-15" fill="none" stroke="#137333" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h3 style={{ margin: '0 0 14px', color: '#000' }}>Check-in Successful!</h3>

            <div style={{ fontSize: 15, color: '#333', marginBottom: 4 }}>
              หมายเลขห้อง <b>{successInfo.roomCode}</b>
            </div>
            <div style={{ fontSize: 15, color: '#333' }}>
              เวลา <b>{successInfo.time}</b>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '16px 0 6px', color: '#000', textAlign: 'left' as const }
const inputStyle = {
  width: '100%',
  padding: 12,
  border: '1px solid #ccc',
  borderRadius: 8,
  fontSize: 16,
  boxSizing: 'border-box' as const,
  background: '#fff',
  color: '#000',
  colorScheme: 'light' as const,
}
const buttonStyle = {
  width: '100%',
  padding: 12,
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}

export default RoomCheckinPage