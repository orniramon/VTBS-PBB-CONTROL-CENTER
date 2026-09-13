import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import AutocompleteInput from './AutocompleteInput'
import { getServiceTypeColor } from './serviceTypeColors'

const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'
const HOURS_WINDOW = 8

type CheckinRecord = {
  id: string
  serviceType: string
  flightNo: string
  aircraftType: string
  stand: string
  initials: string
  note: string | null
  ack: boolean
  ackAt: string | null
  ackByInitial: string | null
  createdAt: string
}

type ColKey = 'ackGroup' | 'stand' | 'flightNo' | 'aircraftType' | 'initials' | 'time' | 'note'
type ColDef = { key: ColKey; label: string; width: number }

const DEFAULT_COLS: ColDef[] = [
  { key: 'ackGroup', label: 'ACK', width: 150 },
  { key: 'stand', label: 'หลุมจอด', width: 90 },
  { key: 'flightNo', label: 'Flight No.', width: 100 },
  { key: 'aircraftType', label: 'A/C Type', width: 90 },
  { key: 'initials', label: 'Initial', width: 110 },
  { key: 'time', label: 'เวลา', width: 70 },
  { key: 'note', label: 'หมายเหตุ', width: 200 },
]

const SECTION_LABEL: Record<string, string> = {
  ARR: 'ขาเข้า (ARR)',
  DEP: 'ขาออก (DEP)',
  'TOWING IN': 'TOWING IN',
  'TOWING OUT': 'TOWING OUT',
}

const CAN_MANAGE_ROLES = ['Apron', 'Supervisor']

type Employee = { initial: string; name: string }
type Stand = { stand: string; concourse: string }

type Props = {
  role: string
  myInitial: string
}

