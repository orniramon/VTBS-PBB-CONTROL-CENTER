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

const SERVICE_TYPES = ['ARR', 'DEP', 'TOWING IN', 'TOWING OUT']
const PHOTO_REQUIRED_TYPES = ['ARR', 'TOWING IN'] // DEP/TOWING OUT ยังไม่บังคับแนบรูป

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

type Props = { myInitial: string; role: string; isActive: boolean }

const SEARCH_ALLOWED_ROLES = ['Supervisor', 'Apron', 'Sup. PBB Operator']

function PhotoPage({ myInitial, role, isActive }: Props) {
  const [rows, setRows] = useState<PhotoRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [allConcourses, setAllConcourses] = useState<string[]>([])

  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedConcourse, setSelectedConcourse] = useState<string | null>(null)

  const [modalTarget, setModalTarget] = useState<PhotoRow | null>(null)
  const [lightboxUrls, setLightboxUrls] = useState<string[] | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [showSearchModal, setShowSearchModal] = useState(false)

  const [cols, setCols] = useState<ColDef[]>(DEFAULT_COLS)
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 900 : false)

  useEffect(() => {
    function onResize() {
      setIsDesktop(window.innerWidth >= 900)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function load() {
    const params = new URLSearchParams({ hours: String(HOURS_WINDOW) })
    fetch(PHOTO_API_URL + '/photo-dashboard?' + params.toString())
      .then((res) => res.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : [])
        setInitialLoading(false)
      })
      .catch(() => {
        setError('โหลดข้อมูลไม่สำเร็จ')
        setInitialLoading(false)
      })
  }

  useEffect(() => {
    fetch(CHECKIN_API_URL + '/stands')
      .then((res) => res.json())
      .then((data: { stand: string; concourse: string }[]) => {
        setAllConcourses(Array.from(new Set((data || []).map((s) => s.concourse))).sort())
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isActive) return
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

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

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box', maxWidth: '100%' }}>
      <style>{`
        .photo-cell { font-size: clamp(9px, 1.4vw, 13px); padding: clamp(2px, 0.5vw, 6px) clamp(2px, 0.3vw, 4px); }
        .photo-header-cell { font-size: clamp(8.5px, 1.3vw, 12px); padding: clamp(2px, 0.5vw, 6px) clamp(2px, 0.3vw, 4px); }
        .concourse-grid { display: flex; flex-direction: column; gap: 8px; }
        @media (min-width: 900px) {
          .concourse-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        }
      `}</style>

      {SEARCH_ALLOWED_ROLES.includes(role) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => setShowSearchModal(true)}
            style={{ padding: '10px 20px', border: 'none', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: '#1a73e8', color: '#fff' }}
          >
            ค้นหา
          </button>
        </div>
      )}

      <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <label style={sectionLabelStyle}>Service Type</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {SERVICE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => {
              setSelectedType(t)
              setSelectedConcourse(null)
            }}
            style={{
              ...toggleStyle,
              background: selectedType === t ? '#1a73e8' : '#fff',
              color: selectedType === t ? '#fff' : '#000',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      </div>

      <div style={{ maxWidth: '100%', margin: '0 auto' }}>
      {selectedType && (
        <>
          <label style={sectionLabelStyle}>Concourse</label>
          <div className="concourse-grid" style={{ marginBottom: 16 }}>
            {allConcourses.map((c) => {
              const isOpen = isDesktop || selectedConcourse === c
              const concourseFilteredRows = rows.filter((r) => r.serviceType === selectedType && r.concourse === c)
              const concourseGroups: FlightGroup[] = []
              concourseFilteredRows.forEach((r) => {
                let g = concourseGroups.find((x) => x.checkinId === r.checkinId)
                if (!g) {
                  g = { checkinId: r.checkinId, positions: [] }
                  concourseGroups.push(g)
                }
                g.positions.push(r)
              })
              concourseGroups.forEach((g) => g.positions.sort((a, b) => a.position.localeCompare(b.position)))
              concourseGroups.sort((a, b) => (a.positions[0].createdAt < b.positions[0].createdAt ? 1 : -1))
              const concourseTotalRows = concourseGroups.reduce((s, g) => s + g.positions.length, 0)

              return (
                <div key={c}>
                  <button
                    onClick={() => setSelectedConcourse(selectedConcourse === c ? null : c)}
                    style={{
                      ...toggleStyle,
                      width: '100%',
                      fontWeight: 700,
                      borderRadius: isOpen ? '8px 8px 0 0' : 8,
                      border: !isDesktop && isOpen ? '2px solid #1a73e8' : 'none',
                      background: getConcourseColor(c),
                      color: '#33403a',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>Concourse {c}</span>
                    {!isDesktop && <span>{isOpen ? '▲' : '▼'}</span>}
                  </button>

                  {isOpen && !initialLoading && (
                    <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', border: '1px solid #eee', borderTop: 'none', overflow: 'hidden' }}>
                      <div style={{ maxHeight: 420, overflow: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gridAutoRows: 'min-content' }}>
                          {cols.map((col) => (
                            <div
                              key={col.key}
                              className="photo-header-cell"
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', col.key)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault()
                                onColDrop(e.dataTransfer.getData('text/plain') as ColKey, col.key)
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
                                overflow: 'hidden',
                                color: '#000',
                                textAlign: 'center',
                                zIndex: 1,
                              }}
                            >
                              {col.label.includes('\n') ? (
                                <div style={{ lineHeight: 1.25 }}>
                                  {col.label.split('\n').map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                </div>
                              ) : (
                                <FitText text={col.label} />
                              )}
                            </div>
                          ))}

                          {concourseTotalRows === 0 ? (
                            <div style={{ gridRow: 2, gridColumn: `1 / span ${cols.length}`, padding: 16, color: '#999', fontSize: 14, textAlign: 'center' }}>
                              ไม่มีข้อมูลไฟลท์ในช่วงเวลานี้
                            </div>
                          ) : (
                            (() => {
                              let cursor = 2
                              return concourseGroups.map((g, groupIdx) => {
                                const startRow = cursor
                                const span = g.positions.length
                                const first = g.positions[0]
                                cursor += span
                                const bg = groupIdx % 2 === 0 ? '#ffffff' : '#f0f3f8'

                                return (
                                  <FlightGroupCells
                                    key={g.checkinId}
                                    group={g}
                                    first={first}
                                    startRow={startRow}
                                    span={span}
                                    cols={cols}
                                    background={bg}
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {initialLoading && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}
      {error && <div style={{ textAlign: 'center', color: '#c5221f', padding: 12 }}>{error}</div>}
      </div>

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
    overflow: 'hidden' as const,
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
                {(first.serviceType === 'TOWING IN' || first.serviceType === 'TOWING OUT') && (
                  <div style={{ fontSize: '0.6em', color: '#666' }}>({first.serviceType})</div>
                )}
              </div>
            </div>
          )
        }
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
                  overflow: 'hidden',
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

        <label style={labelStyle}>Flight No.</label>
        <input type="text" value={flightNo} onChange={(e) => setFlightNo(e.target.value.toUpperCase())} style={inputStyle} />

        <label style={labelStyle}>หลุมจอด</label>
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
                            {(first.serviceType === 'TOWING IN' || first.serviceType === 'TOWING OUT') && <span style={{ fontSize: 12, color: '#666' }}> ({first.serviceType})</span>}
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
  const isL1 = row.position === 'L1'
  const isDockType = row.serviceType === 'ARR' || row.serviceType === 'TOWING IN'
  const showAvdgs = isL1 && row.serviceType === 'ARR'
  const photoRequired = PHOTO_REQUIRED_TYPES.includes(row.serviceType)
  const minPhotos = row.serviceType === 'ARR' ? 8 : row.serviceType === 'TOWING IN' ? 7 : 0

  const [bridgeStatus, setBridgeStatus] = useState('')
  const [bridgeReason, setBridgeReason] = useState('')
  const [avdgsStatus, setAvdgsStatus] = useState('')
  const [avdgsReason, setAvdgsReason] = useState('')
  const [aircraftReg, setAircraftReg] = useState('')
  const [eventTime, setEventTime] = useState('')
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

  function toBangkokIsoToday(timeStr: string) {
    const todayStr = new Date().toLocaleDateString('en-CA')
    return `${todayStr}T${timeStr}:00+07:00`
  }

  async function handleSubmit() {
    setError('')
    if (!bridgeStatus) return setError('กรุณาเลือกการทำงานของ PBB')
    if (showAvdgs && !avdgsStatus) return setError('กรุณาเลือกการทำงานของ A-VDGS')
    if (isL1 && !aircraftReg) return setError('กรุณากรอก A/C Reg.')
    if (!eventTime) return setError(isDockType ? 'กรุณากรอกเวลาเทียบ' : 'กรุณากรอกเวลาถอย')
    if (photoRequired && (!files || files.length < minPhotos)) {
      return setError(`กรุณาแนบรูปอย่างน้อย ${minPhotos} รูป`)
    }
    if (files && files.length > 10) return setError('แนบรูปได้สูงสุด 10 รูป')

    setSubmitting(true)
    try {
      const photos = files && files.length > 0 ? await Promise.all(Array.from(files).map((f) => compressImageFile(f, 800, 0.5))) : []
      const res = await fetch(PHOTO_API_URL + '/submit-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: row.checkinId,
          flightNo: row.flightNo,
          stand: row.stand,
          position: row.position,
          serviceType: row.serviceType,
          bridgeStatus: bridgeReason ? `${bridgeStatus} (${bridgeReason})` : bridgeStatus,
          avdgsStatus: showAvdgs ? (avdgsReason ? `${avdgsStatus} (${avdgsReason})` : avdgsStatus) : null,
          submittedByInitial: myInitial,
          photos,
          aircraftReg: isL1 ? aircraftReg : null,
          eventTime: eventTime ? toBangkokIsoToday(eventTime) : null,
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

        {isL1 && (
          <>
            <label style={labelStyle}>A/C Reg. *</label>
            <input
              type="text"
              value={aircraftReg}
              onChange={(e) => setAircraftReg(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="เช่น HSABC"
              style={inputStyle}
            />
          </>
        )}
        <label style={labelStyle}>{isDockType ? 'เวลาเทียบ *' : 'เวลาถอย *'}</label>
        <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} style={dateTimeInputStyle} />

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

        {photoRequired && (
          <div style={{ background: '#fff7e0', border: '1px solid #f2c94c', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#7a5c00', margin: '12px 0', textAlign: 'left' }}>
            <b>ควรถ่ายรูปครบตามนี้:</b>
            <ol style={{ margin: '4px 0 0', paddingLeft: 18, textAlign: 'left' }}>
              {checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ol>
          </div>
        )}

        <label style={labelStyle}>
          แนบภาพถ่าย {photoRequired ? `(อย่างน้อย ${minPhotos} รูป สูงสุด 10 รูป) *` : '(ยังไม่เปิดใช้งานสำหรับประเภทนี้)'}
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={!photoRequired}
          onChange={(e) => setFiles(e.target.files)}
          style={photoRequired ? inputStyle : { ...inputStyle, opacity: 0.4, pointerEvents: 'none', background: '#eee' }}
        />

        <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c5221f', margin: '12px 0', fontWeight: 600, textAlign: 'left' }}>
          ⚠️ กรุณาตรวจสอบข้อมูลให้ถูกต้อง กดส่งแล้วไม่สามารถแก้ไขข้อมูลได้
        </div>

        <button onClick={handleSubmit} disabled={submitting} style={{ ...buttonStyle, background: '#34a853', color: '#fff', width: '100%' }}>
          {submitting ? 'กำลังบันทึก...' : 'ยืนยันส่งข้อมูล'}
        </button>
        {error && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  )
}

const sectionLabelStyle = { display: 'block', fontWeight: 700, fontSize: 20, margin: '0 0 8px', color: '#000' }
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
const detailTh = { padding: '6px 4px', textAlign: 'center' as const, color: '#666', fontWeight: 600, fontSize: 11 }
const detailTd = { padding: '6px 4px', textAlign: 'center' as const, color: '#000' }

export default PhotoPage