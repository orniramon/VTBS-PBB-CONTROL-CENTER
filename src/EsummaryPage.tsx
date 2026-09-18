import { useEffect, useState } from 'react'

const ESUMMARY_API_URL = 'https://esummary-api.or-niramon.workers.dev'
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

type PendingRow = {
  checkinId: string
  flightNo: string
  stand: string
  serviceType: string
  createdAt: string
  eibt: string | null
  eobt: string | null
  aircraftType: string
  aircraftReg: string | null
  initialL1: string
  initialL2: string | null
  initialL3: string | null
  l1EventTime: string | null
  l2EventTime: string | null
  l3EventTime: string | null
  ack: boolean
  ackAt: string | null
  ackByInitial: string | null
}

const TIME_RANGES = ['08:00-17:00', '17:00-08:00']
const SHIFT_NUMBERS = [1, 2, 3, 4]

function EsummaryPage({ isActive }: { isActive: boolean }) {
  const [allConcourses, setAllConcourses] = useState<string[]>([])
  const [concourse, setConcourse] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [dateLabel, setDateLabel] = useState('')
  const [timeRange, setTimeRange] = useState('')
  const [shiftNumber, setShiftNumber] = useState<number | null>(null)
  const [supervisorInitial, setSupervisorInitial] = useState('')
  const [supervisorName, setSupervisorName] = useState('')
  const [supervisorError, setSupervisorError] = useState('')

  const [reportReady, setReportReady] = useState(false)
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(false)

  const [cutoffId, setCutoffId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    fetch(CHECKIN_API_URL + '/stands')
      .then((res) => res.json())
      .then((data: { stand: string; concourse: string }[]) => {
        setAllConcourses(Array.from(new Set((data || []).map((s) => s.concourse))).sort())
      })
      .catch(() => {})
  }, [])

  function loadPending() {
    if (!concourse) return
    setLoading(true)
    fetch(ESUMMARY_API_URL + '/shift-pending?concourse=' + encodeURIComponent(concourse))
      .then((res) => res.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (!reportReady || !isActive) return
    loadPending()
    const timer = setInterval(loadPending, 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportReady, concourse, isActive])

  async function lookupSupervisor(initial: string) {
    setSupervisorInitial(initial)
    setSupervisorName('')
    setSupervisorError('')
    if (!initial) return
    try {
      const res = await fetch(ESUMMARY_API_URL + '/account-lookup?initial=' + encodeURIComponent(initial))
      const data = await res.json()
      if (data) setSupervisorName(data.fullName)
      else setSupervisorError('ไม่พบ Initial นี้')
    } catch {
      setSupervisorError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    }
  }

  function handleGenerateReport() {
    if (!dateLabel || !timeRange || !shiftNumber || !supervisorInitial || !supervisorName) return
    setReportReady(true)
  }

  async function handleSubmitSummary() {
    setSubmitError('')
    if (!cutoffId) return setSubmitError('กรุณาเลือกไฟลท์สุดท้ายของกะนี้')
    setSubmitting(true)
    try {
      const res = await fetch(ESUMMARY_API_URL + '/shift-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concourse,
          dateLabel,
          timeRange,
          shiftNumber,
          supervisorInitial,
          supervisorName,
          cutoffCheckinId: cutoffId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setReportReady(false)
        setCreating(false)
        setDateLabel('')
        setTimeRange('')
        setShiftNumber(null)
        setSupervisorInitial('')
        setSupervisorName('')
        setCutoffId('')
        setRows([])
      } else {
        setSubmitError(data.message || 'ส่งไม่สำเร็จ')
      }
    } catch {
      setSubmitError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  function fmtTime(iso: string | null) {
    if (!iso) return '-'
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const arrRows = rows.filter((r) => r.serviceType === 'ARR' || r.serviceType === 'TOWING IN')
  const depRows = rows.filter((r) => r.serviceType === 'DEP' || r.serviceType === 'TOWING OUT')

  const opCounts: Record<string, { dock: number; push: number }> = {}
  function bump(initial: string | null, field: 'dock' | 'push') {
    if (!initial) return
    if (!opCounts[initial]) opCounts[initial] = { dock: 0, push: 0 }
    opCounts[initial][field]++
  }
  arrRows.forEach((r) => {
    if (r.l1EventTime) bump(r.initialL1, 'dock')
    if (r.l2EventTime) bump(r.initialL2, 'dock')
    if (r.l3EventTime) bump(r.initialL3, 'dock')
  })
  depRows.forEach((r) => {
    if (r.l1EventTime) bump(r.initialL1, 'push')
    if (r.l2EventTime) bump(r.initialL2, 'push')
    if (r.l3EventTime) bump(r.initialL3, 'push')
  })

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box', maxWidth: '100%' }}>
      <label style={sectionLabelStyle}>Concourse</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {allConcourses.map((c) => (
          <button
            key={c}
            onClick={() => {
              setConcourse(c)
              setCreating(false)
              setReportReady(false)
            }}
            style={{
              padding: '12px 22px',
              borderRadius: 22,
              border: concourse === c ? '3px solid #1a73e8' : '1px solid #ccc',
              background: concourse === c ? '#e8f0fe' : '#fff',
              color: '#000',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {concourse && !creating && (
        <button onClick={() => setCreating(true)} style={{ ...buttonStyle, background: '#1a73e8', color: '#fff' }}>
          Create e-Summary
        </button>
      )}

      {concourse && creating && !reportReady && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 420 }}>
          <label style={labelStyle}>DATE (เช่น 16 SEP 2026)</label>
          <input type="text" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} placeholder="16 SEP 2026" style={inputStyle} />

          <label style={labelStyle}>TIME</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIME_RANGES.map((t) => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                style={{ ...toggleStyle, background: timeRange === t ? '#1a73e8' : '#fff', color: timeRange === t ? '#fff' : '#000' }}
              >
                {t}
              </button>
            ))}
          </div>

          <label style={labelStyle}>SHIFT</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SHIFT_NUMBERS.map((n) => (
              <button
                key={n}
                onClick={() => setShiftNumber(n)}
                style={{ ...toggleStyle, background: shiftNumber === n ? '#1a73e8' : '#fff', color: shiftNumber === n ? '#fff' : '#000' }}
              >
                {n}
              </button>
            ))}
          </div>

          <label style={labelStyle}>SUPERVISOR (Initial)</label>
          <input
            type="text"
            value={supervisorInitial}
            onChange={(e) => lookupSupervisor(e.target.value.toUpperCase())}
            style={inputStyle}
          />
          {supervisorName && <div style={{ color: '#137333', fontSize: 13, marginTop: 4 }}>{supervisorName}</div>}
          {supervisorError && <div style={{ color: '#c5221f', fontSize: 13, marginTop: 4 }}>{supervisorError}</div>}

          <button
            onClick={handleGenerateReport}
            disabled={!dateLabel || !timeRange || !shiftNumber || !supervisorName}
            style={{ ...buttonStyle, background: '#34a853', color: '#fff', width: '100%', marginTop: 16 }}
          >
            แสดงรายงาน
          </button>
        </div>
      )}

      {reportReady && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginTop: 16, overflowX: 'auto' }}>
          <h2 style={{ textAlign: 'center', color: '#000' }}>VTBS PBB Operator Performance Report</h2>
          <div style={{ textAlign: 'center', fontWeight: 700, color: '#000', marginBottom: 16 }}>
            DATE {dateLabel} &nbsp; TIME {timeRange} &nbsp; SHIFT {shiftNumber} &nbsp; CONCOURSE {concourse} &nbsp; SUPERVISOR {supervisorInitial} ({supervisorName})
          </div>

          {loading && <div style={{ textAlign: 'center', color: '#888' }}>กำลังโหลด...</div>}

          <h3 style={{ color: '#000' }}>ขาเข้า + TOWING IN</h3>
          <table style={reportTableStyle}>
            <thead>
              <tr>
                <th style={th} rowSpan={2}>No.</th>
                <th style={th} rowSpan={2}>Flight No.</th>
                <th style={th} rowSpan={2}>หลุมจอด</th>
                <th style={th} rowSpan={2}>EIBT</th>
                <th style={th} rowSpan={2}>
                  A/C Type
                  <br />
                  A/C Reg.
                </th>
                <th style={th} colSpan={2}>PBB CHECK</th>
                <th style={th} colSpan={3}>เทียบ PBB</th>
              </tr>
              <tr>
                <th style={th}>ผู้เช็ค</th>
                <th style={th}>ACK / เวลา</th>
                <th style={th}>L1</th>
                <th style={th}>L2</th>
                <th style={th}>L3</th>
              </tr>
            </thead>
            <tbody>
              {arrRows.map((r, i) => (
                <tr key={r.checkinId}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>
                    {r.flightNo}
                    {r.serviceType === 'TOWING IN' && <div style={{ fontSize: 11, color: '#666' }}>(TOWING IN)</div>}
                  </td>
                  <td style={td}>{r.stand}</td>
                  <td style={td}>{r.serviceType === 'TOWING IN' ? '-' : fmtTime(r.eibt)}</td>
                  <td style={td}>
                    <div>{r.aircraftType}</div>
                    <div>{r.aircraftReg || '-'}</div>
                  </td>
                  <td style={td}>{r.initialL1}</td>
                  <td style={td}>{r.ack ? `${r.ackByInitial || ''} ${fmtTime(r.ackAt)}` : '-'}</td>
                  <td style={td}>{r.initialL1 ? `${r.initialL1} ${fmtTime(r.l1EventTime)}` : '-'}</td>
                  <td style={td}>{r.initialL2 ? `${r.initialL2} ${fmtTime(r.l2EventTime)}` : '-'}</td>
                  <td style={td}>{r.initialL3 ? `${r.initialL3} ${fmtTime(r.l3EventTime)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ color: '#000', marginTop: 24 }}>ขาออก + TOWING OUT</h3>
          <table style={reportTableStyle}>
            <thead>
              <tr>
                <th style={th} rowSpan={2}>No.</th>
                <th style={th} rowSpan={2}>Flight No.</th>
                <th style={th} rowSpan={2}>หลุมจอด</th>
                <th style={th} rowSpan={2}>EOBT</th>
                <th style={th} rowSpan={2}>
                  A/C Type
                  <br />
                  A/C Reg.
                </th>
                <th style={th} colSpan={2}>PBB CHECK</th>
                <th style={th} colSpan={3}>ถอย PBB</th>
              </tr>
              <tr>
                <th style={th}>ผู้เช็ค</th>
                <th style={th}>ACK / เวลา</th>
                <th style={th}>L1</th>
                <th style={th}>L2</th>
                <th style={th}>L3</th>
              </tr>
            </thead>
            <tbody>
              {depRows.map((r, i) => (
                <tr key={r.checkinId}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>
                    {r.flightNo}
                    {r.serviceType === 'TOWING OUT' && <div style={{ fontSize: 11, color: '#666' }}>(TOWING OUT)</div>}
                  </td>
                  <td style={td}>{r.stand}</td>
                  <td style={td}>{r.serviceType === 'TOWING OUT' ? '-' : fmtTime(r.eobt)}</td>
                  <td style={td}>
                    <div>{r.aircraftType}</div>
                    <div>{r.aircraftReg || '-'}</div>
                  </td>
                  <td style={td}>{r.initialL1}</td>
                  <td style={td}>{r.ack ? `${r.ackByInitial || ''} ${fmtTime(r.ackAt)}` : '-'}</td>
                  <td style={td}>{r.initialL1 ? `${r.initialL1} ${fmtTime(r.l1EventTime)}` : '-'}</td>
                  <td style={td}>{r.initialL2 ? `${r.initialL2} ${fmtTime(r.l2EventTime)}` : '-'}</td>
                  <td style={td}>{r.initialL3 ? `${r.initialL3} ${fmtTime(r.l3EventTime)}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ color: '#000', marginTop: 24 }}>สรุปผลงาน PBB Operator</h3>
          <table style={reportTableStyle}>
            <thead>
              <tr>
                <th style={th}>PBB Operator</th>
                <th style={th}>เทียบ</th>
                <th style={th}>ถอย</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(opCounts).sort().map((initial) => (
                <tr key={initial}>
                  <td style={td}>{initial}</td>
                  <td style={td}>{opCounts[initial].dock}</td>
                  <td style={td}>{opCounts[initial].push}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
            <label style={labelStyle}>เลือกไฟลท์สุดท้ายของกะนี้ *</label>
            <select value={cutoffId} onChange={(e) => setCutoffId(e.target.value)} style={inputStyle}>
              <option value="">-- เลือกไฟลท์ --</option>
              {rows.map((r) => (
                <option key={r.checkinId} value={r.checkinId}>
                  {fmtTime(r.createdAt)} — {r.flightNo} ({r.serviceType})
                </option>
              ))}
            </select>

            <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c5221f', margin: '12px 0', fontWeight: 600 }}>
              ⚠️ กด Submit แล้วจะแก้ไขข้อมูลใน e-Summary นี้ไม่ได้อีก
            </div>

            <button onClick={handleSubmitSummary} disabled={submitting} style={{ ...buttonStyle, background: '#c5221f', color: '#fff', width: '100%' }}>
              {submitting ? 'กำลังส่ง...' : 'Submit e-Summary'}
            </button>
            {submitError && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{submitError}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

const sectionLabelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '0 0 8px', color: '#000' }
const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000', textAlign: 'left' as const }
const inputStyle = { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: '#fff', color: '#000' }
const toggleStyle = { flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const buttonStyle = { padding: 12, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const reportTableStyle = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12, minWidth: 700 }
const th = { padding: '6px 8px', textAlign: 'center' as const, color: '#000', border: '1px solid #ddd', background: '#f0f2f5' }
const td = { padding: '6px 8px', textAlign: 'center' as const, color: '#000', border: '1px solid #eee' }

export default EsummaryPage