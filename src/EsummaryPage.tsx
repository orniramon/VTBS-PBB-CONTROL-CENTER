import { useEffect, useState, useRef } from 'react'

const ESUMMARY_API_URL = 'https://esummary-api.or-niramon.workers.dev'
const CHECKIN_API_URL = 'https://checkin-api.or-niramon.workers.dev'

type CheckinRow = {
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

type MergedRow = { arr?: CheckinRow; dep?: CheckinRow }

const TIME_RANGES = ['08:00-17:00', '17:00-08:00']
const SHIFT_NUMBERS = [1, 2, 3, 4]

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

function toBangkokIso(dateStr: string, hh: number, mm: number) {
  return `${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`
}

function getShiftBounds(reportDate: string, timeRange: string) {
  const [startStr, endStr] = timeRange.split('-')
  const [sh, sm] = startStr.split(':').map(Number)
  const [eh, em] = endStr.split(':').map(Number)
  const start = new Date(toBangkokIso(reportDate, sh, sm))

  let endDateStr = reportDate
  if (eh <= sh) {
    const d = new Date(reportDate + 'T00:00:00+07:00')
    d.setDate(d.getDate() + 1)
    endDateStr = d.toLocaleDateString('en-CA')
  }
  const end = new Date(toBangkokIso(endDateStr, eh, em))
  return { start, end, endDateStr }
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtDateTimeShort(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('th-TH')} ${fmtTime(iso)}`
}

// แปลงวันที่ (YYYY-MM-DD) เป็นแบบไทย DD-MM-YYYY(พ.ศ.) เช่น 2026-09-26 -> 26-09-2569
function fmtThaiDate(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const be = Number(y) + 543
  return `${d}-${m}-${be}`
}

function buildMergedRows(rows: CheckinRow[]): MergedRow[] {
  const arrSide = rows.filter((r) => r.serviceType === 'ARR' || r.serviceType === 'TOWING IN')
  const depSide = rows.filter((r) => r.serviceType === 'DEP' || r.serviceType === 'TOWING OUT')
  const usedDep = new Set<string>()
  const merged: MergedRow[] = []

  arrSide.forEach((a) => {
    let matched: CheckinRow | undefined
    if (a.aircraftReg) {
      matched = depSide.find((d) => !usedDep.has(d.checkinId) && d.aircraftReg === a.aircraftReg)
    }
    if (matched) usedDep.add(matched.checkinId)
    merged.push({ arr: a, dep: matched })
  })
  depSide.forEach((d) => {
    if (!usedDep.has(d.checkinId)) merged.push({ dep: d })
  })

  merged.sort((x, y) => {
    const tx = new Date(x.arr?.createdAt || x.dep!.createdAt).getTime()
    const ty = new Date(y.arr?.createdAt || y.dep!.createdAt).getTime()
    return tx - ty
  })
  return merged
}

function mimicInfo(r?: CheckinRow) {
  if (!r) return null
  const times = [r.l1EventTime, r.l2EventTime, r.l3EventTime].filter(Boolean).map((t) => new Date(t as string).getTime())
  if (times.length === 0) return null
  const latest = new Date(Math.max(...times))
  latest.setMinutes(latest.getMinutes() + 10)
  return { initial: r.ackByInitial || '-', time: latest.toISOString() }
}

function personCell(initial: string | null | undefined, eventTime: string | null | undefined) {
  if (!initial) return '-'
  if (!eventTime) return { initial, time: '' }
  return { initial, time: fmtTime(eventTime) }
}

type Props = { isActive: boolean; myInitial: string; role: string }

function EsummaryPage({ isActive }: Props) {
  const [allConcourses, setAllConcourses] = useState<string[]>([])
  const [concourse, setConcourse] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [checkingActive, setCheckingActive] = useState(false)

  const [reportDate, setReportDate] = useState('')
  const [timeRange, setTimeRange] = useState('')
  const [shiftNumber, setShiftNumber] = useState<number | null>(null)
  const [supervisorInitial, setSupervisorInitial] = useState('')
  const [supervisorName, setSupervisorName] = useState('')
  const [supervisorError, setSupervisorError] = useState('')

  const [checking, setChecking] = useState(false)

  const [firstFlightCandidates, setFirstFlightCandidates] = useState<CheckinRow[]>([])
  const [firstFlightId, setFirstFlightId] = useState('')
  const [firstFlightTime, setFirstFlightTime] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [candidatesChecked, setCandidatesChecked] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [createDraftError, setCreateDraftError] = useState('')

  const [summaryId, setSummaryId] = useState('')
  const [reportReady, setReportReady] = useState(false)
  const [rows, setRows] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  const [lastFlightId, setLastFlightId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [isSubmitted, setIsSubmitted] = useState(false)

  const supervisorReqIdRef = useRef(0)

  useEffect(() => {
    fetch(CHECKIN_API_URL + '/stands')
      .then((res) => res.json())
      .then((data: { stand: string; concourse: string }[]) => {
        setAllConcourses(Array.from(new Set((data || []).map((s) => s.concourse))).sort())
      })
      .catch(() => {})
  }, [])

  // เมื่อแก้ไขข้อมูลในฟอร์ม (วันที่/เวลากะ/ผลัด/ผช.หน.ชุด) หลังจากเคยกด "ถัดไป" ไปแล้ว
  // ให้รีเซ็ตสถานะ เพื่อให้กดถัดไปใหม่ได้อีกครั้ง (ปุ่มจะกลับมาเป็นสีปกติ ไม่เทาค้าง)
  function resetCandidatesCheck() {
    setCandidatesChecked(false)
    setFirstFlightCandidates([])
    setFirstFlightId('')
    setCreateDraftError('')
  }

  async function lookupSupervisor(initial: string) {
    setSupervisorInitial(initial)
    setSupervisorName('')
    setSupervisorError('')
    resetCandidatesCheck()
    if (!initial) return
    // กันปัญหาพิมพ์เร็ว แล้วผลลัพธ์ของตัวอักษรก่อนหน้า (เช่น "W") มาถึงช้ากว่า
    // ผลลัพธ์ของตัวล่าสุด (เช่น "WR") จนไปเขียนทับสถานะที่ถูกต้องอยู่แล้ว
    const reqId = ++supervisorReqIdRef.current
    try {
      const res = await fetch(ESUMMARY_API_URL + '/account-lookup?initial=' + encodeURIComponent(initial))
      const data = await res.json()
      if (reqId !== supervisorReqIdRef.current) return // มีการพิมพ์ต่อไปแล้ว ผลนี้เก่าเกินไป ไม่ต้องใช้
      if (data) setSupervisorName(data.fullName)
      else setSupervisorError('ไม่พบ Initial นี้ หรือไม่ใช่ Role PBB Operator')
    } catch {
      if (reqId !== supervisorReqIdRef.current) return
      setSupervisorError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    }
  }

  // ----------------------------------------------------------------
  // กดปุ่มเลือก Concourse -> เช็คก่อนว่ามีคนสร้าง e-Summary ของ concourse
  // นี้ค้างอยู่ (ยังไม่ submit) หรือไม่ ถ้ามีให้โหลดเข้ามาแสดงเลยทันที
  // ไม่ต้องกรอกวันที่/เวลา/ผลัด/ชื่อผช.หน.ชุด ซ้ำ
  // ----------------------------------------------------------------
  function handleSelectConcourse(c: string) {
    setConcourse(c)
    resetAll()
    setCheckingActive(true)
    fetch(ESUMMARY_API_URL + '/draft-active?concourse=' + encodeURIComponent(c))
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setSummaryId(data.id)
          setReportDate(data.reportDate)
          setTimeRange(data.timeRange)
          setShiftNumber(data.shiftNumber)
          setSupervisorInitial(data.supervisorInitial)
          setSupervisorName(data.supervisorName || '')
          setFirstFlightId(data.firstFlightCheckinId)
          setFirstFlightTime(data.firstFlightTime)
          setIsSubmitted(false)
          setReportReady(true)
        }
      })
      .catch(() => {})
      .finally(() => setCheckingActive(false))
  }

  async function handleCheckShift() {
    if (!concourse || !reportDate || !timeRange || !shiftNumber || !supervisorInitial) return
    setChecking(true)
    try {
      const params = new URLSearchParams({ concourse, reportDate, timeRange, shiftNumber: String(shiftNumber) })
      const res = await fetch(ESUMMARY_API_URL + '/shift-lookup?' + params.toString())
      const data = await res.json()
      if (data && data.isSubmitted) {
        // กะนี้ถูก submit ไปแล้ว - เปิดดูแบบอ่านอย่างเดียว
        setSummaryId(data.id)
        setReportDate(data.reportDate)
        setTimeRange(data.timeRange)
        setShiftNumber(data.shiftNumber)
        setSupervisorInitial(data.supervisorInitial)
        setSupervisorName(data.supervisorName || '')
        setIsSubmitted(true)
        setLoading(true)
        const rowsRes = await fetch(
          ESUMMARY_API_URL + '/checkins-range?' + new URLSearchParams({ concourse, from: data.firstFlightTime, to: data.lastFlightTime })
        )
        const rowsData = await rowsRes.json()
        setRows(Array.isArray(rowsData) ? rowsData : [])
        setLoading(false)
        setReportReady(true)
      } else {
        await loadFirstFlightCandidates()
      }
    } catch {
      setSubmitError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setChecking(false)
    }
  }

  async function loadFirstFlightCandidates() {
    if (!concourse || !reportDate || !timeRange) return
    const { start } = getShiftBounds(reportDate, timeRange)
    const windowStart = new Date(start.getTime() - 45 * 60 * 1000)
    setLoadingCandidates(true)
    setCandidatesChecked(false)
    try {
      const res = await fetch(
        ESUMMARY_API_URL + '/checkins-range?' + new URLSearchParams({ concourse, from: windowStart.toISOString(), to: start.toISOString() })
      )
      const data = await res.json()
      setFirstFlightCandidates(Array.isArray(data) ? data : [])
    } catch {
      setFirstFlightCandidates([])
    } finally {
      setLoadingCandidates(false)
      setCandidatesChecked(true)
    }
  }

  function loadLiveRows(silent?: boolean) {
    if (!concourse || !firstFlightTime) return
    if (!silent) setLoading(true)
    const windowEnd = new Date(Date.now() + 60 * 60 * 1000)
    fetch(ESUMMARY_API_URL + '/checkins-range?' + new URLSearchParams({ concourse, from: firstFlightTime, to: windowEnd.toISOString() }))
      .then((res) => res.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (!reportReady || isSubmitted || !isActive) return
    loadLiveRows()
    // โพลข้อมูลแบบเงียบๆ (ไม่เปิด "กำลังโหลด..." ทุกรอบ) กันหน้าจอกระพริบ
    const timer = setInterval(() => loadLiveRows(true), 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportReady, isSubmitted, isActive, firstFlightTime])

  async function handleConfirmFirstFlight() {
    if (!firstFlightId || !concourse) return
    const flight = firstFlightCandidates.find((r) => r.checkinId === firstFlightId)
    if (!flight) return
    setCreatingDraft(true)
    setCreateDraftError('')
    try {
      const res = await fetch(ESUMMARY_API_URL + '/shift-create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concourse,
          reportDate,
          timeRange,
          shiftNumber,
          supervisorInitial,
          supervisorName,
          firstFlightCheckinId: firstFlightId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSummaryId(data.id)
        setFirstFlightTime(flight.createdAt)
        setIsSubmitted(false)
        setReportReady(true)
      } else {
        setCreateDraftError(data.message || 'สร้าง e-Summary ไม่สำเร็จ (อาจมีคนอื่นสร้างของ concourse นี้ไปพร้อมกัน ลองกดเลือก Concourse ใหม่อีกครั้ง)')
      }
    } catch {
      setCreateDraftError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setCreatingDraft(false)
    }
  }

  async function handleSubmitSummary() {
    setSubmitError('')
    if (!lastFlightId) return setSubmitError('กรุณาเลือกไฟลท์สุดท้ายของกะนี้')
    // ตรวจว่าทุกไฟลท์ในตาราง มีการกรอกเวลาเทียบ/เวลาถอย ครบตามที่ต้องมีหรือยัง
    const incomplete = mergedRows.find((m) => {
      const checkSide = (r?: CheckinRow) => {
        if (!r) return false
        if (!r.initialL1) return false // ยังไม่มีข้อมูล L1 เลย ไม่ต้องเช็ค (แปลว่าไม่มีการใช้สะพานฝั่งนี้)
        return !r.l1EventTime
      }
      return checkSide(m.arr) || checkSide(m.dep)
    })
    if (incomplete) {
      const fn = incomplete.arr?.flightNo || incomplete.dep?.flightNo || ''
      return setSubmitError(`ส่ง e-Summary ไม่สำเร็จ ใส่เวลา (เทียบ)/(ถอย) ไม่ครบ Flight No. ${fn}`)
    }
    setSubmitting(true)
    try {
      const res = await fetch(ESUMMARY_API_URL + '/shift-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: summaryId, lastFlightCheckinId: lastFlightId }),
      })
      const data = await res.json()
      if (data.success) {
        resetAll()
      } else {
        setSubmitError(data.message || 'ส่งไม่สำเร็จ')
      }
    } catch {
      setSubmitError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
      setConfirming(false)
    }
  }

  async function handleDeleteSummary() {
    if (!summaryId) return
    const msg = isSubmitted
      ? 'ยืนยันการลบ e-Summary นี้? ไฟลท์ในช่วงนี้จะกลับไปเป็น "ยังไม่ถูกสรุป" ทันที'
      : 'ยืนยันการยกเลิก e-Summary ที่กำลังทำอยู่นี้? (ใช้เมื่อกรอก วันที่/เวลา/ผลัด/ชื่อผช.หน.ชุด หรือเลือก First Flight ผิด)'
    if (!confirm(msg)) return
    await fetch(ESUMMARY_API_URL + '/shift-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: summaryId }),
    })
    resetAll()
  }

  function resetAll() {
    setCreating(false)
    setReportReady(false)
    setIsSubmitted(false)
    setSummaryId('')
    setReportDate('')
    setTimeRange('')
    setShiftNumber(null)
    setSupervisorInitial('')
    setSupervisorName('')
    setSupervisorError('')
    setFirstFlightCandidates([])
    setFirstFlightId('')
    setFirstFlightTime('')
    setCandidatesChecked(false)
    setCreateDraftError('')
    setLastFlightId('')
    setRows([])
    setSelectedRow(null)
    setSubmitError('')
    setConfirming(false)
  }

  const { end: shiftEnd } = reportDate && timeRange ? getShiftBounds(reportDate, timeRange) : { end: null as unknown as Date }
  const lastFlightCandidates =
    shiftEnd && rows.length > 0
      ? rows.filter((r) => {
          const t = new Date(r.createdAt).getTime()
          return t >= shiftEnd.getTime() - 45 * 60 * 1000 && t <= shiftEnd.getTime() + 45 * 60 * 1000
        })
      : []

  const boundedRows = isSubmitted
    ? rows
    : lastFlightId
      ? rows.filter((r) => new Date(r.createdAt).getTime() <= new Date(rows.find((x) => x.checkinId === lastFlightId)?.createdAt || 0).getTime())
      : rows

  const mergedRows = buildMergedRows(boundedRows)

  const opCounts: Record<string, { dock: number; push: number }> = {}
  function bump(initial: string | null | undefined, field: 'dock' | 'push') {
    if (!initial) return
    if (!opCounts[initial]) opCounts[initial] = { dock: 0, push: 0 }
    opCounts[initial][field]++
  }
  boundedRows.forEach((r) => {
    const isDock = r.serviceType === 'ARR' || r.serviceType === 'TOWING IN'
    const field = isDock ? 'dock' : 'push'
    if (r.l1EventTime) bump(r.initialL1, field)
    if (r.l2EventTime) bump(r.initialL2, field)
    if (r.l3EventTime) bump(r.initialL3, field)
  })
  const opInitials = Object.keys(opCounts).sort()
  const totalDock = opInitials.reduce((s, k) => s + opCounts[k].dock, 0)
  const totalPush = opInitials.reduce((s, k) => s + opCounts[k].push, 0)

  const nextDisabled = !reportDate || !timeRange || !shiftNumber || !supervisorInitial || checking || candidatesChecked

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box' }}>
      <label style={sectionLabelStyle}>Concourse</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxWidth: 320 }}>
        {allConcourses.map((c) => (
          <button
            key={c}
            onClick={() => handleSelectConcourse(c)}
            style={{
              padding: '14px 20px',
              borderRadius: 10,
              border: concourse === c ? '2px solid #1a73e8' : '1px solid #ccc',
              background: getConcourseColor(c),
              color: '#000',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 16,
              textAlign: 'left',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {concourse && checkingActive && <div style={{ color: '#888', maxWidth: 480, margin: '0 auto' }}>กำลังตรวจสอบ...</div>}

      {concourse && !checkingActive && !creating && !reportReady && (
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <button onClick={() => setCreating(true)} style={{ ...buttonStyle, background: '#1a73e8', color: '#fff' }}>
            Create e-Summary
          </button>
        </div>
      )}

      {concourse && creating && !reportReady && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, margin: '16px auto' }}>
          <label style={labelStyle}>วันที่เริ่มกะ</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => {
              setReportDate(e.target.value)
              resetCandidatesCheck()
            }}
            style={dateTimeInputStyle}
          />

          <label style={labelStyle}>TIME</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIME_RANGES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTimeRange(t)
                  resetCandidatesCheck()
                }}
                style={{ ...toggleStyle, background: timeRange === t ? '#1a73e8' : '#fff', color: timeRange === t ? '#fff' : '#000' }}
              >
                {t}
              </button>
            ))}
          </div>
          {reportDate && timeRange && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
              ช่วงกะ: {fmtThaiDate(reportDate)} {timeRange.split('-')[0]} — {fmtThaiDate(getShiftBounds(reportDate, timeRange).endDateStr)}{' '}
              {timeRange.split('-')[1]}
            </div>
          )}

          <label style={labelStyle}>SHIFT</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SHIFT_NUMBERS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setShiftNumber(n)
                  resetCandidatesCheck()
                }}
                style={{ ...toggleStyle, background: shiftNumber === n ? '#1a73e8' : '#fff', color: shiftNumber === n ? '#fff' : '#000' }}
              >
                {n}
              </button>
            ))}
          </div>

          <label style={labelStyle}>ผช.หน.ชุด ประจำ Concourse (Initial)</label>
          <input type="text" value={supervisorInitial} onChange={(e) => lookupSupervisor(e.target.value.toUpperCase())} style={inputStyle} />
          {supervisorName && <div style={{ color: '#137333', fontSize: 13, marginTop: 4 }}>{supervisorName}</div>}
          {supervisorError && <div style={{ color: '#c5221f', fontSize: 13, marginTop: 4 }}>{supervisorError}</div>}

          <button
            onClick={handleCheckShift}
            disabled={nextDisabled}
            style={{
              ...buttonStyle,
              background: nextDisabled ? '#ccc' : '#34a853',
              color: '#fff',
              width: '100%',
              marginTop: 16,
              cursor: nextDisabled ? 'default' : 'pointer',
            }}
          >
            {checking ? 'กำลังตรวจสอบ...' : 'ถัดไป'}
          </button>
        </div>
      )}

      {concourse && creating && !reportReady && candidatesChecked && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, margin: '16px auto' }}>
          <label style={labelStyle}>Choose First Flight *</label>
          {loadingCandidates ? (
            <div style={{ color: '#888' }}>กำลังโหลด...</div>
          ) : firstFlightCandidates.length === 0 ? (
            <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: 12, fontSize: 13, color: '#c5221f' }}>
              ไม่พบไฟลท์ที่เชคอินในช่วง{' '}
              {reportDate && timeRange && (
                <>
                  {fmtDateTimeShort(new Date(getShiftBounds(reportDate, timeRange).start.getTime() - 45 * 60 * 1000).toISOString())} —{' '}
                  {fmtDateTimeShort(getShiftBounds(reportDate, timeRange).start.toISOString())}
                </>
              )}
              <br />
              (ต้องมีการเชคอินผ่านหน้า VTBS PBB CHECK จริงในช่วงนี้ก่อน ถึงจะเลือกเป็น First Flight ได้)
            </div>
          ) : (
            <select value={firstFlightId} onChange={(e) => setFirstFlightId(e.target.value)} style={inputStyle}>
              <option value="">-- เลือกไฟลท์แรกของกะ --</option>
              {firstFlightCandidates.map((r) => (
                <option key={r.checkinId} value={r.checkinId}>
                  {fmtDateTimeShort(r.createdAt)} — {r.flightNo} ({r.serviceType})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleConfirmFirstFlight}
            disabled={!firstFlightId || creatingDraft}
            style={{ ...buttonStyle, background: !firstFlightId || creatingDraft ? '#ccc' : '#34a853', color: '#fff', width: '100%', marginTop: 12 }}
          >
            {creatingDraft ? 'กำลังสร้าง...' : 'Create e-Summary'}
          </button>
          {createDraftError && <div style={{ color: '#c5221f', fontSize: 13, marginTop: 8 }}>{createDraftError}</div>}
        </div>
      )}

      {reportReady && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginTop: 16 }}>
          <div style={{ textAlign: 'center', color: '#000', marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>VTBS PBB OPERATOR PERFORMANCE REPORT</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>รายงานการปฏิบัติงานขับเคลื่อนสะพานเทียบเครื่องบิน</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              งานควบคุมสะพานเทียบเครื่องบิน ส่วนบริการเขตการบิน ฝ่ายปฏิบัติการเขตการบิน ท่าอากาศยานสุวรรณภูมิ
            </div>
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, color: '#000', marginBottom: 16, fontSize: 13 }}>
            DATE {fmtThaiDate(reportDate)} &nbsp;&nbsp; TIME {timeRange} &nbsp;&nbsp; SHIFT {shiftNumber} &nbsp;&nbsp; Concourse {concourse} &nbsp;&nbsp;{' '}
            ผช.หน.ชุด ประจำ Concourse {supervisorName || '-'} ({supervisorInitial})
          </div>

          {loading && <div style={{ textAlign: 'center', color: '#888' }}>กำลังโหลด...</div>}

          <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid #ddd' }}>
            <div style={{ minWidth: 1700 }}>
              <table style={reportTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...stickyCol, ...stickyRow, zIndex: 3 }} rowSpan={2}>
                      No.
                    </th>
                    <th style={{ ...th, ...stickyRow, background: '#e6f4ea' }} colSpan={10}>
                      เที่ยวบินขาเข้า (ARR) และ เรียกเทียบ PBB (TOWING IN)
                    </th>
                    <th style={{ ...th, ...stickyRow, background: '#fef7e0', borderLeft: '3px solid #000' }} colSpan={9}>
                      เที่ยวบินขาออก (DEP) และ เรียกถอย PBB (TOWING OUT)
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>Flight No.</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>หลุมจอด</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>EIBT</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      A/C Type
                      <br />
                      A/C Reg.
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ชื่อผู้เซ็ค
                      <br />
                      เวลา PBB Check
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ACK
                      <br />
                      เวลา ACK
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L1
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L2
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L3
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ชื่อผู้เซ็ต
                      <br />
                      MIMIC/AUTO LEVEL MODE
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33, borderLeft: '3px solid #000' }}>Flight No.</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>หลุมจอด</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>EOBT</th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      A/C Type
                      <br />
                      A/C Reg.
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ชื่อผู้เซ็ค
                      <br />
                      เวลา PBB Check
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ACK
                      <br />
                      เวลา ACK
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้ถอย L1
                      <br />
                      เวลาถอย
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้ถอย L2
                      <br />
                      เวลาถอย
                    </th>
                    <th style={{ ...th, ...stickyRow, top: 33 }}>
                      ผู้ถอย L3
                      <br />
                      เวลาถอย
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((m, i) => {
                    const a = m.arr
                    const d = m.dep
                    const mim = mimicInfo(a)
                    const rowBg = selectedRow === i ? '#fff6c9' : i % 2 === 0 ? '#fff' : '#fafafa'
                    return (
                      <tr key={i} onClick={() => setSelectedRow(selectedRow === i ? null : i)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, ...stickyCol, background: rowBg, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ ...td, background: rowBg }}>
                          {a ? (
                            <>
                              {a.flightNo}
                              {a.serviceType === 'TOWING IN' && <div style={smallNote}>(TOWING IN)</div>}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>{a ? a.stand : '-'}</td>
                        <td style={{ ...td, background: rowBg }}>{a ? (a.serviceType === 'TOWING IN' ? '-' : fmtTime(a.eibt)) : '-'}</td>
                        <td style={{ ...td, background: rowBg }}>
                          {a ? (
                            <>
                              <div>{a.aircraftType}</div>
                              <div>{a.aircraftReg || '-'}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>
                          {a ? (
                            <>
                              <div>{a.initialL1}</div>
                              <div>{fmtTime(a.createdAt)}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>
                          {a ? (
                            a.ack ? (
                              <>
                                <div>{a.ackByInitial}</div>
                                <div>{fmtTime(a.ackAt)}</div>
                              </>
                            ) : (
                              ''
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        {[1, 2, 3].map((n) => {
                          const initial = a ? (a as any)[`initialL${n}`] : null
                          const time = a ? (a as any)[`l${n}EventTime`] : null
                          const cell = a ? personCell(initial, time) : '-'
                          return (
                            <td key={n} style={{ ...td, background: rowBg }}>
                              {cell === '-' || typeof cell === 'string' ? (
                                cell
                              ) : (
                                <>
                                  <div>{cell.initial}</div>
                                  <div>{cell.time}</div>
                                </>
                              )}
                            </td>
                          )
                        })}
                        <td style={{ ...td, background: rowBg }}>
                          {!a ? (
                            '-'
                          ) : mim ? (
                            <>
                              <div>{mim.initial}</div>
                              <div>{fmtTime(mim.time)}</div>
                            </>
                          ) : (
                            ''
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, borderLeft: '3px solid #000' }}>
                          {d ? (
                            <>
                              {d.flightNo}
                              {d.serviceType === 'TOWING OUT' && <div style={smallNote}>(TOWING OUT)</div>}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>{d ? d.stand : '-'}</td>
                        <td style={{ ...td, background: rowBg }}>{d ? (d.serviceType === 'TOWING OUT' ? '-' : fmtTime(d.eobt)) : '-'}</td>
                        <td style={{ ...td, background: rowBg }}>
                          {d ? (
                            <>
                              <div>{d.aircraftType}</div>
                              <div>{d.aircraftReg || '-'}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>
                          {d ? (
                            <>
                              <div>{d.initialL1}</div>
                              <div>{fmtTime(d.createdAt)}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg }}>
                          {d ? (
                            d.ack ? (
                              <>
                                <div>{d.ackByInitial}</div>
                                <div>{fmtTime(d.ackAt)}</div>
                              </>
                            ) : (
                              ''
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        {[1, 2, 3].map((n) => {
                          const initial = d ? (d as any)[`initialL${n}`] : null
                          const time = d ? (d as any)[`l${n}EventTime`] : null
                          const cell = d ? personCell(initial, time) : '-'
                          return (
                            <td key={n} style={{ ...td, background: rowBg }}>
                              {cell === '-' || typeof cell === 'string' ? (
                                cell
                              ) : (
                                <>
                                  <div>{cell.initial}</div>
                                  <div>{cell.time}</div>
                                </>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <h3 style={{ color: '#000', marginTop: 24, textAlign: 'center' }}>สรุปผลงาน PBB Operator</h3>
          <div style={{ overflowX: 'auto', maxWidth: 900, margin: '0 auto' }}>
            <table style={{ ...reportTableStyle, minWidth: 'auto' }}>
              <thead>
                <tr>
                  <th style={th}>PBB Operator (Initial)</th>
                  {opInitials.map((initial) => (
                    <th key={initial} style={th}>
                      {initial}
                    </th>
                  ))}
                  <th style={{ ...th, background: '#f0f2f5' }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>เทียบ</td>
                  {opInitials.map((initial) => (
                    <td key={initial} style={td}>
                      {opCounts[initial].dock}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700 }}>{totalDock}</td>
                </tr>
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>ถอย</td>
                  {opInitials.map((initial) => (
                    <td key={initial} style={td}>
                      {opCounts[initial].push}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700 }}>{totalPush}</td>
                </tr>
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>รวม</td>
                  {opInitials.map((initial) => (
                    <td key={initial} style={td}>
                      {opCounts[initial].dock + opCounts[initial].push}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700 }}>{totalDock + totalPush}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {!isSubmitted && (
            <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16, maxWidth: 480, margin: '24px auto 0' }}>
              <label style={labelStyle}>Choose Last Flight *</label>
              <select value={lastFlightId} onChange={(e) => setLastFlightId(e.target.value)} style={inputStyle}>
                <option value="">-- เลือกไฟลท์สุดท้ายของกะ --</option>
                {lastFlightCandidates.map((r) => (
                  <option key={r.checkinId} value={r.checkinId}>
                    {fmtDateTimeShort(r.createdAt)} — {r.flightNo} ({r.serviceType})
                  </option>
                ))}
              </select>

              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!lastFlightId}
                  style={{ ...buttonStyle, background: !lastFlightId ? '#ccc' : '#c5221f', color: '#fff', width: '100%', marginTop: 12 }}
                >
                  Submit e-Summary
                </button>
              ) : (
                <div style={{ background: '#fce8e6', border: '1px solid #c5221f', borderRadius: 8, padding: 14, marginTop: 12 }}>
                  <div style={{ color: '#c5221f', fontWeight: 600, marginBottom: 10 }}>
                    ⚠️ โปรดตรวจสอบข้อมูลให้ถูกต้อง ก่อนกด Submit e-Summary
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSubmitSummary} disabled={submitting} style={{ ...buttonStyle, background: '#c5221f', color: '#fff', flex: 1 }}>
                      {submitting ? 'กำลังส่ง...' : 'ส่ง'}
                    </button>
                    <button onClick={() => setConfirming(false)} style={{ ...buttonStyle, background: '#999', color: '#fff', flex: 1 }}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
              {submitError && <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8 }}>{submitError}</div>}

              <button onClick={handleDeleteSummary} style={{ ...buttonStyle, background: '#fff', border: '1px solid #c5221f', color: '#c5221f', width: '100%', marginTop: 16 }}>
                ลบ e-Summary
              </button>
            </div>
          )}

          {isSubmitted && (
            <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16, maxWidth: 480, margin: '24px auto 0' }}>
              <div style={{ color: '#137333', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
                ✓ e-Summary นี้ถูก Submit ไปแล้ว (แก้ไขไม่ได้ — ถ้าข้อมูลผิด ต้องลบแล้วสร้างใหม่)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDeleteSummary} style={{ ...buttonStyle, background: '#c5221f', color: '#fff', flex: 1 }}>
                  ลบ e-Summary นี้
                </button>
                <button onClick={resetAll} style={{ ...buttonStyle, background: '#999', color: '#fff', flex: 1 }}>
                  ปิด
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const sectionLabelStyle = { display: 'block', fontWeight: 700, fontSize: 20, margin: '0 0 8px', color: '#000' }
const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000', textAlign: 'left' as const }
const inputStyle = { width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: '#fff', color: '#000' }
const dateTimeInputStyle = { ...inputStyle, width: 'auto', maxWidth: '100%', display: 'block' as const }
const toggleStyle = { flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const buttonStyle = { padding: 12, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const reportTableStyle = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11, minWidth: 700 }
const th = { padding: '6px 6px', textAlign: 'center' as const, color: '#000', border: '1px solid #ddd', background: '#f0f2f5' }
const td = { padding: '6px 6px', textAlign: 'center' as const, color: '#000', border: '1px solid #eee' }
const smallNote = { fontSize: '0.85em', color: '#666' }
const stickyCol = { position: 'sticky' as const, left: 0, zIndex: 2, background: '#f0f2f5' }
const stickyRow = { position: 'sticky' as const, top: 0, zIndex: 1 }

export default EsummaryPage