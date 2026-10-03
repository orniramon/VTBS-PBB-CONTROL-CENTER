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

type FieldGroup = 'flightNo' | 'eibt' | 'eobt' | 'aircraft' | 'l1' | 'l2' | 'l3'
type EditTarget = {
  checkinId: string
  group: FieldGroup
  title: string
  flightNo: string
  current: { flightNo?: string; time?: string; aircraftType?: string; aircraftReg?: string; initial?: string }
}

type SummaryInfo = {
  id: string
  concourse: string
  reportDate: string
  timeRange: string
  shiftNumber: number
  supervisorInitial: string
  supervisorName: string | null
  firstFlightTime: string
  lastFlightTime: string
  submittedAt: string
  isSubmitted: boolean
}

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

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
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
  latest.setMinutes(latest.getMinutes() + 5)
  return { initial: r.ackByInitial || '-', time: latest.toISOString() }
}

function personCell(initial: string | null | undefined, eventTime: string | null | undefined) {
  if (!initial) return '-'
  if (!eventTime) return { initial, time: '' }
  return { initial, time: fmtTime(eventTime) }
}

const CAN_MANAGE_ROLES = ['Apron', 'Supervisor']

// ----------------------------------------------------------------
// จำข้อมูลหัวรายงาน (DATE/TIME/SHIFT/ผช.หน.ชุด) ที่กำลังกรอกอยู่ แยกตาม
// concourse ไว้ใน localStorage เพื่อให้กดรีเฟรชหน้าเว็บแล้วไม่ต้องเลือกใหม่
// ----------------------------------------------------------------
function readSavedConcourse(): string | null {
  try {
    return localStorage.getItem('plb_esummary_concourse')
  } catch {
    return null
  }
}
type HeaderDraft = { reportDate?: string; timeRange?: string; shiftNumber?: number | null; supervisorInitial?: string; supervisorName?: string }
function loadHeaderDraft(c: string | null): HeaderDraft {
  if (!c) return {}
  try {
    const raw = localStorage.getItem('plb_esummary_header_' + c)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function saveHeaderDraft(c: string | null, draft: HeaderDraft) {
  if (!c) return
  try {
    localStorage.setItem('plb_esummary_header_' + c, JSON.stringify(draft))
  } catch {}
}

type Props = { isActive: boolean; myInitial: string; role: string }

function EsummaryPage({ isActive, myInitial, role }: Props) {
  const canManage = CAN_MANAGE_ROLES.includes(role)

  const [allConcourses, setAllConcourses] = useState<string[]>([])
  // จำ concourse ที่เลือกไว้ใน localStorage เพื่อให้กดรีเฟรชหน้าเว็บแล้ว
  // ยังอยู่ concourse เดิม ไม่ต้องกดเลือกใหม่ (ข้อมูลจะโหลดอัปเดตให้เองด้านล่าง)
  const [concourse, setConcourse] = useState<string | null>(readSavedConcourse)

  // ----- รายการไฟลท์ที่ "รอสรุป" (ยังไม่ถูกรวมเข้า e-Summary ฉบับไหน) -----
  const [pendingRows, setPendingRows] = useState<CheckinRow[]>([])
  const [loadingPending, setLoadingPending] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  // ----- ฟอร์มข้อมูลกะ (จำค่าไว้ใน localStorage แยกตาม concourse กันรีเฟรชแล้วหาย) -----
  const [reportDate, setReportDate] = useState(() => loadHeaderDraft(readSavedConcourse()).reportDate || '')
  const [timeRange, setTimeRange] = useState(() => loadHeaderDraft(readSavedConcourse()).timeRange || '')
  const [shiftNumber, setShiftNumber] = useState<number | null>(() => loadHeaderDraft(readSavedConcourse()).shiftNumber || null)
  const [supervisorInitial, setSupervisorInitial] = useState(() => loadHeaderDraft(readSavedConcourse()).supervisorInitial || '')
  const [supervisorName, setSupervisorName] = useState(() => loadHeaderDraft(readSavedConcourse()).supervisorName || '')
  const [supervisorError, setSupervisorError] = useState('')
  const supervisorReqIdRef = useRef(0)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  // ----- ดู e-Summary ย้อนหลัง (read-only) -----
  const [viewingHistoryList, setViewingHistoryList] = useState(false)
  const [historyList, setHistoryList] = useState<SummaryInfo[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [viewSummary, setViewSummary] = useState<SummaryInfo | null>(null)
  const [viewRows, setViewRows] = useState<CheckinRow[]>([])
  const [loadingView, setLoadingView] = useState(false)

  // ช่องที่ "ข้อมูลไม่ครบ" จากการพยายาม Submit ครั้งล่าสุด (ไฮไลท์สีแดงอ่อนเฉพาะช่อง)
  // คีย์รูปแบบ "<checkinId>_l1" / "_l2" / "_l3"
  const [incompleteCells, setIncompleteCells] = useState<Set<string>>(new Set())

  // ----- แก้ไขข้อมูลเชคอิน (ดับเบิลคลิก - เฉพาะ Role Apron/Supervisor) -----
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  useEffect(() => {
    fetch(CHECKIN_API_URL + '/stands')
      .then((res) => res.json())
      .then((data: { stand: string; concourse: string }[]) => {
        setAllConcourses(Array.from(new Set((data || []).map((s) => s.concourse))).sort())
      })
      .catch(() => {})
  }, [])

  // ล้างฟอร์มทั้งหมด (ใช้หลัง Submit สำเร็จ - เริ่มฉบับใหม่) และลบ draft ที่จำไว้
  function resetForm() {
    setReportDate('')
    setTimeRange('')
    setShiftNumber(null)
    setSupervisorInitial('')
    setSupervisorName('')
    setSupervisorError('')
    setExcludedIds(new Set())
    setSubmitError('')
    setConfirming(false)
    setSelectedRow(null)
    setIncompleteCells(new Set())
    if (concourse) {
      try {
        localStorage.removeItem('plb_esummary_header_' + concourse)
      } catch {}
    }
  }

  // ----------------------------------------------------------------
  // เลือก Concourse -> โหลดไฟลท์ที่ "รอสรุป" ของ concourse นี้ขึ้นมาทันที
  // ไม่ต้องกด Create ไม่ต้องเลือก First Flight อีกต่อไป
  // (โหลด draft ที่จำไว้ของ concourse นี้กลับมาด้วย ถ้ามี แทนที่จะล้างฟอร์มทิ้งเสมอ)
  // ----------------------------------------------------------------
  function handleSelectConcourse(c: string) {
    setConcourse(c)
    try {
      localStorage.setItem('plb_esummary_concourse', c)
    } catch {}
    const draft = loadHeaderDraft(c)
    setReportDate(draft.reportDate || '')
    setTimeRange(draft.timeRange || '')
    setShiftNumber(draft.shiftNumber || null)
    setSupervisorInitial(draft.supervisorInitial || '')
    setSupervisorName(draft.supervisorName || '')
    setSupervisorError('')
    setExcludedIds(new Set())
    setSubmitError('')
    setConfirming(false)
    setSelectedRow(null)
    setIncompleteCells(new Set())
    setViewingHistoryList(false)
    setViewSummary(null)
    setViewRows([])
    loadPending(c)
  }

  // บันทึก draft หัวรายงานทุกครั้งที่ข้อมูลเปลี่ยน (เฉพาะตอนกำลังกรอกฟอร์มใหม่)
  useEffect(() => {
    if (!concourse || viewSummary) return
    saveHeaderDraft(concourse, { reportDate, timeRange, shiftNumber, supervisorInitial, supervisorName })
  }, [concourse, viewSummary, reportDate, timeRange, shiftNumber, supervisorInitial, supervisorName])

  function loadPending(c: string, silent?: boolean) {
    if (!silent) setLoadingPending(true)
    fetch(ESUMMARY_API_URL + '/pending-checkins?' + new URLSearchParams({ concourse: c }))
      .then((res) => res.json())
      .then((data) => setPendingRows(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingPending(false))
  }

  useEffect(() => {
    if (!concourse || viewSummary || viewingHistoryList || !isActive) return
    // โหลดทันทีด้วย (ครอบคลุมกรณี concourse ถูกจำมาจาก localStorage ตอนรีเฟรชหน้าเว็บ)
    loadPending(concourse, true)
    const timer = setInterval(() => loadPending(concourse, true), 10000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concourse, viewSummary, viewingHistoryList, isActive])

  async function lookupSupervisor(initial: string) {
    setSupervisorInitial(initial)
    setSupervisorName('')
    setSupervisorError('')
    if (!initial) return
    const reqId = ++supervisorReqIdRef.current
    try {
      const res = await fetch(ESUMMARY_API_URL + '/account-lookup?initial=' + encodeURIComponent(initial))
      const data = await res.json()
      if (reqId !== supervisorReqIdRef.current) return
      if (data) setSupervisorName(data.fullName)
      else setSupervisorError('ไม่พบ Initial นี้ หรือไม่ใช่ Role PBB Operator')
    } catch {
      if (reqId !== supervisorReqIdRef.current) return
      setSupervisorError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    }
  }

  // ----------------------------------------------------------------
  // ติ๊ก/ติ๊กออก เป็นรายไฟลท์ "แยกฝั่ง ARR และ DEP อิสระจากกัน" เพราะบางครั้ง
  // ขาเข้า (ARR) เป็นของผลัดหนึ่ง แต่ขาออก (DEP) ของเครื่องบินลำเดียวกันกลับ
  // เป็นของอีกผลัดนึง (คนละช่วงเวลา คนละคนรับผิดชอบ) จึงต้องแยกติ๊กคนละช่อง
  // ค่าเริ่มต้นคือติ๊กไว้ทุกแถว (รวมหมด) ใช้ติ๊กออกเฉพาะไฟลท์ที่ไม่ใช่ของกะนี้
  // ----------------------------------------------------------------
  function toggleChecking(checkinId: string | undefined) {
    if (!checkinId) return
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(checkinId)) next.delete(checkinId)
      else next.add(checkinId)
      return next
    })
  }

  // ----------------------------------------------------------------
  // แก้ไขข้อมูลเชคอิน (ดับเบิลคลิกที่ช่อง - เฉพาะ Role Apron/Supervisor)
  // แก้ตรงตาราง checkins เลย จึงอัปเดตให้เองทั้งแท็บ PBB Check Record / PBB Photo
  // ----------------------------------------------------------------
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  function openEdit(r: CheckinRow | undefined, group: FieldGroup, title: string) {
    if (!canManage || !r) return
    let current: EditTarget['current'] = {}
    if (group === 'flightNo') current = { flightNo: r.flightNo }
    else if (group === 'eibt') current = { time: fmtTime(r.eibt) }
    else if (group === 'eobt') current = { time: fmtTime(r.eobt) }
    else if (group === 'aircraft') current = { aircraftType: r.aircraftType, aircraftReg: r.aircraftReg || '' }
    else if (group === 'l1') current = { initial: r.initialL1 || '', time: fmtTime(r.l1EventTime) }
    else if (group === 'l2') current = { initial: r.initialL2 || '', time: fmtTime(r.l2EventTime) }
    else if (group === 'l3') current = { initial: r.initialL3 || '', time: fmtTime(r.l3EventTime) }
    setEditError('')
    setEditTarget({ checkinId: r.checkinId, group, title, flightNo: r.flightNo, current })
  }

  async function handleSaveEdit(values: Record<string, string>) {
    if (!editTarget) return
    setSavingEdit(true)
    setEditError('')
    try {
      const res = await fetch(CHECKIN_API_URL + '/checkin-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkinId: editTarget.checkinId,
          initial: myInitial,
          fieldGroup: editTarget.group,
          values,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditTarget(null)
        if (viewSummary) {
          handleOpenHistoryItem(viewSummary)
        } else if (concourse) {
          loadPending(concourse, true)
        }
      } else {
        setEditError(data.message || 'บันทึกไม่สำเร็จ')
      }
    } catch {
      setEditError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSavingEdit(false)
    }
  }

  // ----------------------------------------------------------------
  // ดู e-Summary ย้อนหลัง (เฉพาะที่ submit แล้ว) ของ concourse ที่เลือกไว้
  // ----------------------------------------------------------------
  function handleOpenHistoryList() {
    if (!concourse) return
    setViewingHistoryList(true)
    setLoadingHistory(true)
    fetch(ESUMMARY_API_URL + '/shift-list?' + new URLSearchParams({ concourse, limit: '30' }))
      .then((res) => res.json())
      .then((data) => setHistoryList(Array.isArray(data) ? data : []))
      .catch(() => setHistoryList([]))
      .finally(() => setLoadingHistory(false))
  }

  function handleOpenHistoryItem(item: SummaryInfo) {
    setViewingHistoryList(false)
    setLoadingView(true)
    fetch(ESUMMARY_API_URL + '/esummary-view?' + new URLSearchParams({ esummaryId: item.id }))
      .then((res) => res.json())
      .then((data) => {
        setViewSummary(data.summary)
        setViewRows(Array.isArray(data.rows) ? data.rows : [])
      })
      .catch(() => {})
      .finally(() => setLoadingView(false))
  }

  function handleCloseView() {
    setViewSummary(null)
    setViewRows([])
    if (concourse) loadPending(concourse)
  }

  // แถวที่ "รวม" เข้า e-Summary ฉบับที่จะ submit (ยังไม่ถูกติ๊กออก)
  const includedRows = pendingRows.filter((r) => !excludedIds.has(r.checkinId))

  async function handleSubmit() {
    setSubmitError('')
    setIncompleteCells(new Set())
    if (!reportDate || !timeRange || !shiftNumber || !supervisorInitial) {
      return setSubmitError('⚠️ กรุณากรอกข้อมูลให้ครบทุกช่อง (วันที่/เวลา/ผลัด/ผช.หน.ชุด)')
    }
    if (includedRows.length === 0) {
      return setSubmitError('⚠️ ยังไม่มีไฟลท์ที่เลือกไว้สำหรับ e-Summary ฉบับนี้ (ไฟลท์ถูกติ๊กออกหมด)')
    }
    // ตรวจทุกไฟลท์ที่เลือกไว้ ว่าแถวไหนมี "ผู้เทียบ/ถอย" ใส่ไว้แล้ว แต่ไม่มี "เวลาเทียบ/ถอย"
    // คู่กัน (ข้อมูลไม่ครบ) - เก็บเป็นช่องๆ ไว้ไฮไลท์ ไม่เอาทั้งแถว
    const missing = new Set<string>()
    includedRows.forEach((r) => {
      ;([1, 2, 3] as const).forEach((n) => {
        const initial = (r as any)[`initialL${n}`]
        const time = (r as any)[`l${n}EventTime`]
        if (initial && !time) missing.add(`${r.checkinId}_l${n}`)
      })
    })
    if (missing.size > 0) {
      setIncompleteCells(missing)
      return setSubmitError('Submit e-Summary ไม่สำเร็จ\nเนื่องจากใส่ข้อมูลไม่ครบ')
    }
    setConfirming(true)
  }

  async function handleConfirmSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(ESUMMARY_API_URL + '/esummary-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concourse,
          reportDate,
          timeRange,
          shiftNumber,
          supervisorInitial,
          supervisorName,
          checkinIds: includedRows.map((r) => r.checkinId),
        }),
      })
      const data = await res.json()
      if (data.success) {
        resetForm()
        if (concourse) loadPending(concourse)
      } else {
        setSubmitError(data.message || 'ส่งไม่สำเร็จ')
        setConfirming(false)
      }
    } catch {
      setSubmitError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ---- ตารางที่แสดงอยู่ตอนนี้: ถ้ากำลังดูฉบับเก่า ใช้ viewRows / ไม่งั้นใช้ pendingRows ----
  const displayRows = viewSummary ? viewRows : pendingRows
  const mergedRows = buildMergedRows(displayRows)
  const isSubmitted = !!viewSummary
  const countRows = viewSummary ? viewRows : includedRows

  const opCounts: Record<string, { dock: number; push: number }> = {}
  function bump(initial: string | null | undefined, field: 'dock' | 'push') {
    if (!initial) return
    if (!opCounts[initial]) opCounts[initial] = { dock: 0, push: 0 }
    opCounts[initial][field]++
  }
  countRows.forEach((r) => {
    const isDock = r.serviceType === 'ARR' || r.serviceType === 'TOWING IN'
    const field = isDock ? 'dock' : 'push'
    if (r.l1EventTime) bump(r.initialL1, field)
    if (r.l2EventTime) bump(r.initialL2, field)
    if (r.l3EventTime) bump(r.initialL3, field)
  })
  const opInitials = Object.keys(opCounts).sort()
  const totalDock = opInitials.reduce((s, k) => s + opCounts[k].dock, 0)
  const totalPush = opInitials.reduce((s, k) => s + opCounts[k].push, 0)

  const headerReportDate = viewSummary ? viewSummary.reportDate : reportDate
  const headerTimeRange = viewSummary ? viewSummary.timeRange : timeRange
  const headerShiftNumber = viewSummary ? viewSummary.shiftNumber : shiftNumber
  const headerSupervisorName = viewSummary ? viewSummary.supervisorName : supervisorName
  const headerSupervisorInitial = viewSummary ? viewSummary.supervisorInitial : supervisorInitial

  return (
    <div style={{ padding: '16px 12px', boxSizing: 'border-box' }}>
      <label style={{ ...sectionLabelStyle, textAlign: 'center' as const }}>Concourse</label>
      <div style={{ marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
        <select
          value={concourse || ''}
          onChange={(e) => {
            if (e.target.value) handleSelectConcourse(e.target.value)
          }}
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: 10,
            border: concourse ? '2px solid #1a73e8' : '1px solid #ccc',
            background: concourse ? getConcourseColor(concourse) : '#fff',
            color: '#000',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 16,
            boxSizing: 'border-box',
          }}
        >
          <option value="">-- เลือก Concourse --</option>
          {allConcourses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {concourse && viewingHistoryList && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, margin: '16px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ ...labelStyle, margin: 0 }}>e-Summary ย้อนหลัง (Concourse {concourse})</label>
            <button onClick={() => setViewingHistoryList(false)} style={{ ...buttonStyle, background: '#999', color: '#fff', padding: '6px 12px', fontSize: 13 }}>
              ปิด
            </button>
          </div>
          {loadingHistory ? (
            <div style={{ color: '#888', textAlign: 'center', padding: 12 }}>กำลังโหลด...</div>
          ) : historyList.length === 0 ? (
            <div style={{ color: '#999', textAlign: 'center', padding: 12, fontSize: 14 }}>ยังไม่มี e-Summary ที่ Submit แล้วของ Concourse นี้</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historyList.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleOpenHistoryItem(item)}
                  style={{ ...buttonStyle, textAlign: 'left', background: '#f0f4fa', border: '1px solid #ddd', color: '#000' }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {fmtThaiDate(item.reportDate)} &nbsp; {item.timeRange} &nbsp; SHIFT {item.shiftNumber}
                  </div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                    ผช.หน.ชุด {item.supervisorName || '-'} ({item.supervisorInitial})
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {concourse && loadingView && <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>กำลังโหลด...</div>}

      {concourse && !viewingHistoryList && !loadingView && (viewSummary || !loadingPending) && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginTop: 8 }}>
          <div style={{ textAlign: 'center', color: '#000', marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>VTBS PBB OPERATOR PERFORMANCE REPORT</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>รายงานการปฏิบัติงานขับเคลื่อนสะพานเทียบเครื่องบิน</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              งานควบคุมสะพานเทียบเครื่องบิน ส่วนบริการเขตการบิน ฝ่ายปฏิบัติการเขตการบิน ท่าอากาศยานสุวรรณภูมิ
            </div>
          </div>
          {isSubmitted ? (
            <div style={{ textAlign: 'center', fontWeight: 700, color: '#000', marginBottom: 14, fontSize: 13, lineHeight: 1.8 }}>
              DATE {headerReportDate ? fmtThaiDate(headerReportDate) : '…'} &nbsp;&nbsp;&nbsp;&nbsp; TIME {headerTimeRange || '…'} &nbsp;&nbsp;&nbsp;&nbsp; SHIFT{' '}
              {headerShiftNumber || '…'} &nbsp;&nbsp;&nbsp;&nbsp; Concourse {concourse} &nbsp;&nbsp;&nbsp;&nbsp; ผช.หน.ชุด ประจำ Concourse{' '}
              {headerSupervisorName || '-'} ({headerSupervisorInitial || '-'})
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                rowGap: 10,
                columnGap: 18,
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#000',
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <span>DATE</span>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} style={inlineFieldStyle} />
              <span>TIME</span>
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} style={inlineFieldStyle}>
                <option value="">--</option>
                {TIME_RANGES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span>SHIFT</span>
              <select
                value={shiftNumber ?? ''}
                onChange={(e) => setShiftNumber(e.target.value ? Number(e.target.value) : null)}
                style={{ ...inlineFieldStyle, width: 56 }}
              >
                <option value="">--</option>
                {SHIFT_NUMBERS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>Concourse {concourse}</span>
              <span>ผช.หน.ชุด ประจำ Concourse</span>
              <input
                type="text"
                value={supervisorInitial}
                onChange={(e) => lookupSupervisor(e.target.value.toUpperCase())}
                placeholder="Initial"
                style={{ ...inlineFieldStyle, width: 70 }}
              />
              {supervisorName && <span style={{ color: '#137333' }}>{supervisorName}</span>}
              {supervisorError && <span style={{ color: '#c5221f', fontSize: 11, fontWeight: 400 }}>{supervisorError}</span>}
            </div>
          )}

          <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid #ddd' }}>
            <div style={{ minWidth: 1850 }}>
              <table style={reportTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...stickyCol, ...stickyRow, zIndex: 3 }} rowSpan={2}>
                      No.
                    </th>
                    {!isSubmitted && (
                      <th style={{ ...th, ...stickyRow, background: '#e6f4ea' }} rowSpan={2}>
                        Choose
                        <br />
                        Flt.
                      </th>
                    )}
                    <th style={{ ...th, ...stickyRow, background: '#e6f4ea' }} colSpan={10}>
                      เที่ยวบินขาเข้า (ARR) และ เรียกเทียบ PBB (TOWING IN)
                    </th>
                    {!isSubmitted && (
                      <th style={{ ...th, ...stickyRow, background: '#fef7e0' }} rowSpan={2}>
                        Choose
                        <br />
                        Flt.
                      </th>
                    )}
                    <th style={{ ...th, ...stickyRow, background: '#fef7e0', borderLeft: '3px solid #000' }} colSpan={9}>
                      เที่ยวบินขาออก (DEP) และ เรียกถอย PBB (TOWING OUT)
                    </th>
                  </tr>
                  <tr>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>Flight No.</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>หลุมจอด</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>EIBT</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      A/C Type
                      <br />
                      A/C Reg.
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ชื่อผู้เช็ค
                      <br />
                      เวลา
                      <br />
                      PBB Check
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ACK
                      <br />
                      เวลา ACK
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L1
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L2
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้เทียบ L3
                      <br />
                      เวลาเทียบ
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ชื่อผู้เช็ค/
                      <br />
                      เวลาเช็ค MIMIC/
                      <br />
                      AUTO LEVEL MODE
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33, borderLeft: '3px solid #000' }}>Flight No.</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>หลุมจอด</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>EOBT</th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      A/C Type
                      <br />
                      A/C Reg.
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ชื่อผู้เช็ค
                      <br />
                      เวลา
                      <br />
                      PBB Check
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ACK
                      <br />
                      เวลา ACK
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้ถอย L1
                      <br />
                      เวลาถอย
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้ถอย L2
                      <br />
                      เวลาถอย
                    </th>
                    <th style={{ ...dataTh, ...stickyRow, top: 33 }}>
                      ผู้ถอย L3
                      <br />
                      เวลาถอย
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.length === 0 && (
                    <tr>
                      <td colSpan={isSubmitted ? 20 : 22} style={{ ...td, color: '#999', padding: 20 }}>
                        {isSubmitted ? 'ไม่มีข้อมูล' : 'ยังไม่มีไฟลท์ที่รอสรุปของ Concourse นี้'}
                      </td>
                    </tr>
                  )}
                  {mergedRows.map((m, i) => {
                    const a = m.arr
                    const d = m.dep
                    const mim = mimicInfo(a)
                    // ARR และ DEP ติ๊กรวม/ติ๊กออกอิสระจากกัน (เผื่อกรณีขาเข้า-ขาออกของเครื่องบิน
                    // ลำเดียวกัน คาบเกี่ยวกันคนละผลัด)
                    const arrIncluded = !a || !excludedIds.has(a.checkinId)
                    const depIncluded = !d || !excludedIds.has(d.checkinId)
                    const rowBg = selectedRow === i ? '#fffbe6' : i % 2 === 0 ? '#fff' : '#fafafa'
                    const arrDim = !isSubmitted && a && !arrIncluded ? { opacity: 0.45 } : undefined
                    const depDim = !isSubmitted && d && !depIncluded ? { opacity: 0.45 } : undefined
                    return (
                      <tr key={i} onClick={() => setSelectedRow(selectedRow === i ? null : i)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, ...stickyCol, background: rowBg, fontWeight: 600 }}>{i + 1}</td>
                        {!isSubmitted && (
                          <td style={{ ...td, background: rowBg }} onClick={(e) => e.stopPropagation()}>
                            {a && (
                              <input
                                type="checkbox"
                                checked={arrIncluded}
                                onChange={() => toggleChecking(a.checkinId)}
                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                              />
                            )}
                          </td>
                        )}
                        <td
                          style={{ ...td, background: rowBg, ...arrDim, ...(canManage && a ? editableCellStyle : undefined) }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            openEdit(a, 'flightNo', 'Flight No. (ขาเข้า)')
                          }}
                        >
                          {a ? (
                            <>
                              {a.flightNo}
                              {a.serviceType === 'TOWING IN' && <div style={smallNote}>(TOWING IN)</div>}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...arrDim }}>{a ? a.stand : '-'}</td>
                        <td
                          style={{ ...td, background: rowBg, ...arrDim, ...(canManage && a && a.serviceType !== 'TOWING IN' ? editableCellStyle : undefined) }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (a && a.serviceType !== 'TOWING IN') openEdit(a, 'eibt', 'EIBT (ขาเข้า)')
                          }}
                        >
                          {a ? (a.serviceType === 'TOWING IN' ? '-' : fmtTime(a.eibt)) : '-'}
                        </td>
                        <td
                          style={{ ...td, background: rowBg, ...arrDim, ...(canManage && a ? editableCellStyle : undefined) }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            openEdit(a, 'aircraft', 'A/C Type / A/C Reg. (ขาเข้า)')
                          }}
                        >
                          {a ? (
                            <>
                              <div>{a.aircraftType}</div>
                              <div>{a.aircraftReg || '-'}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...arrDim }}>
                          {a ? (
                            <>
                              <div>{a.initialL1}</div>
                              <div>{fmtTime(a.createdAt)}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...arrDim }}>
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
                          const group = `l${n}` as FieldGroup
                          const incomplete = a ? incompleteCells.has(`${a.checkinId}_l${n}`) : false
                          return (
                            <td
                              key={n}
                              style={{
                                ...td,
                                background: rowBg,
                                ...arrDim,
                                ...(canManage && a ? editableCellStyle : undefined),
                                ...(incomplete ? incompleteCellStyle : undefined),
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                if (a) openEdit(a, group, `ผู้เทียบ L${n} / เวลาเทียบ (ขาเข้า)`)
                              }}
                            >
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
                        <td style={{ ...td, background: rowBg, ...arrDim }}>
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
                        {!isSubmitted && (
                          <td style={{ ...td, background: rowBg }} onClick={(e) => e.stopPropagation()}>
                            {d && (
                              <input
                                type="checkbox"
                                checked={depIncluded}
                                onChange={() => toggleChecking(d.checkinId)}
                                style={{ width: 18, height: 18, cursor: 'pointer' }}
                              />
                            )}
                          </td>
                        )}
                        <td
                          style={{
                            ...td,
                            background: rowBg,
                            borderLeft: '3px solid #000',
                            ...depDim,
                            ...(canManage && d ? editableCellStyle : undefined),
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            openEdit(d, 'flightNo', 'Flight No. (ขาออก)')
                          }}
                        >
                          {d ? (
                            <>
                              {d.flightNo}
                              {d.serviceType === 'TOWING OUT' && <div style={smallNote}>(TOWING OUT)</div>}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...depDim }}>{d ? d.stand : '-'}</td>
                        <td
                          style={{ ...td, background: rowBg, ...depDim, ...(canManage && d && d.serviceType !== 'TOWING OUT' ? editableCellStyle : undefined) }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (d && d.serviceType !== 'TOWING OUT') openEdit(d, 'eobt', 'EOBT (ขาออก)')
                          }}
                        >
                          {d ? (d.serviceType === 'TOWING OUT' ? '-' : fmtTime(d.eobt)) : '-'}
                        </td>
                        <td
                          style={{ ...td, background: rowBg, ...depDim, ...(canManage && d ? editableCellStyle : undefined) }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            openEdit(d, 'aircraft', 'A/C Type / A/C Reg. (ขาออก)')
                          }}
                        >
                          {d ? (
                            <>
                              <div>{d.aircraftType}</div>
                              <div>{d.aircraftReg || '-'}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...depDim }}>
                          {d ? (
                            <>
                              <div>{d.initialL1}</div>
                              <div>{fmtTime(d.createdAt)}</div>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ ...td, background: rowBg, ...depDim }}>
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
                          const group = `l${n}` as FieldGroup
                          const incomplete = d ? incompleteCells.has(`${d.checkinId}_l${n}`) : false
                          return (
                            <td
                              key={n}
                              style={{
                                ...td,
                                background: rowBg,
                                ...depDim,
                                ...(canManage && d ? editableCellStyle : undefined),
                                ...(incomplete ? incompleteCellStyle : undefined),
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                if (d) openEdit(d, group, `ผู้ถอย L${n} / เวลาถอย (ขาออก)`)
                              }}
                            >
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
                  <th style={{ ...th, minWidth: 110 }}>
                    <div>PBB Operator</div>
                    <div style={{ fontWeight: 400, fontSize: '0.85em' }}>(Initial)</div>
                  </th>
                  {opInitials.map((initial) => (
                    <th key={initial} style={{ ...th, minWidth: 42 }}>
                      {initial}
                    </th>
                  ))}
                  <th style={{ ...th, background: '#f0f2f5', minWidth: 42 }}>รวม</th>
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
              {!confirming ? (
                <button onClick={handleSubmit} style={{ ...buttonStyle, background: '#c5221f', color: '#fff', width: '100%', marginTop: 16 }}>
                  Submit e-Summary
                </button>
              ) : (
                <div style={overlayStyle}>
                  <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#000', marginBottom: 4 }}>ยืนยัน Submit e-Summary</div>
                    <div style={{ color: '#c5221f', fontWeight: 600, margin: '10px 0', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                      {'โปรดตรวจสอบข้อมูลให้ถูกต้องอีกครั้ง ก่อนกดยืนยัน\nเมื่อ Submit e-Summary แล้ว จะไม่สามารถแก้ไขข้อมูลได้'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button onClick={handleConfirmSubmit} disabled={submitting} style={{ ...buttonStyle, background: '#c5221f', color: '#fff', flex: 1 }}>
                        {submitting ? 'กำลังส่ง...' : 'ยืนยัน'}
                      </button>
                      <button onClick={() => setConfirming(false)} style={{ ...buttonStyle, background: '#999', color: '#fff', flex: 1 }}>
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {submitError && (
                <div style={{ color: '#c5221f', fontSize: 14, marginTop: 8, fontWeight: 600, whiteSpace: 'pre-line', textAlign: 'center' }}>
                  {submitError}
                </div>
              )}
              {!viewingHistoryList && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button
                    onClick={handleOpenHistoryList}
                    style={{ ...buttonStyle, background: '#fff', border: '1px solid #1a73e8', color: '#1a73e8', padding: '8px 16px' }}
                  >
                    ดู e-Summary ย้อนหลัง
                  </button>
                </div>
              )}
            </div>
          )}

          {isSubmitted && (
            <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16, maxWidth: 480, margin: '24px auto 0' }}>
              <button onClick={handleCloseView} style={{ ...buttonStyle, background: '#999', color: '#fff', width: '100%' }}>
                ปิด
              </button>
            </div>
          )}
        </div>
      )}

      {editTarget && (
        <EditCellModal
          target={editTarget}
          saving={savingEdit}
          error={editError}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}

// =====================================================================
// ป๊อบอัพแก้ไขข้อมูลเชคอิน (ดับเบิลคลิกจากตาราง e-Summary - Apron/Supervisor เท่านั้น)
// =====================================================================
function EditCellModal({
  target,
  saving,
  error,
  onClose,
  onSave,
}: {
  target: EditTarget
  saving: boolean
  error: string
  onClose: () => void
  onSave: (values: Record<string, string>) => void
}) {
  const [flightNo, setFlightNo] = useState(target.current.flightNo || '')
  const [time, setTime] = useState(target.current.time || '')
  const [aircraftType, setAircraftType] = useState(target.current.aircraftType || '')
  const [aircraftReg, setAircraftReg] = useState(target.current.aircraftReg || '')
  const [initial, setInitial] = useState(target.current.initial || '')

  function handleSave() {
    if (target.group === 'flightNo') onSave({ flightNo: flightNo.trim().toUpperCase() })
    else if (target.group === 'eibt' || target.group === 'eobt') onSave({ time })
    else if (target.group === 'aircraft') onSave({ aircraftType: aircraftType.trim(), aircraftReg: aircraftReg.trim().toUpperCase() })
    else onSave({ initial: initial.trim().toUpperCase(), time })
  }

  const isL = target.group === 'l1' || target.group === 'l2' || target.group === 'l3'

  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        <button onClick={onClose} style={closeBtnStyle}>
          ✕
        </button>
        <h3 style={{ marginTop: 0, marginBottom: 4, color: '#000' }}>แก้ไขข้อมูล</h3>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
          Flight No. {target.flightNo} — {target.title}
        </div>

        {target.group === 'flightNo' && (
          <>
            <label style={labelStyle}>Flight No. เดิม: {target.current.flightNo}</label>
            <input
              type="text"
              value={flightNo}
              onChange={(e) => setFlightNo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              style={modalInputStyle}
            />
          </>
        )}

        {(target.group === 'eibt' || target.group === 'eobt') && (
          <>
            <label style={labelStyle}>เวลาเดิม: {target.current.time || '-'}</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={modalInputStyle} />
          </>
        )}

        {target.group === 'aircraft' && (
          <>
            <label style={labelStyle}>A/C Type เดิม: {target.current.aircraftType || '-'}</label>
            <input type="text" value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} style={modalInputStyle} />
            <label style={labelStyle}>A/C Reg. เดิม: {target.current.aircraftReg || '-'}</label>
            <input
              type="text"
              value={aircraftReg}
              onChange={(e) => setAircraftReg(e.target.value.toUpperCase().replace(/\s/g, ''))}
              style={modalInputStyle}
            />
          </>
        )}

        {isL && (
          <>
            <label style={labelStyle}>Initial เดิม: {target.current.initial || '-'}</label>
            <input
              type="text"
              value={initial}
              onChange={(e) => setInitial(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              style={modalInputStyle}
            />
            <label style={labelStyle}>เวลาเดิม: {target.current.time || '-'}</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={modalInputStyle} />
          </>
        )}

        {error && <div style={{ color: '#c5221f', fontSize: 14, marginBottom: 8 }}>{error}</div>}

        <button onClick={handleSave} disabled={saving} style={{ ...buttonStyle, background: '#1a73e8', color: '#fff', width: '100%', marginTop: 4 }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}

const sectionLabelStyle = { display: 'block', fontWeight: 700, fontSize: 20, margin: '0 0 8px', color: '#000' }
const labelStyle = { display: 'block', fontWeight: 700, fontSize: 14, margin: '14px 0 6px', color: '#000', textAlign: 'left' as const }
const inlineFieldStyle = { padding: '4px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, fontWeight: 400, color: '#000', background: '#fff' }
const buttonStyle = { padding: 12, border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const reportTableStyle = { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11, minWidth: 700 }
const th = { padding: '6px 6px', textAlign: 'center' as const, color: '#000', border: '1px solid #ddd', background: '#f0f2f5', wordBreak: 'break-word' as const }
const td = { padding: '6px 6px', textAlign: 'center' as const, color: '#000', border: '1px solid #eee' }
// หัวตารางคอลัมน์ข้อมูล (ไม่รวม No./Choose Flt.) ให้ความกว้างเท่าๆ กันทุกช่อง
const dataTh = { ...th, width: 92 }
const smallNote = { fontSize: '0.85em', color: '#666' }
const stickyCol = { position: 'sticky' as const, left: 0, zIndex: 2, background: '#f0f2f5' }
const stickyRow = { position: 'sticky' as const, top: 0, zIndex: 1 }
// ไฮไลท์ช่องที่ "ข้อมูลไม่ครบ" ตอนพยายาม Submit (สีแดงอ่อน เฉพาะช่อง ไม่ใช่ทั้งแถว)
const incompleteCellStyle = { background: '#fde0e0' }
// ช่องที่ Role Apron/Supervisor ดับเบิลคลิกเพื่อแก้ไขข้อมูลได้
const editableCellStyle = { cursor: 'pointer' as const }
const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 200,
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
const modalInputStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #ccc',
  borderRadius: 8,
  fontSize: 15,
  boxSizing: 'border-box' as const,
  background: '#fff',
  color: '#000',
  marginBottom: 10,
}
const closeBtnStyle = {
  position: 'absolute' as const,
  top: 14,
  right: 16,
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  color: '#666',
}

export default EsummaryPage