function CheckinRecordPage({ role, myInitial }: Props) {
  const [records, setRecords] = useState<CheckinRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sectionOrder, setSectionOrder] = useState<string[]>(['ARR', 'DEP', 'TOWING IN', 'TOWING OUT'])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [cols, setCols] = useState<ColDef[]>(DEFAULT_COLS)

  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const knownIdsRef = useRef<Set<string> | null>(null)

  const [addModalType, setAddModalType] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CheckinRecord | null>(null)
  const pressTimerRef = useRef<number | null>(null)

  const canManage = CAN_MANAGE_ROLES.includes(role)

  function loadRecords() {
    fetch(CHECKIN_API_URL + '/checkins?hours=' + HOURS_WINDOW)
      .then((res) => res.json())
      .then((data) => {
        const list: CheckinRecord[] = Array.isArray(data) ? data : []
        const currentIds = new Set(list.map((r) => r.id))

        if (knownIdsRef.current) {
          const fresh = new Set<string>()
          currentIds.forEach((id) => {
            if (!knownIdsRef.current!.has(id)) fresh.add(id)
          })
          if (fresh.size > 0) {
            setNewIds(fresh)
            setTimeout(() => setNewIds(new Set()), 3200) // เลิกกระพริบหลัง ~5 รอบ (0.6s x 5)
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
    loadRecords()
    const timer = setInterval(loadRecords, 5000)
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

  function confirmDelete() {
    if (!deleteTarget) return
    fetch(CHECKIN_API_URL + '/checkin', {
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

  // ---------- กดค้างเพื่อลบ (เฉพาะ Apron/Supervisor) ----------
  function startPress(r: CheckinRecord) {
    if (!canManage) return
    pressTimerRef.current = window.setTimeout(() => setDeleteTarget(r), 600)
  }
  function cancelPress() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  // ---------- ลาก-วาง reorder หัวข้อ (section) ----------
  function onSectionDrop(fromType: string, toType: string) {
    const arr = [...sectionOrder]
    const fromIdx = arr.indexOf(fromType)
    const toIdx = arr.indexOf(toType)
    arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, fromType)
    setSectionOrder(arr)
  }

  // ---------- ลาก-วาง reorder คอลัมน์ ----------
  function onColDrop(fromKey: ColKey, toKey: ColKey) {
    const arr = [...cols]
    const fromIdx = arr.findIndex((c) => c.key === fromKey)
    const toIdx = arr.findIndex((c) => c.key === toKey)
    const moved = arr.splice(fromIdx, 1)[0]
    arr.splice(toIdx, 0, moved)
    setCols(arr)
  }

  function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const gridTemplate = cols.map((c) => c.width + 'px').join(' ')

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box' }}>
      <style>{`
        @keyframes blinkRow { 0%,100% { background-color: transparent; } 50% { background-color: #90caf9; } }
        .rec-row-new { animation: blinkRow 0.6s 5; }
      `}</style>

      {loading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}

      {!loading &&
        sectionOrder.map((type) => {
          const sectionRecords = records.filter((r) => r.serviceType === type)
          const color = getServiceTypeColor(type)
          const unread = sectionRecords.filter((r) => !r.ack).length
          const isCollapsed = collapsed[type]

          return (
            <div key={type} style={{ maxWidth: 700, margin: '0 auto 16px' }}>
              {/* ---------- หัวข้อ (ลากสลับตำแหน่งได้) ---------- */}
              <div
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', type)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  onSectionDrop(e.dataTransfer.getData('text/plain'), type)
                }}
                style={{
                  background: color.bg,
                  color: color.text,
                  padding: '10px 14px',
                  fontWeight: 700,
                  fontSize: 15,
                  borderRadius: '10px 10px 0 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}
                  onClick={() => setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))}
                >
                  <span>{isCollapsed ? '▶' : '▼'}</span>
                  <span>{SECTION_LABEL[type] || type}</span>
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
                {canManage && (
                  <button
                    onClick={() => setAddModalType(type)}
                    style={{
                      background: 'rgba(0,0,0,0.15)',
                      border: 'none',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    +
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', maxHeight: 420, overflow: 'auto' }}>
                  <div style={{ minWidth: gridTemplate ? cols.reduce((s, c) => s + c.width, 0) : '100%' }}>
                    {/* ---------- แถวหัวตาราง (ลากสลับคอลัมน์ได้) ---------- */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: gridTemplate,
                        background: '#d8dde3',
                        position: 'sticky',
                        top: 0,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {cols.map((c) => (
                        <div
                          key={c.key}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', c.key)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            onColDrop(e.dataTransfer.getData('text/plain') as ColKey, c.key)
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRight: '1px solid #c3c9d1',
                            cursor: 'grab',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.key === 'ackGroup' ? (
                            <div style={{ display: 'flex' }}>
                              <span style={{ flex: 1, textAlign: 'center' }}>ACK</span>
                              <span style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid #c3c9d1' }}>เวลา ACK</span>
                            </div>
                          ) : (
                            c.label
                          )}
                        </div>
                      ))}
                    </div>

                    {/* ---------- แถวข้อมูล ---------- */}
                    {sectionRecords.length === 0 ? (
                      <div style={{ padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>ไม่มีข้อมูล</div>
                    ) : (
                      sectionRecords.map((r) => (
                        <div
                          key={r.id}
                          className={newIds.has(r.id) ? 'rec-row-new' : ''}
                          onMouseDown={() => startPress(r)}
                          onMouseUp={cancelPress}
                          onMouseLeave={cancelPress}
                          onTouchStart={() => startPress(r)}
                          onTouchEnd={cancelPress}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: gridTemplate,
                            fontSize: 13,
                            borderBottom: '1px solid #eee',
                          }}
                        >
                          {cols.map((c) => (
                            <div
                              key={c.key}
                              style={{
                                padding: '8px 10px',
                                borderRight: '1px solid #eee',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.key === 'ackGroup' ? (
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <div style={{ flex: 1, textAlign: 'center' }}>
                                    {r.ack ? (
                                      <span style={{ color: '#137333', fontWeight: 700 }}>{r.ackByInitial || '✓'}</span>
                                    ) : role === 'Apron' ? (
                                      <button
                                        onClick={() => handleAck(r.id)}
                                        style={{
                                          background: '#1a73e8',
                                          color: '#fff',
                                          border: 'none',
                                          padding: '3px 10px',
                                          borderRadius: 12,
                                          fontSize: 11,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ACK
                                      </button>
                                    ) : (
                                      <span style={{ color: '#c5221f' }}>ยังไม่ ACK</span>
                                    )}
                                  </div>
                                  <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid #eee', color: '#137333' }}>
                                    {r.ackAt ? timeOf(r.ackAt) : ''}
                                  </div>
                                </div>
                              ) : c.key === 'stand' ? (
                                r.stand
                              ) : c.key === 'flightNo' ? (
                                r.flightNo
                              ) : c.key === 'aircraftType' ? (
                                r.aircraftType
                              ) : c.key === 'initials' ? (
                                r.initials
                              ) : c.key === 'time' ? (
                                timeOf(r.createdAt)
                              ) : c.key === 'note' ? (
                                r.note || ''
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

      {/* ---------- ป๊อบอัพเพิ่มเชคอินด้วยมือ ---------- */}
      {addModalType && (
        <ManualAddModal
          serviceType={addModalType}
          onClose={() => setAddModalType(null)}
          onDone={() => {
            setAddModalType(null)
            loadRecords()
          }}
        />
      )}

      {/* ---------- ป๊อบอัพยืนยันลบ ---------- */}
      {deleteTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 12px', color: '#000' }}>ยืนยันการลบ</h3>
            <p style={{ color: '#333' }}>
              ต้องการลบ <b>{deleteTarget.serviceType}</b> เที่ยวบิน <b>{deleteTarget.flightNo}</b> หลุมจอด{' '}
              <b>{deleteTarget.stand}</b> ใช่หรือไม่?
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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

// =====================================================================
// ป๊อบอัพเพิ่มเชคอินด้วยมือ — ฟิลด์เหมือนหน้า PBB Check แต่เลือกหลุมจอดเอง
// และระบุเวลาเชคอินเองได้ (ไม่ผูกกับ GPS)
// =====================================================================
function ManualAddModal({
  serviceType,
  onClose,
  onDone,
}: {
  serviceType: string
  onClose: () => void
  onDone: () => void
}) {
  const [stands, setStands] = useState<Stand[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [aircraftTypes, setAircraftTypes] = useState<string[]>([])

  const [stand, setStand] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [checkinTime, setCheckinTime] = useState('')
  const [aircraftType, setAircraftType] = useState('')
  const [maxL, setMaxL] = useState(1)
  const [initial1, setInitial1] = useState('')
  const [initial2, setInitial2] = useState('')
  const [initial3, setInitial3] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(CHECKIN_API_URL + '/stands').then((r) => r.json()).then(setStands).catch(() => setStands([]))
    fetch(CHECKIN_API_URL + '/employees').then((r) => r.json()).then(setEmployees).catch(() => setEmployees([]))
    fetch(CHECKIN_API_URL + '/aircraft-types').then((r) => r.json()).then(setAircraftTypes).catch(() => setAircraftTypes([]))
  }, [])

  const selectedStand = stands.find((s) => s.stand === stand)

  useEffect(() => {
    if (!aircraftType || !selectedStand) return
    fetch(CHECKIN_API_URL + '/max-l', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraftType, concourse: selectedStand.concourse }),
    })
      .then((r) => r.json())
      .then((d) => setMaxL(d.maxL || 1))
      .catch(() => setMaxL(1))
  }, [aircraftType, selectedStand])

  function nameFor(val: string) {
    const m = employees.find((e) => e.initial.toUpperCase() === val.toUpperCase())
    return m ? m.name : ''
  }

  async function handleConfirm() {
    setError('')
    if (!stand) return setError('กรุณาเลือกหลุมจอด')
    if (!flightNo.trim()) return setError('กรุณากรอกเลขเที่ยวบิน')
    if (!checkinTime) return setError('กรุณาระบุเวลาเชคอิน')
    if (!aircraftType) return setError('กรุณาเลือก Aircraft Type')
    if (!initial1) return setError('กรุณากรอก Initial L1')

    setSubmitting(true)
    try {
      const res = await fetch(CHECKIN_API_URL + '/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stand,
          serviceType,
          flightNo: flightNo.trim().toUpperCase(),
          aircraftType,
          initial1,
          initial2: maxL >= 2 ? initial2 : null,
          initial3: maxL >= 3 ? initial3 : null,
          note,
          checkinTime,
        }),
      })
      const data = await res.json()
      if (data.success) onDone()
      else setError(data.message || 'บันทึกไม่สำเร็จ')
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        <button onClick={onClose} style={closeBtnStyle}>
          ✕
        </button>
        <h3 style={{ marginTop: 0, color: '#000' }}>เพิ่ม {SECTION_LABEL[serviceType] || serviceType} ด้วยมือ</h3>

        <label style={labelStyle}>หลุมจอด *</label>
        <select value={stand} onChange={(e) => setStand(e.target.value)} style={inputStyle}>
          <option value="">-- เลือกหลุมจอด --</option>
          {stands.map((s) => (
            <option key={s.stand} value={s.stand}>
              {s.stand} ({s.concourse})
            </option>
          ))}
        </select>

        <label style={labelStyle}>Flight No. *</label>
        <input
          type="text"
          value={flightNo}
          onChange={(e) => setFlightNo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          style={inputStyle}
        />

        <label style={labelStyle}>เวลาเชคอิน *</label>
        <input type="time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />

        <label style={labelStyle}>Aircraft Type *</label>
        <AutocompleteInput value={aircraftType} onChange={setAircraftType} options={aircraftTypes.map((t) => ({ code: t }))} />

        <label style={labelStyle}>Initial L1 *</label>
        <AutocompleteInput
          value={initial1}
          onChange={setInitial1}
          options={employees.map((e) => ({ code: e.initial, label: e.name }))}
          displayName={nameFor(initial1)}
        />

        {maxL >= 2 && (
          <>
            <label style={labelStyle}>Initial L2</label>
            <AutocompleteInput
              value={initial2}
              onChange={setInitial2}
              options={employees.map((e) => ({ code: e.initial, label: e.name }))}
              displayName={nameFor(initial2)}
            />
          </>
        )}
        {maxL >= 3 && (
          <>
            <label style={labelStyle}>Initial L3</label>
            <AutocompleteInput
              value={initial3}
              onChange={setInitial3}
              options={employees.map((e) => ({ code: e.initial, label: e.name }))}
              displayName={nameFor(initial3)}
            />
          </>
        )}

        <label style={labelStyle}>หมายเหตุ</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />

        <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c5221f', margin: '12px 0', fontWeight: 600 }}>
          ⚠️ กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดยืนยัน
        </div>

        <button
          onClick={handleConfirm}
          disabled={submitting}
          style={{ ...buttonStyle, background: '#34a853', color: '#fff', width: '100%' }}
        >
          {submitting ? 'กำลังบันทึก...' : `เพิ่มข้อมูล ${SECTION_LABEL[serviceType] || serviceType}`}
        </button>
        {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000', textAlign: 'left' as const }
const inputStyle = {
  width: '100%',
  padding: 12,
  border: '1px solid #ccc',
  borderRadius: 8,
  fontSize: 16,
  boxSizing: 'border-box' as const,
  background: '#fff',
  color: '#000',
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
  maxWidth: 420,
  width: '100%',
  maxHeight: '85vh',
  overflowY: 'auto',
  position: 'relative',
}
const closeBtnStyle: CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 16,
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  color: '#666',
}

export default CheckinRecordPage