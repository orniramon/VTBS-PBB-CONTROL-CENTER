import { useEffect, useState } from 'react'
import FitText from './FitText'

const PHOTO_API_URL = 'https://photo-api.or-niramon.workers.dev'
const HOURS_WINDOW = 10
const MAX_ROWS_PER_CONCOURSE = 5

type PhotoRow = {
  checkinId: string
  flightNo: string
  concourse: string
  stand: string
  serviceType: string
  createdAt: string
  position: string
  personInitial: string
  submitted: boolean
  bridgeStatus: string | null
  avdgsStatus: string | null
  photoUrls: string[]
}

const CONCOURSE_COLORS: Record<string, string> = {
  A: '#e6f5ec',
  B: '#fcedd9',
  C: '#e6eff9',
  D: '#f8e9e9',
  E: '#eff5e2',
  F: '#f1ecf8',
  G: '#e2f5f4',
  S: '#f9ecda',
}
function getConcourseColor(concourse: string) {
  if (CONCOURSE_COLORS[concourse]) return CONCOURSE_COLORS[concourse]
  const letter = concourse.replace(/[0-9]+$/, '') // 'S1' -> 'S'
  return CONCOURSE_COLORS[letter] || '#e0e0e0'
}

type ColKey = 'datetime' | 'stand' | 'flightNo' | 'pbb' | 'bridge' | 'avdgs' | 'status'
type ColDef = { key: ColKey; label: string; width: number }

const DEFAULT_COLS: ColDef[] = [
  { key: 'datetime', label: 'วันที่\nเวลา', width: 10 },
  { key: 'stand', label: 'หลุมจอด', width: 8 },
  { key: 'flightNo', label: 'Flight No.', width: 10 },
  { key: 'pbb', label: 'PBB', width: 6 },
  { key: 'bridge', label: 'การทำงาน\nPBB', width: 16 },
  { key: 'avdgs', label: 'การทำงาน\nA-VDGS', width: 16 },
  { key: 'status', label: 'สถานะ\nการส่งรูป', width: 14 },
]

type Props = { role: string; myInitial: string }

