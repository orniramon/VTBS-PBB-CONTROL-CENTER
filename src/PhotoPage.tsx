import { useEffect, useState } from 'react'
import FitText from './FitText'
import { getServiceTypeColor } from './serviceTypeColors'

const PHOTO_API_URL = 'https://photo-api.or-niramon.workers.dev'
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'
const HOURS_WINDOW = 10

type PhotoRow = {
  checkinId: string
  flightNo: string
  concourse: string
  stand: string
  serviceType: string
  createdAt: string
  aircraftType: string
  eibt: string | null
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
  S: '#fff4d6',
}
function getConcourseColor(concourse: string) {
  if (CONCOURSE_COLORS[concourse]) return CONCOURSE_COLORS[concourse]
  const letter = concourse.replace(/[0-9]+$/, '')
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

type FlightGroup = { checkinId: string; positions: PhotoRow[] }

type Props = { myInitial: string; role: string }

const SEARCH_ALLOWED_ROLES = ['Supervisor', 'Apron', 'Sup. PBB Operator']

function PhotoPage({ myInitial, role }: Props) {
  const [rows, setRows] = useState<PhotoRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalTarget, setModalTarget] = useState<PhotoRow | null>(null)
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [showSearchModal, setShowSearchModal] = useState(false)

  const [concourseOrder, setConcourseOrder] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [cols, setCols] = useState<ColDef[]>(DEFAULT_COLS)

  function load() {
    const params = new URLSearchParams({ hours: String(HOURS_WINDOW) })
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
    // ดึงรายชื่อ Concourse ทั้งหมดที่มีจริงในระบบ (ไม่ใช่แค่ที่มีข้อมูลตอนนี้)
    // เพื่อให้กล่อง Concourse ขึ้นครบเสมอ แม้ตอนนั้นจะยังไม่มีไฟลท์เลยก็ตาม
    fetch(CHECKIN_API_URL + '/stands')
      .then((res) => res.json())
      .then((data: { stand: string; concourse: string }[]) => {
        const allConcourses = Array.from(new Set((data || []).map((s) => s.concourse))).sort()
        setConcourseOrder((prev) => {
          const merged = [...prev]
          allConcourses.forEach((c) => {
            if (!merged.includes(c)) merged.push(c)
          })
          return merged
        })
      })
      .catch(() => {})
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // จัดกลุ่ม: concourse -> เที่ยวบิน (checkinId) -> ตำแหน่ง (เรียง L1,L2,L3)
  const byConcourse: Record<string, FlightGroup[]> = {}
  rows.forEach((r) => {
    byConcourse[r.concourse] = byConcourse[r.concourse] || []
    let grp = byConcourse[r.concourse].find((g) => g.checkinId === r.checkinId)
    if (!grp) {
      grp = { checkinId: r.checkinId, positions: [] }
      byConcourse[r.concourse].push(grp)
    }
    grp.positions.push(r)
  })
  Object.values(byConcourse).forEach((groups) => {
    groups.forEach((g) => g.positions.sort((a, b) => a.position.localeCompare(b.position)))
    groups.sort((a, b) => (a.positions[0].createdAt < b.positions[0].createdAt ? 1 : -1))
  })

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
        {SEARCH_ALLOWED_ROLES.includes(role) && (
          <button
            onClick={() => setShowSearchModal(true)}
            style={{ padding: '10px 20px', border: 'none', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: '#1a73e8', color: '#fff' }}
          >
            ค้นหา
          </button>
        )}
      </div>

      {initialLoading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}

      {!initialLoading && (
        <div className="photo-grid">
          {concourseOrder.map((concourse) => {
            const groups = byConcourse[concourse] || []
            const isCollapsed = collapsed[concourse]
            const totalPositionRows = groups.reduce((s, g) => s + g.positions.length, 0)

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
                </div>

                {!isCollapsed && (
                  <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', maxHeight: 380, overflow: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridAutoRows: 'min-content' }}>
                      {/* ---------- หัวตาราง ---------- */}
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
                          style={{
                            gridRow: 1,
                            background: '#d8dde3',
                            position: 'sticky',
                            top: 0,
                            fontWeight: 700,
                            borderRight: '1px solid #c3c9d1',
                            cursor: 'grab',
                            userSelect: 'none',
                            minWidth: 0,
                            color: '#000',
                            textAlign: 'center',
                            zIndex: 1,
                          }}
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

                      {/* ---------- แถวข้อมูล ---------- */}
                      {totalPositionRows === 0 ? (
                        <div style={{ gridRow: 2, gridColumn: `1 / span ${cols.length}`, padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>
                          ไม่มีข้อมูลไฟลท์ในช่วงเวลานี้
                        </div>
                      ) : (
                        (() => {
                          let cursor = 2 // แถวที่ 1 คือหัวตาราง
                          const bg = (groupIdx: number) => (groupIdx % 2 === 0 ? '#ffffff' : '#f0f3f8')
                          return groups.map((g, groupIdx) => {
                            const startRow = cursor
                            const span = g.positions.length
                            const first = g.positions[0]
                            cursor += span

                            return (
                              <FlightGroupCells
                                key={g.checkinId}
                                group={g}
                                first={first}
                                startRow={startRow}
                                span={span}
                                cols={cols}
                                background={bg(groupIdx)}
                                fmtDate={fmtDate}
                                fmtTime={fmtTime}
                                onOpenSubmit={setModalTarget}
                                onOpenLightbox={(urls) => {
                                  setLightboxUrls(urls)
                                  setLightboxIdx(0)
                                }}
                              />
                            )
                          })
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showSearchModal && (
        <SearchModal
          onClose={() => setShowSearchModal(false)}
          onOpenSubmit={setModalTarget}
          onOpenLightbox={(urls) => {
            setLightboxUrls(urls)
            setLightboxIdx(0)
          }}
        />
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
// เซลล์ของ 1 กลุ่มไฟลท์ (อาจมีหลายตำแหน่ง L1/L2/L3) — คอลัมน์ที่ใช้ร่วมกัน
// (วันที่-เวลา/หลุมจอด/Flight No.) จะ span ข้ามหลายแถวเป็นเซลล์เดียว
// =====================================================================
function FlightGroupCells({
  group,
  first,
  startRow,
  span,
  cols,
  background,
  fmtDate,
  fmtTime,
  onOpenSubmit,
  onOpenLightbox,
}: {
  group: FlightGroup
  first: PhotoRow
  startRow: number
  span: number
  cols: ColDef[]
  background: string
  fmtDate: (iso: string) => string
  fmtTime: (iso: string) => string
  onOpenSubmit: (row: PhotoRow) => void
  onOpenLightbox: (urls: string[]) => void
}) {
  const sharedCellStyle = {
    gridRow: `${startRow} / span ${span}`,
    background,
    color: '#000',
    borderRight: '1px solid #eee',
    borderBottom: '1px solid #ddd',
    minWidth: 0,
  }

  return (
    <>
      {cols.map((c) => {
        if (c.key === 'datetime') {
          return (
            <div key={c.key} className="photo-cell" style={sharedCellStyle}>
              <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                <div>{fmtDate(first.createdAt)}</div>
                <div>{fmtTime(first.createdAt)}</div>
              </div>
            </div>
          )
        }
        if (c.key === 'stand') {
          return (
            <div key={c.key} className="photo-cell" style={sharedCellStyle}>
              <FitText text={first.stand} />
            </div>
          )
        }
        if (c.key === 'flightNo') {
          return (
            <div key={c.key} className="photo-cell" style={sharedCellStyle}>
              <div style={{ textAlign: 'center' }}>
                <FitText text={first.flightNo} />
                {first.serviceType !== 'ARR' && (
                  <div style={{ fontSize: '0.6em', color: '#666' }}>({first.serviceType})</div>
                )}
              </div>
            </div>
          )
        }
        // คอลัมน์ที่เหลือ (pbb/bridge/avdgs/status) แยกเป็นแถวย่อยตามตำแหน่ง
        return (
          <div key={c.key} style={{ display: 'contents' }}>
            {group.positions.map((r, i) => (
              <div
                key={r.position}
                className="photo-cell"
                style={{
                  gridRow: startRow + i,
                  background,
                  color: '#000',
                  borderRight: '1px solid #eee',
                  borderBottom: '1px solid #eee',
                  minWidth: 0,
                }}
              >
                {c.key === 'pbb' ? (
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
                      onClick={() => (r.submitted ? onOpenLightbox(r.photoUrls) : onOpenSubmit(r))}
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
        )
      })}
    </>
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

// =====================================================================
// ป๊อบอัพค้นหาข้อมูลย้อนหลัง — ต้องระบุช่วงวันที่+เวลาเสมอ (Flight No./
// หลุมจอด เป็นตัวกรองเสริม ไม่บังคับ)
// =====================================================================
function SearchModal({
  onClose,
  onOpenSubmit,
  onOpenLightbox,
}: {
  onClose: () => void
  onOpenSubmit: (row: PhotoRow) => void
  onOpenLightbox: (urls: string[]) => void
}) {
  const [fromDate, setFromDate] = useState('')
  const [fromTime, setFromTime] = useState('00:00')
  const [toDate, setToDate] = useState('')
  const [toTime, setToTime] = useState('23:59')
  const [flightNo, setFlightNo] = useState('')
  const [stand, setStand] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<PhotoRow[] | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toBangkokIso(dateStr: string, timeStr: string) {
    return `${dateStr}T${timeStr}:00+07:00`
  }

  async function handleSearch() {
    setError('')
    setResults(null)
    setExpandedId(null)
    if (!fromDate || !toDate) return setError('กรุณาระบุวันที่ให้ครบทั้งสองช่อง')

    setSearching(true)
    try {
      const params = new URLSearchParams({
        from: toBangkokIso(fromDate, fromTime),
        to: toBangkokIso(toDate, toTime),
      })
      if (flightNo) params.set('search', flightNo)
      const res = await fetch(PHOTO_API_URL + '/photo-dashboard?' + params.toString())
      const data = await res.json()
      let list: PhotoRow[] = Array.isArray(data) ? data : []
      if (stand) list = list.filter((r) => r.stand.toUpperCase().includes(stand.toUpperCase()))
      setResults(list)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSearching(false)
    }
  }

  function fmtDateTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  function fmtTimeOnly(iso: string | null) {
    if (!iso) return '-'
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const groups: FlightGroup[] = []
  ;(results || []).forEach((r) => {
    let g = groups.find((x) => x.checkinId === r.checkinId)
    if (!g) {
      g = { checkinId: r.checkinId, positions: [] }
      groups.push(g)
    }
    g.positions.push(r)
  })
  groups.forEach((g) => g.positions.sort((a, b) => a.position.localeCompare(b.position)))
  groups.sort((a, b) => (a.positions[0].createdAt < b.positions[0].createdAt ? 1 : -1))

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalBoxStyle, maxWidth: 560 }}>
        <button onClick={onClose} style={closeBtnStyle}>
          ✕
        </button>
        <h3 style={{ marginTop: 0, color: '#000', textAlign: 'left' }}>ค้นหา</h3>

        <label style={labelStyle}>จากวันที่ *</label>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={dateTimeInputStyle} />
        <label style={labelStyle}>เวลา *</label>
        <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} style={dateTimeInputStyle} />

        <label style={labelStyle}>ถึงวันที่ *</label>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={dateTimeInputStyle} />
        <label style={labelStyle}>เวลา *</label>
        <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} style={dateTimeInputStyle} />

        <label style={labelStyle}>Flight No. (ถ้ามี)</label>
        <input type="text" value={flightNo} onChange={(e) => setFlightNo(e.target.value.toUpperCase())} style={inputStyle} />

        <label style={labelStyle}>หลุมจอด (ถ้ามี)</label>
        <input type="text" value={stand} onChange={(e) => setStand(e.target.value.toUpperCase())} style={inputStyle} />

        <button onClick={handleSearch} disabled={searching} style={{ ...buttonStyle, background: '#1a73e8', color: '#fff', width: '100%', marginTop: 14 }}>
          {searching ? 'กำลังค้นหา...' : 'ค้นหา'}
        </button>
        {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}

        {results && (
          <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
            {groups.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>ไม่พบข้อมูล</div>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {groups.map((g) => {
                  const first = g.positions[0]
                  const isOpen = expandedId === g.checkinId
                  return (
                    <div key={g.checkinId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div
                        onClick={() => setExpandedId(isOpen ? null : g.checkinId)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 8px',
                          cursor: 'pointer',
                          background: isOpen ? '#fff3cd' : 'transparent',
                        }}
                      >
                        <div style={{ fontSize: 13, color: '#000', textAlign: 'left' }}>
                          <div style={{ color: '#666', fontSize: 12, textAlign: 'left' }}>{fmtDateTime(first.createdAt)}</div>
                          <div style={{ textAlign: 'left' }}>
                            <b>{first.stand}</b> — <b>{first.flightNo}</b>
                            {first.serviceType !== 'ARR' && <span style={{ fontSize: 12, color: '#666' }}> ({first.serviceType})</span>}
                          </div>
                        </div>
                        <span style={{ color: '#666', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>

                      {isOpen && (
                        <div style={{ padding: '0 8px 12px' }}>
                          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={{ ...detailTh, width: '13%' }}>A/C Type</th>
                                <th style={{ ...detailTh, width: '11%' }}>EIBT</th>
                                <th style={{ ...detailTh, width: '9%' }}>PBB</th>
                                <th style={{ ...detailTh, width: '24%' }}>
                                  การทำงาน
                                  <br />
                                  PBB
                                </th>
                                <th style={{ ...detailTh, width: '24%' }}>
                                  การทำงาน
                                  <br />
                                  A-VDGS
                                </th>
                                <th style={{ ...detailTh, width: '19%' }}>สถานะการส่งรูป</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.positions.map((r) => (
                                <tr key={r.position}>
                                  <td style={detailTd}>
                                    <FitText text={r.aircraftType} />
                                  </td>
                                  <td style={detailTd}>{r.serviceType === 'ARR' ? fmtTimeOnly(r.eibt) : '-'}</td>
                                  <td style={detailTd}>{r.position}</td>
                                  <td style={detailTd}>{r.submitted ? <FitText text={r.bridgeStatus || ''} minScale={0.7} /> : ''}</td>
                                  <td style={detailTd}>
                                    {!r.submitted ? '' : r.position !== 'L1' || r.serviceType !== 'ARR' ? '-' : <FitText text={r.avdgsStatus || ''} minScale={0.7} />}
                                  </td>
                                  <td style={detailTd}>
                                    <button
                                      onClick={() => (r.submitted ? onOpenLightbox(r.photoUrls) : onOpenSubmit(r))}
                                      style={{
                                        border: 'none',
                                        borderRadius: 14,
                                        padding: '3px 10px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: r.submitted ? '#e6f4ea' : '#fce8e6',
                                        color: r.submitted ? '#137333' : '#c5221f',
                                      }}
                                    >
                                      {r.personInitial} {r.submitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const detailTh = { padding: '6px 4px', textAlign: 'center' as const, color: '#666', fontWeight: 600, fontSize: 11 }
const detailTd = { padding: '6px 4px', textAlign: 'center' as const, color: '#000' }

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

  const color = getServiceTypeColor(row.serviceType)

  async function handleSubmit() {
    setError('')
    if (!bridgeStatus) return setError('กรุณาเลือกการทำงานของ PBB')
    if (showAvdgs && !avdgsStatus) return setError('กรุณาเลือกการทำงานของ A-VDGS')
    if (!files || files.length === 0) return setError('กรุณาแนบรูปอย่างน้อย 1 รูป')
    if (files.length > 10) return setError('แนบรูปได้สูงสุด 10 รูป')

    setSubmitting(true)
    try {
      const photos = await Promise.all(Array.from(files).map((f) => compressImageFile(f, 800, 0.5)))
      const res = await fetch(PHOTO_API_URL + '/submit-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: row.checkinId,
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
        <h3 style={{ marginTop: 0, marginBottom: 10, color: '#000', textAlign: 'center' }}>แนบรูป</h3>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ background: color.bg, color: color.text, padding: '4px 12px', borderRadius: 16, fontWeight: 700, fontSize: 13 }}>
            {row.serviceType}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#000' }}>{row.flightNo}</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#333', marginBottom: 4 }}>หลุมจอด {row.stand}</div>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#333', marginBottom: 16 }}>{row.position}</div>

        <label style={labelStyle}>การทำงานของ PBB *</label>
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
            <label style={labelStyle}>การทำงานของ A-VDGS *</label>
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

        <div style={{ background: '#fff7e0', border: '1px solid #f2c94c', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#7a5c00', margin: '12px 0', textAlign: 'left' }}>
          <b>ควรถ่ายรูปครบตามนี้:</b>
          <ol style={{ margin: '4px 0 0', paddingLeft: 18, textAlign: 'left' }}>
            {checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </div>

        <label style={labelStyle}>แนบภาพถ่าย (สูงสุด 10 รูป) *</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} style={inputStyle} />

        <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c5221f', margin: '12px 0', fontWeight: 600, textAlign: 'left' }}>
          ⚠️ กรุณาตรวจสอบข้อมูลให้ถูกต้อง กดส่งแล้วไม่สามารถแก้ไขข้อมูลได้
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
const dateTimeInputStyle = { ...inputStyle, width: 'auto', maxWidth: '100%', display: 'block' as const }
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