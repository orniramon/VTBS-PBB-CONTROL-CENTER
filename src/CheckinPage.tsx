import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AutocompleteInput from './AutocompleteInput'
import { getServiceTypeColor } from './serviceTypeColors'

// TODO: เปลี่ยนเป็น URL จริงของ Worker "checkin-api"
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

type Employee = { initial: string; name: string }

type SuccessInfo = {
  serviceType: string
  flightNo: string
  stand: string
  time: string
}

function CheckinPage() {
  // ---------- ข้อมูลอ้างอิงที่โหลดครั้งเดียวตอนเปิดหน้า ----------
  const [aircraftTypes, setAircraftTypes] = useState<string[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  // ---------- นาฬิกา ----------
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ---------- หลุมจอด (มาจากสแกน QR เท่านั้น) + GPS ----------
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
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null)

  // อ่านรหัสหลุมจอดจาก URL เช่น ?qr=A3 (จากการสแกน QR Code จริง)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qr = params.get('qr')
    if (qr) setStandCode(qr.toUpperCase())
  }, [])

  // พอมีรหัสหลุมจอดแล้ว ลองตรวจ GPS ให้อัตโนมัติทันที
  useEffect(() => {
    if (standCode) handleGetGps(standCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standCode])

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

  function handleGetGps(standOverride?: string) {
    const stand = standOverride || standCode
    if (!stand) {
      setGpsMessage('กรุณาสแกน QR Code ที่หลุมจอดก่อน')
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
            body: JSON.stringify({ stand, lat: newLat, lng: newLng }),
          })
          const data = await res.json()
          const dist = Math.round(data.distanceM || 0)
          if (data.valid) {
            setConcourse(data.concourse)
            setGpsStatus('success')
            setGpsMessage(`สำเร็จ (ห่างจากหลุมจอด ${dist} ม.)`)
          } else {
            setGpsStatus('error')
            setGpsMessage(`ไม่สำเร็จ (ระยะห่างจากหลุมจอด ${dist} ม.)`)
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

  function nameFor(val: string) {
    const match = employees.find((e) => e.initial.toUpperCase() === val.toUpperCase())
    return match ? match.name : ''
  }

  function isValidInitial(val: string) {
    if (!val) return true
    return employees.some((e) => e.initial.toUpperCase() === val.toUpperCase())
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!standCode) {
      setError('ไม่พบข้อมูลหลุมจอด กรุณาสแกน QR ใหม่')
      return
    }
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

    // เก็บค่าที่ต้องโชว์ใน popup ไว้ก่อน เพราะฟอร์มด้านล่างจะถูกเคลียร์หลังบันทึกสำเร็จ
    const snapshotServiceType = serviceType
    const snapshotFlightNo = flightNo.trim()
    const snapshotStand = standCode

    setSubmitting(true)
    try {
      const res = await fetch(CHECKIN_API_URL + '/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stand: standCode,
          serviceType,
          flightNo: snapshotFlightNo,
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
        const timeStr = new Date(data.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        setSuccessInfo({ serviceType: snapshotServiceType, flightNo: snapshotFlightNo, stand: snapshotStand, time: timeStr })
        setServiceType('')
        setFlightNo('')
        setEibt('')
        setEobt('')
        setAircraftType('')
        setMaxL(1)
        setInitial1('')
        setInitial2('')
        setInitial3('')
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
      {/* ---------- การ์ดฟอร์ม ---------- */}
      <div style={{ padding: '0 12px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 480, margin: '16px auto', background: '#fff', borderRadius: 12, padding: 20, boxSizing: 'border-box' }}>
          <h2 style={{ color: '#000', textAlign: 'left', margin: '0 0 10px' }}>VTBS PBB CHECK</h2>
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#3c4043' }}>{dateStr}</div>
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#1a73e8', marginBottom: 12 }}>{timeStr}</div>

          {!standCode && (
            <div style={{ background: '#fce8e6', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#c5221f', marginBottom: 8 }}>
              ⚠️ กรุณาสแกน QR Code ที่หลุมจอดด้วยกล้องมือถือ เพื่อเชคอิน
            </div>
          )}

          <label style={labelStyle}>หลุมจอด *</label>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              textAlign: 'center',
              padding: 16,
              background: '#e8f0fe',
              color: '#1a56c4',
              border: '2px solid #1a73e8',
              borderRadius: 8,
              letterSpacing: 2,
            }}
          >
            {standCode || '—'}
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
                    color: serviceType === t ? '#fff' : '#000',
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
                <input type="time" value={eibt} onChange={(e) => setEibt(e.target.value)} style={timeInputStyle} />
              </>
            )}
            {serviceType === 'DEP' && (
              <>
                <label style={labelStyle}>EOBT *</label>
                <input type="time" value={eobt} onChange={(e) => setEobt(e.target.value)} style={timeInputStyle} />
              </>
            )}

            <label style={labelStyle}>Aircraft Type *</label>
            <AutocompleteInput
              value={aircraftType}
              onChange={setAircraftType}
              options={aircraftTypes.map((t) => ({ code: t }))}
              placeholder="พิมพ์หรือแตะเพื่อเลือก"
            />

            <label style={labelStyle}>Initial L1 *</label>
            <AutocompleteInput
              value={initial1}
              onChange={setInitial1}
              options={employees.map((e) => ({ code: e.initial, label: e.name }))}
              placeholder="พิมพ์หรือแตะเพื่อเลือก"
              displayName={nameFor(initial1)}
            />

            {maxL >= 2 && (
              <>
                <label style={labelStyle}>Initial L2 *</label>
                <AutocompleteInput
                  value={initial2}
                  onChange={setInitial2}
                  options={employees.map((e) => ({ code: e.initial, label: e.name }))}
                  placeholder="พิมพ์หรือแตะเพื่อเลือก"
                  displayName={nameFor(initial2)}
                />
              </>
            )}
            {maxL >= 3 && (
              <>
                <label style={labelStyle}>Initial L3 *</label>
                <AutocompleteInput
                  value={initial3}
                  onChange={setInitial3}
                  options={employees.map((e) => ({ code: e.initial, label: e.name }))}
                  placeholder="พิมพ์หรือแตะเพื่อเลือก"
                  displayName={nameFor(initial3)}
                />
              </>
            )}

            <label style={labelStyle}>หมายเหตุ</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ถ้ามี)" style={inputStyle} />

            <button
              type="submit"
              disabled={submitting}
              style={{ ...buttonStyle, background: '#34a853', color: '#fff', marginTop: 20 }}
            >
              {submitting ? 'กำลังบันทึก...' : 'PBB CHECK'}
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

            <h3 style={{ margin: '0 0 14px', color: '#000' }}>PBB Check Successful!</h3>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  background: getServiceTypeColor(successInfo.serviceType).bg,
                  color: getServiceTypeColor(successInfo.serviceType).text,
                  padding: '5px 14px',
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {successInfo.serviceType}
              </span>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#000' }}>{successInfo.flightNo}</span>
            </div>

            <div style={{ fontSize: 15, color: '#333', marginBottom: 4 }}>
              หลุมจอด <b>{successInfo.stand}</b>
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
// ช่องเวลาแยกออกมา ไม่ยืดเต็มความกว้าง (ต้นเหตุที่ล้นขอบบนมือถือบางรุ่น) และชิดซ้ายเสมอ
const timeInputStyle = {
  ...inputStyle,
  width: 'auto',
  maxWidth: 180,
  minWidth: 140,
  display: 'block' as const,
  marginLeft: 0,
  marginRight: 'auto',
  textAlign: 'left' as const,
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