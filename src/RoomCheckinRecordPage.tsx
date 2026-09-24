import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import FitText from './FitText'

const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'
const HOURS_WINDOW = 24
const DOUBLE_CLICK_MS = 400

type RoomCheckinRecord = {
  id: string
  roomCode: string
  initial: string
  note: string | null
  createdAt: string
}

const CAN_MANAGE_ROLES = ['Apron', 'Supervisor']

type Props = {
  role: string
  myInitial: string
  isActive: boolean
}

function RoomCheckinRecordPage({ role, myInitial, isActive }: Props) {
  const [records, setRecords] = useState<RoomCheckinRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string> | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<RoomCheckinRecord | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const pendingClearTimerRef = useRef<number | null>(null)

  const canManage = CAN_MANAGE_ROLES.includes(role)

  function loadRecords(silent?: boolean) {
    if (!silent) setLoading(true)
    fetch(CHECKIN_API_URL + '/room-checkins?hours=' + HOURS_WINDOW)
      .then((res) => res.json())
      .then((data) => {
        const list: RoomCheckinRecord[] = Array.isArray(data) ? data : []
        const currentIds = new Set(list.map((r) => r.id))

        if (knownIdsRef.current) {
          const fresh = new Set<string>()
          currentIds.forEach((id) => {
            if (!knownIdsRef.current!.has(id)) fresh.add(id)
          })
          if (fresh.size > 0) {
            setNewIds(fresh)
            setTimeout(() => setNewIds(new Set()), 3200)
          }
        }
        knownIdsRef.current = currentIds

        setRecords(list)
        setLoading(false)
      })
      .catch(() => {
        setError('โหลดประวัติไม่สำเร็จ')
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!isActive) return
    loadRecords()
    const timer = setInterval(() => loadRecords(true), 5000)
    return () => clearInterval(timer)
  }, [isActive])

  function confirmDelete() {
    if (!deleteTarget) return
    fetch(CHECKIN_API_URL + '/room-checkin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteTarget.id, initial: myInitial }),
    })
      .then((res) => res.json())
      .then((data) => {
        setDeleteTarget(null)
        if (data.success) loadRecords()
        else alert(data.message || 'ลบไม่สำเร็จ')
      })
      .catch(() => alert('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'))
  }

  // ---------- ดับเบิลคลิก/แตะ 2 ครั้ง เพื่อลบ (เฉพาะ Apron/Supervisor) ----------
  function handleRowClick(r: RoomCheckinRecord) {
    if (!canManage) return
    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === r.id && now - last.time < DOUBLE_CLICK_MS) {
      setDeleteTarget(r)
      setPendingDeleteId(null)
      if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current)
      lastClickRef.current = null
    } else {
      lastClickRef.current = { id: r.id, time: now }
      setPendingDeleteId(r.id)
      if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current)
      pendingClearTimerRef.current = window.setTimeout(() => setPendingDeleteId(null), DOUBLE_CLICK_MS)
    }
  }

  function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const COLS = [
    { key: 'roomCode', label: 'หมายเลขห้อง', width: 14 },
    { key: 'initial', label: 'Initial', width: 10 },
    { key: 'time', label: 'เวลา', width: 8 },
    { key: 'note', label: 'หมายเหตุ', width: 20 },
  ] as const

  const gridTemplate = COLS.map((c) => c.width + 'fr').join(' ')

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes blinkRoomRow { 0%,100% { background-color: transparent; } 50% { background-color: #90caf9; } }
        .room-row-new { animation: blinkRoomRow 0.6s 5; }
      `}</style>

      {loading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}

      {!loading && (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div
            style={{
              background: '#1a73e8',
              color: '#fff',
              padding: '10px 14px',
              fontWeight: 700,
              fontSize: 15,
              borderRadius: '10px 10px 0 0',
            }}
          >
            PBB Room Check Record
          </div>

          <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', border: '1px solid #eee', borderTop: 'none', overflow: 'hidden' }}>
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              {/* ---------- หัวตาราง ---------- */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  background: '#d8dde3',
                  position: 'sticky',
                  top: 0,
                  fontWeight: 700,
                  color: '#000',
                  zIndex: 1,
                }}
              >
                {COLS.map((c) => (
                  <div
                    key={c.key}
                    style={{
                      borderRight: '1px solid #c3c9d1',
                      padding: '8px 6px',
                      fontSize: 13,
                      color: '#000',
                      minWidth: 0,
                    }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>

              {/* ---------- แถวข้อมูล ---------- */}
              {records.length === 0 ? (
                <div style={{ padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>ไม่มีข้อมูล</div>
              ) : (
                records.map((r, idx) => (
                  <div
                    key={r.id}
                    className={newIds.has(r.id) ? 'room-row-new' : ''}
                    onClick={() => handleRowClick(r)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridTemplate,
                      borderBottom: '1px solid #eee',
                      background: pendingDeleteId === r.id ? '#fff3cd' : idx % 2 === 0 ? '#ffffff' : '#f0f3f8',
                      color: '#000',
                      cursor: canManage ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ borderRight: '1px solid #eee', padding: '8px 6px', fontSize: 14, minWidth: 0 }}>
                      <FitText text={r.roomCode} />
                    </div>
                    <div style={{ borderRight: '1px solid #eee', padding: '8px 6px', fontSize: 14, minWidth: 0 }}>
                      <FitText text={r.initial} />
                    </div>
                    <div style={{ borderRight: '1px solid #eee', padding: '8px 6px', fontSize: 14, minWidth: 0 }}>
                      <FitText text={timeOf(r.createdAt)} />
                    </div>
                    <div style={{ padding: '8px 6px', fontSize: 14, minWidth: 0 }}>
                      <FitText text={r.note || ''} minScale={0.7} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {canManage && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 8, textAlign: 'center' }}>
              * แตะแถว 2 ครั้งติดกัน เพื่อลบรายการ (เฉพาะ Apron/Supervisor)
            </div>
          )}
        </div>
      )}

      {/* ---------- ป๊อบอัพยืนยันลบ ---------- */}
      {deleteTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 14px', color: '#000' }}>ยืนยันการลบ</h3>
            <p style={{ color: '#333', margin: '0 0 4px' }}>
              ต้องการลบเช็คอินของ {deleteTarget.initial}
            </p>
            <p style={{ color: '#333', margin: '0 0 16px' }}>ห้อง {deleteTarget.roomCode} ใช่หรือไม่</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={confirmDelete} style={{ ...buttonStyle, background: '#c5221f', color: '#fff' }}>
                ตกลง
              </button>
              <button onClick={() => setDeleteTarget(null)} style={{ ...buttonStyle, background: '#999', color: '#fff' }}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const buttonStyle = { padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
}
const modalBoxStyle: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  maxWidth: 380,
  width: '100%',
  position: 'relative',
}

export default RoomCheckinRecordPage