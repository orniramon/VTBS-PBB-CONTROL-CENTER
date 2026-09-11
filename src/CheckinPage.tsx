import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

// TODO: เปลี่ยนเป็น URL จริงของ Worker "checkin-api"
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

type Employee = { initial: string; name: string }

type Props = {
  fullName: string
  role: string
  onLogout: () => void
}

function CheckinPage({ fullName, role, onLogout }: Props) {
  // ---------- ข้อมูลอ้างอิงที่โหลดครั้งเดียวตอนเปิดหน้า ----------
  const [aircraftTypes, setAircraftTypes] = useState<string[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // ---------- หลุมจอด + GPS ----------
  const [standCode, setStandCode] = useState('')
  const [concourse, setConcourse] = useState('')
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [gpsMessage, setGpsMessage] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)

  // ---------- ฟอร์มเชคอิน ----------
  const [serviceType, setServiceType] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [eibt, setEibt] = useState('')
  const [eobt, setEobt] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [maxL, setMaxL] = useState(1)
  const [initial1, setInitial1] = useState('')
  const [initial2, setInitial2] = useState('')
  const [initial3, setInitial3] = useState('')
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ time: string } | null>(null)

  // อ่านรหัสหลุมจอดจาก URL เช่น ?qr=A3 (จำลองตอนสแกน QR Code)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qr = params.get('qr')
    if (qr) setStandCode(qr)
  }, [])

  // โหลดรายชื่อรุ่นเครื่องบิน + พนักงานครั้งเดียวตอนเปิดหน้า
  useEffect(() => {
    fetch(CHECKIN_API_URL + '/aircraft-types')
      .then((res) => res.json())
      .then(setAircraftTypes)
      .catch(() => setAircraftTypes([]))

    fetch(CHECKIN_API_URL + '/employees')
      .then((res) => res.json())
      .then(setEmployees)
      .catch(() => setEmployees([]))
  }, [])

  // พอรู้ทั้ง aircraftType และ concourse แล้ว ไปถาม Max L
  useEffect(() => {
    if (!aircraftType || !concourse) return
    fetch(CHECKIN_API_URL + '/max-l', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraftType, concourse }),
    })
      .then((res) => res.json())
      .then((data) => setMaxL(data.maxL || 1))
      .catch(() => setMaxL(1))
  }, [aircraftType, concourse])

  function handleGetGps() {
    if (!standCode) {
      setGpsMessage('กรุณากรอกรหัสหลุมจอดก่อน (ปกติได้จากการสแกน QR Code)')
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
          const res = await fetch(CHECKIN_API_URL + '/validate-stand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stand: standCode, lat: newLat, lng: newLng }),
          })
          const data = await res.json()
          if (data.valid) {
            setConcourse(data.concourse)
            setGpsStatus('success')
            setGpsMessage(
              `ตรวจสอบสำเร็จ (Concourse ${data.concourse}, ห่างจากหลุมจอด ${Math.round(data.distanceM)} ม.)`
            )
          } else {
            setGpsStatus('error')
            setGpsMessage(data.message || `อยู่ไกลจากหลุมจอดเกินไป (${Math.round(data.distanceM || 0)} ม.)`)
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

  function isValidInitial(val: string) {
    if (!val) return true
    return employees.some((e) => e.initial.toUpperCase() === val.toUpperCase())
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (gpsStatus !== 'success') {
      setError('กรุณาตรวจสอบตำแหน่ง GPS ให้ผ่านก่อน')
      return
    }
    if (!serviceType) {
      setError('กรุณาเลือก Service Type')
      return
    }
    if (!flightNo.trim()) {
      setError('กรุณากรอกเลขเที่ยวบิน')
      return
    }
    if (serviceType === 'ARR' && !eibt) {
      setError('กรุณากรอก EIBT')
      return
    }
    if (serviceType === 'DEP' && !eobt) {
      setError('กรุณากรอก EOBT')
      return
    }
    if (!aircraftType) {
      setError('กรุณาเลือก Aircraft Type')
      return
    }
    if (!initial1 || !isValidInitial(initial1)) {
      setError('กรุณากรอก Initial L1 ให้ถูกต้อง')
      return
    }
    if (maxL >= 2 && !isValidInitial(initial2)) {
      setError('กรุณากรอก Initial L2 ให้ถูกต้อง')
      return
    }
    if (maxL >= 3 && !isValidInitial(initial3)) {
      setError('กรุณากรอก Initial L3 ให้ถูกต้อง')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(CHECKIN_API_URL + '/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stand: standCode,
          serviceType,
          flightNo: flightNo.trim(),
          aircraftType,
          eibt: serviceType === 'ARR' ? eibt : null,
          eobt: serviceType === 'DEP' ? eobt : null,
          initial1,
          initial2: maxL >= 2 ? initial2 : null,
          initial3: maxL >= 3 ? initial3 : null,
          lat,
          lng,
          note,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccessInfo({ time: new Date(data.time).toLocaleTimeString('th-TH') })
        // เคลียร์ฟอร์มบางส่วน เตรียมรับเที่ยวบินถัดไป
        setFlightNo('')
        setEibt('')
        setEobt('')
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

  return (
    <div style={{ fontFamily: 'sans-serif', background: '#f5f6f8', minHeight: '100vh' }}>
      <div
        style={{
          background: '#1a73e8',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>VTBS PBB Control</span>
        <span>
          {role} — {fullName} &nbsp;
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            ออกจากระบบ
          </button>
        </span>
      </div>

      <div style={{ maxWidth: 480, margin: '16px auto', background: '#fff', borderRadius: 12, padding: 20 }}>
        <h2>VTBS PBB CHECK</h2>

        <label style={labelStyle}>หลุมจอด</label>
        <input
          type="text"
          value={standCode}
          onChange={(e) => setStandCode(e.target.value.toUpperCase())}
          placeholder="เช่น A3 (ปกติได้จากสแกน QR)"
          style={{ ...inputStyle, fontSize: 24, fontWeight: 700, textAlign: 'center', background: '#e8f0fe' }}
        />

        <button
          type="button"
          onClick={handleGetGps}
          disabled={gpsStatus === 'loading'}
          style={{ ...buttonStyle, background: '#e8f0fe', color: '#1a73e8', marginTop: 8 }}
        >
          {gpsStatus === 'loading' ? 'กำลังค้นหาตำแหน่ง...' : '📍 ตรวจสอบตำแหน่ง GPS'}
        </button>
        {gpsMessage && (
          <div style={{ fontSize: 13, marginTop: 6, color: gpsStatus === 'success' ? '#137333' : '#c5221f' }}>
            {gpsMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Service Type *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['ARR', 'DEP', 'TOWING IN', 'TOWING OUT'].map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setServiceType(t)}
                style={{
                  ...toggleStyle,
                  background: serviceType === t ? '#1a73e8' : '#fff',
                  color: serviceType === t ? '#fff' : '#333',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <label style={labelStyle}>Flight No. *</label>
          <input
            type="text"
            value={flightNo}
            onChange={(e) => setFlightNo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="เช่น TG102"
            style={inputStyle}
          />

          {serviceType === 'ARR' && (
            <>
              <label style={labelStyle}>EIBT *</label>
              <input type="time" value={eibt} onChange={(e) => setEibt(e.target.value)} style={inputStyle} />
            </>
          )}
          {serviceType === 'DEP' && (
            <>
              <label style={labelStyle}>EOBT *</label>
              <input type="time" value={eobt} onChange={(e) => setEobt(e.target.value)} style={inputStyle} />
            </>
          )}

          <label style={labelStyle}>Aircraft Type *</label>
          <input
            list="aircraft-type-list"
            value={aircraftType}
            onChange={(e) => setAircraftType(e.target.value.toUpperCase())}
            placeholder="พิมพ์หรือเลือก"
            style={inputStyle}
          />
          <datalist id="aircraft-type-list">
            {aircraftTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <label style={labelStyle}>Initial L1 *</label>
          <input
            list="employee-list"
            value={initial1}
            onChange={(e) => setInitial1(e.target.value.toUpperCase())}
            style={inputStyle}
          />

          {maxL >= 2 && (
            <>
              <label style={labelStyle}>Initial L2 *</label>
              <input
                list="employee-list"
                value={initial2}
                onChange={(e) => setInitial2(e.target.value.toUpperCase())}
                style={inputStyle}
              />
            </>
          )}
          {maxL >= 3 && (
            <>
              <label style={labelStyle}>Initial L3 *</label>
              <input
                list="employee-list"
                value={initial3}
                onChange={(e) => setInitial3(e.target.value.toUpperCase())}
                style={inputStyle}
              />
            </>
          )}
          <datalist id="employee-list">
            {employees.map((e) => (
              <option key={e.initial} value={e.initial}>
                {e.name}
              </option>
            ))}
          </datalist>

          <label style={labelStyle}>หมายเหตุ</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />

          <button
            type="submit"
            disabled={submitting}
            style={{ ...buttonStyle, background: '#34a853', color: '#fff', marginTop: 20 }}
          >
            {submitting ? 'กำลังบันทึก...' : 'CHECK IN'}
          </button>

          {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
          {successInfo && (
            <div style={{ color: '#137333', fontSize: 14, marginTop: 8 }}>
              ✅ เชคอินสำเร็จ เวลา {successInfo.time}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontWeight: 600, fontSize: 14, margin: '16px 0 6px' }
const inputStyle = {
  width: '100%',
  padding: 12,
  border: '1px solid #ccc',
  borderRadius: 8,
  fontSize: 16,
  boxSizing: 'border-box' as const,
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
const toggleStyle = { ...buttonStyle, border: '1px solid #ccc', marginTop: 0 }

export default CheckinPage