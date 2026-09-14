import { useEffect, useState } from 'react'

const PHOTO_API_URL = 'https://photo-api.or-niramon.workers.dev'

type PhotoRow = {
  checkinId: string
  flightNo: string
  concourse: string
  stand: string
  serviceType: string
  createdAt: string
  position: string
  submitted: boolean
  bridgeStatus: string | null
  avdgsStatus: string | null
  photoUrls: string[]
}

const CONCOURSE_PAIRS = [
  ['A', 'B'],
  ['C', 'D'],
  ['E', 'F'],
  ['G', 'S'],
]
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

type Props = { role: string; myInitial: string }

function PhotoPage({ role, myInitial }: Props) {
  const [rows, setRows] = useState<PhotoRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalTarget, setModalTarget] = useState<PhotoRow | null>(null)
  const [lightbox, setLightbox] = useState<string[] | null>(null)

  const canSeePhotos = role === 'Apron' || role === 'Supervisor'

  function load() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
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
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // จัดกลุ่ม: Concourse -> checkinId (เที่ยวบิน) -> ตำแหน่ง (L1/L2/L3)
  const byConcourse: Record<string, Record<string, PhotoRow[]>> = {}
  rows.forEach((r) => {
    byConcourse[r.concourse] = byConcourse[r.concourse] || {}
    byConcourse[r.concourse][r.checkinId] = byConcourse[r.concourse][r.checkinId] || []
    byConcourse[r.concourse][r.checkinId].push(r)
  })

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box', maxWidth: 1300, margin: '0 auto' }}>
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

      {!initialLoading &&
        CONCOURSE_PAIRS.map((pair, idx) => (
          <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {pair.map((concourse) => {
              const flights = byConcourse[concourse] || {}
              const flightIds = Object.keys(flights)
              return (
                <div key={concourse} style={{ flex: 1, minWidth: 320, background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ background: CONCOURSE_COLORS[concourse], padding: '8px 14px', fontWeight: 700, color: '#33403a' }}>
                    Concourse {concourse}
                  </div>
                  <div style={{ maxHeight: 360, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f0f2f5' }}>
                          <th style={th}>เวลา</th>
                          <th style={th}>Flight No.</th>
                          <th style={th}>หลุมจอด</th>
                          <th style={th}>PBB</th>
                          <th style={th}>สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flightIds.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ ...td, textAlign: 'center', color: '#999' }}>
                              ไม่มีข้อมูลไฟลท์ในช่วงเวลานี้
                            </td>
                          </tr>
                        ) : (
                          flightIds.map((fid) =>
                            flights[fid].map((r, i) => (
                              <tr key={fid + r.position}>
                                {i === 0 && (
                                  <>
                                    <td style={td} rowSpan={flights[fid].length}>
                                      {new Date(r.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </td>
                                    <td style={td} rowSpan={flights[fid].length}>
                                      {r.flightNo}
                                    </td>
                                    <td style={td} rowSpan={flights[fid].length}>
                                      {r.stand}
                                    </td>
                                  </>
                                )}
                                <td style={td}>{r.position}</td>
                                <td style={td}>
                                  {r.submitted ? (
                                    <button
                                      onClick={() => canSeePhotos && r.photoUrls.length > 0 && setLightbox(r.photoUrls)}
                                      style={{ ...pillStyle, background: '#e6f4ea', color: '#137333', cursor: canSeePhotos ? 'pointer' : 'default' }}
                                    >
                                      ส่งแล้ว
                                    </button>
                                  ) : (
                                    <button onClick={() => setModalTarget(r)} style={{ ...pillStyle, background: '#fce8e6', color: '#c5221f' }}>
                                      ยังไม่ส่ง
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

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

      {lightbox && (
        <div style={overlayStyle} onClick={() => setLightbox(null)}>
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {lightbox.map((url) => (
                <img key={url} src={url} alt="" style={{ maxWidth: 280, borderRadius: 8 }} />
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
      const photos = await Promise.all(Array.from(files).map((f) => compressImageFile(f, 900, 0.55)))
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
        <h3 style={{ marginTop: 0, color: '#000' }}>
          ส่งรูป {row.flightNo} {row.stand} {row.position}
        </h3>

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

const th = { padding: '6px 8px', textAlign: 'left' as const, color: '#000', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' as const }
const td = { padding: '6px 8px', color: '#000', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' as const }
const pillStyle = { border: 'none', borderRadius: 14, padding: '3px 10px', fontSize: 11, fontWeight: 600 }
const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000' }
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