import { useEffect, useState } from 'react'
import { getServiceTypeColor } from './serviceTypeColors'

const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

const SECTION_ORDER = ['ARR', 'DEP', 'TOWING IN', 'TOWING OUT']

type Record = {
  id: string
  serviceType: string
  flightNo: string
  stand: string
  initials: string
  note: string | null
  ack: boolean
  ackAt: string | null
  createdAt: string
}

type Props = {
  role: string
  myInitial: string
}

function CheckinRecordPage({ role, myInitial }: Props) {
  const [records, setRecords] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function loadRecords() {
    fetch(CHECKIN_API_URL + '/checkins?hours=48')
      .then((res) => res.json())
      .then((data) => {
        setRecords(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError('โหลดประวัติไม่สำเร็จ')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadRecords()
    const timer = setInterval(loadRecords, 5000) // auto-refresh ทุก 5 วิ เหมือนระบบเดิม
    return () => clearInterval(timer)
  }, [])

  function handleAck(id: string) {
    fetch(CHECKIN_API_URL + '/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, initial: myInitial }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) loadRecords()
        else alert(data.message || 'ACK ไม่สำเร็จ')
      })
      .catch(() => alert('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'))
  }

  function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box' }}>
      {loading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}

      {!loading &&
        SECTION_ORDER.map((type) => {
          const sectionRecords = records.filter((r) => r.serviceType === type)
          const color = getServiceTypeColor(type)
          const unread = sectionRecords.filter((r) => !r.ack).length

          return (
            <div key={type} style={{ maxWidth: 480, margin: '0 auto 16px', background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
              <div
                style={{
                  background: color.bg,
                  color: color.text,
                  padding: '10px 14px',
                  fontWeight: 700,
                  fontSize: 15,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{type}</span>
                {unread > 0 && (
                  <span
                    style={{
                      background: '#e53935',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                    }}
                  >
                    {unread}
                  </span>
                )}
              </div>

              {sectionRecords.length === 0 ? (
                <div style={{ padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>ไม่มีข้อมูล</div>
              ) : (
                sectionRecords.map((r) => (
                  <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>
                        {r.stand} — {r.flightNo}
                      </span>
                      <span style={{ color: '#666', fontWeight: 400 }}>{timeOf(r.createdAt)}</span>
                    </div>
                    <div style={{ color: '#444', marginTop: 2 }}>Initial: {r.initials}</div>
                    {r.note && <div style={{ color: '#888', marginTop: 2 }}>หมายเหตุ: {r.note}</div>}

                    <div style={{ marginTop: 6 }}>
                      {r.ack ? (
                        <span style={{ color: '#137333', fontWeight: 700, fontSize: 12 }}>
                          ✓ ACK แล้ว {r.ackAt ? `(${timeOf(r.ackAt)})` : ''}
                        </span>
                      ) : role === 'Apron' ? (
                        <button
                          onClick={() => handleAck(r.id)}
                          style={{
                            background: '#1a73e8',
                            color: '#fff',
                            border: 'none',
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          ACK
                        </button>
                      ) : (
                        <span style={{ color: '#c5221f', fontSize: 12 }}>ยังไม่ ACK</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}
    </div>
  )
}

export default CheckinRecordPage