function PhotoPage({ myInitial }: Props) {
  const [rows, setRows] = useState<PhotoRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalTarget, setModalTarget] = useState<PhotoRow | null>(null)
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)

  const [concourseOrder, setConcourseOrder] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [cols, setCols] = useState<ColDef[]>(DEFAULT_COLS)

  function load() {
    const params = new URLSearchParams({ hours: String(HOURS_WINDOW) })
    if (search) params.set('search', search)
    fetch(PHOTO_API_URL + '/photo-dashboard?' + params.toString())
      .then((res) => res.json())
      .then((data) => {
        const list: PhotoRow[] = Array.isArray(data) ? data : []
        setRows(list)
        setConcourseOrder((prev) => {
          const seen = [...new Set(list.map((r) => r.concourse))].sort()
          const merged = [...prev]
          seen.forEach((c) => {
            if (!merged.includes(c)) merged.push(c)
          })
          return merged
        })
        setInitialLoading(false)
      })
      .catch(() => {
        setError('โหลดข้อมูลไม่สำเร็จ')
        setInitialLoading(false)
      })
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function onConcourseDrop(from: string, to: string) {
    const arr = [...concourseOrder]
    arr.splice(arr.indexOf(from), 1)
    arr.splice(arr.indexOf(to), 0, from)
    setConcourseOrder(arr)
  }
  function onColDrop(from: ColKey, to: ColKey) {
    const arr = [...cols]
    const fromIdx = arr.findIndex((c) => c.key === from)
    const toIdx = arr.findIndex((c) => c.key === to)
    const moved = arr.splice(fromIdx, 1)[0]
    arr.splice(toIdx, 0, moved)
    setCols(arr)
  }

  function fmtDate(iso: string) {
    const d = new Date(iso)
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    return `${d.getDate()} ${months[d.getMonth()]}`
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const gridTemplate = cols.map((c) => `minmax(0, ${c.width}fr)`).join(' ')

  const byConcourse: Record<string, PhotoRow[]> = {}
  rows.forEach((r) => {
    byConcourse[r.concourse] = byConcourse[r.concourse] || []
    byConcourse[r.concourse].push(r)
  })
  Object.values(byConcourse).forEach((arr) => arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .photo-cell { font-size: 12px; padding: 6px 4px; }
        .photo-header-cell { font-size: 11px; padding: 6px 4px; }
        @media (max-width: 480px) {
          .photo-cell { font-size: 10px; padding: 4px 2px; }
          .photo-header-cell { font-size: 9.5px; padding: 4px 2px; }
        }
        .photo-grid { display: flex; flex-direction: column; gap: 16px; }
        @media (min-width: 900px) {
          .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="กรอก Flight No. หรือ หลุมจอด"
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 20, fontSize: 14, minWidth: 220, background: '#fff', color: '#000' }}
        />
      </div>

      {initialLoading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}

      {!initialLoading && (
        <div className="photo-grid">
          {concourseOrder.map((concourse) => {
            const flights = byConcourse[concourse] || []
            const visibleFlights = flights.slice(0, MAX_ROWS_PER_CONCOURSE)
            const isCollapsed = collapsed[concourse]

            return (
              <div key={concourse} style={{ minWidth: 0 }}>
                <div
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', concourse)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onConcourseDrop(e.dataTransfer.getData('text/plain'), concourse)
                  }}
                  onClick={() => setCollapsed((prev) => ({ ...prev, [concourse]: !prev[concourse] }))}
                  style={{
                    background: getConcourseColor(concourse),
                    padding: '8px 14px',
                    fontWeight: 700,
                    color: '#33403a',
                    borderRadius: '10px 10px 0 0',
                    cursor: 'grab',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                    <path d="M6 9l6 6 6-6" stroke="#33403a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Concourse {concourse}
                  {flights.length > 0 && <span style={{ fontSize: 12, fontWeight: 400 }}>({flights.length})</span>}
                </div>

                {!isCollapsed && (
                  <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', maxHeight: 5 * 46 + 34, overflow: 'auto' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: gridTemplate,
                        background: '#d8dde3',
                        position: 'sticky',
                        top: 0,
                        fontWeight: 700,
                        color: '#000',
                      }}
                    >
                      {cols.map((c) => (
                        <div
                          key={c.key}
                          className="photo-header-cell"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', c.key)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            onColDrop(e.dataTransfer.getData('text/plain') as ColKey, c.key)
                          }}
                          style={{ borderRight: '1px solid #c3c9d1', cursor: 'grab', userSelect: 'none', minWidth: 0, color: '#000', textAlign: 'center' }}
                        >
                          {c.label.includes('\n') ? (
                            <div style={{ lineHeight: 1.25 }}>
                              {c.label.split('\n').map((line) => (
                                <div key={line}>{line}</div>
                              ))}
                            </div>
                          ) : (
                            <FitText text={c.label} />
                          )}
                        </div>
                      ))}
                    </div>

                    {visibleFlights.length === 0 ? (
                      <div style={{ padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>ไม่มีข้อมูลไฟลท์ในช่วงเวลานี้</div>
                    ) : (
                      visibleFlights.map((r, idx) => (
                        <div
                          key={r.checkinId + r.position}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: gridTemplate,
                            borderBottom: '1px solid #eee',
                            background: idx % 2 === 0 ? '#ffffff' : '#f0f3f8',
                            color: '#000',
                          }}
                        >
                          {cols.map((c) => (
                            <div key={c.key} className="photo-cell" style={{ borderRight: '1px solid #eee', minWidth: 0, color: '#000' }}>
                              {c.key === 'datetime' ? (
                                <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                  <div>{fmtDate(r.createdAt)}</div>
                                  <div>{fmtTime(r.createdAt)}</div>
                                </div>
                              ) : c.key === 'stand' ? (
                                <FitText text={r.stand} />
                              ) : c.key === 'flightNo' ? (
                                <FitText text={r.flightNo} />
                              ) : c.key === 'pbb' ? (
                                <FitText text={r.position} />
                              ) : c.key === 'bridge' ? (
                                r.submitted ? <FitText text={r.bridgeStatus || ''} minScale={0.7} /> : ''
                              ) : c.key === 'avdgs' ? (
                                !r.submitted ? (
                                  ''
                                ) : r.position !== 'L1' || r.serviceType !== 'ARR' ? (
                                  <div style={{ textAlign: 'center' }}>-</div>
                                ) : (
                                  <FitText text={r.avdgsStatus || ''} minScale={0.7} />
                                )
                              ) : c.key === 'status' ? (
                                <div style={{ textAlign: 'center' }}>
                                  <button
                                    onClick={() => {
                                      if (r.submitted) {
                                        setLightboxUrls(r.photoUrls)
                                        setLightboxIdx(0)
                                      } else {
                                        setModalTarget(r)
                                      }
                                    }}
                                    style={{
                                      border: 'none',
                                      borderRadius: 14,
                                      padding: '3px 10px',
                                      fontSize: '0.95em',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      background: r.submitted ? '#e6f4ea' : '#fce8e6',
                                      color: r.submitted ? '#137333' : '#c5221f',
                                    }}
                                  >
                                    {r.personInitial} {r.submitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalTarget && (
        <SubmitPhotoModal
          row={modalTarget}
          myInitial={myInitial}
          onClose={() => setModalTarget(null)}
          onDone={() => {
            setModalTarget(null)
            load()
          }}
        />
      )}

      {lightboxUrls && (
        <div style={overlayStyle}>
          <div style={{ ...modalBoxStyle, maxWidth: 480, textAlign: 'center' }}>
            <button onClick={() => setLightboxUrls(null)} style={closeBtnStyle}>
              ✕
            </button>
            <h3 style={{ margin: '0 0 12px', color: '#000', textAlign: 'left' }}>รูปภาพที่ส่ง</h3>
            <img src={lightboxUrls[lightboxIdx]} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', justifyContent: 'center' }}>
              {lightboxUrls.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  onClick={() => setLightboxIdx(i)}
                  style={{
                    width: 50,
                    height: 50,
                    objectFit: 'cover',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: i === lightboxIdx ? '2px solid #1a73e8' : '2px solid transparent',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// ป๊อบอัพส่งรูป
// =====================================================================
function compressImageFile(file: File, maxDim: number, quality: number): Promise<{ base64: string; mimeType: string; fileName: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width
        let h = img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          } else {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg' })
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

function SubmitPhotoModal({
  row,
  myInitial,
  onClose,
  onDone,
}: {
  row: PhotoRow
  myInitial: string
  onClose: () => void
  onDone: () => void
}) {
  const showAvdgs = row.position === 'L1' && row.serviceType === 'ARR'
  const [bridgeStatus, setBridgeStatus] = useState('')
  const [bridgeReason, setBridgeReason] = useState('')
  const [avdgsStatus, setAvdgsStatus] = useState('')
  const [avdgsReason, setAvdgsReason] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const checklist = [
    'บริเวณหน้า CABIN / มุมซอกข้างตู้ CONTROL PANEL',
    'ทางเดิน (TUNNEL)',
    ...(showAvdgs ? ['ระบบ A-VDGS กำลังทำงาน'] : []),
    'เครื่องบินบน T-MARK',
    'หน้าจอแผง CONTROL PANEL',
    'ประตูเครื่องบินหลังเทียบฯ (เห็นตำแหน่ง MARK)',
    'ตำแหน่ง SAFETY SHOE SWITCH ใต้ประตูเครื่องบิน',
    'ล้อสะพานเทียบฯ หลังเทียบเสร็จ',
  ]

  async function handleSubmit() {
    setError('')
    if (!bridgeStatus) return setError('กรุณาเลือกสถานะสะพานเทียบฯ')
    if (showAvdgs && !avdgsStatus) return setError('กรุณาเลือกสถานะ A-VDGS')
    if (!files || files.length === 0) return setError('กรุณาแนบรูปอย่างน้อย 1 รูป')
    if (files.length > 10) return setError('แนบรูปได้สูงสุด 10 รูป')

    setSubmitting(true)
    try {
      const photos = await Promise.all(Array.from(files).map((f) => compressImageFile(f, 800, 0.5)))
      const res = await fetch(PHOTO_API_URL + '/submit-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightNo: row.flightNo,
          stand: row.stand,
          position: row.position,
          bridgeStatus: bridgeReason ? `${bridgeStatus} (${bridgeReason})` : bridgeStatus,
          avdgsStatus: showAvdgs ? (avdgsReason ? `${avdgsStatus} (${avdgsReason})` : avdgsStatus) : null,
          submittedByInitial: myInitial,
          photos,
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
        <h3 style={{ marginTop: 0, marginBottom: 4, color: '#000', textAlign: 'center' }}>แนบรูป</h3>
        <div style={{ textAlign: 'center', fontWeight: 700, color: '#000', marginBottom: 16, fontSize: 15 }}>
          ({row.serviceType}) {row.flightNo} หลุมจอด {row.stand} PBB {row.position}
        </div>

        <label style={labelStyle}>สถานะสะพานเทียบฯ *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ปกติ', 'ไม่ปกติ'].map((v) => (
            <button
              key={v}
              onClick={() => setBridgeStatus(v)}
              style={{ ...toggleStyle, background: bridgeStatus === v ? '#1a73e8' : '#fff', color: bridgeStatus === v ? '#fff' : '#000' }}
            >
              {v}
            </button>
          ))}
        </div>
        <input type="text" placeholder="เหตุผล (ถ้ามี)" value={bridgeReason} onChange={(e) => setBridgeReason(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />

        {showAvdgs && (
          <>
            <label style={labelStyle}>สถานะ A-VDGS *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['ปกติ', 'ไม่ปกติ'].map((v) => (
                <button
                  key={v}
                  onClick={() => setAvdgsStatus(v)}
                  style={{ ...toggleStyle, background: avdgsStatus === v ? '#1a73e8' : '#fff', color: avdgsStatus === v ? '#fff' : '#000' }}
                >
                  {v}
                </button>
              ))}
            </div>
            <input type="text" placeholder="เหตุผล (ถ้ามี)" value={avdgsReason} onChange={(e) => setAvdgsReason(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
          </>
        )}

        <div style={{ background: '#fff7e0', border: '1px solid #f2c94c', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#7a5c00', margin: '12px 0' }}>
          <b>ควรถ่ายรูปครบตามนี้:</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </div>

        <label style={labelStyle}>แนบภาพถ่าย (สูงสุด 10 รูป) *</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} style={inputStyle} />

        <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c5221f', margin: '12px 0', fontWeight: 600 }}>
          ⚠️ กดส่งแล้วไม่สามารถแก้ไขข้อมูลได้ กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดส่ง
        </div>

        <button onClick={handleSubmit} disabled={submitting} style={{ ...buttonStyle, background: '#34a853', color: '#fff', width: '100%' }}>
          {submitting ? 'กำลังอัปโหลด...' : 'ยืนยันส่งรูป'}
        </button>
        {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000', textAlign: 'left' as const }
const inputStyle = { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: '#fff', color: '#000' }
const toggleStyle = { flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const buttonStyle = { padding: 12, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
}
const modalBoxStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  maxWidth: 420,
  width: '100%',
  maxHeight: '85vh',
  overflowY: 'auto' as const,
  position: 'relative' as const,
}
const closeBtnStyle = { position: 'absolute' as const, top: 14, right: 16, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }

export default PhotoPage