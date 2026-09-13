import { useEffect, useRef, useState } from 'react'

type Props = {
  text: string | null | undefined
  minScale?: number // ย่อได้ต่ำสุดแค่ไหน (0-1) ต่ำกว่านี้จะตัดข้อความแทน ไม่ย่อต่อ
}

// แสดงข้อความบรรทัดเดียวเสมอ ไม่ขึ้นบรรทัดใหม่ — ถ้ายาวเกินพื้นที่
// จะย่อขนาดตัวเองอัตโนมัติ (เหมือนโหมด "shrink to fit" ใน Excel/Google Sheets)
// ถ้ายาวเกินกว่าจะย่อไหว (ต่ำกว่า minScale) จะตัดด้วย "..." แทน และแตะเพื่อดูข้อความเต็มได้
function FitText({ text, minScale = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(1)
  const [needsTruncate, setNeedsTruncate] = useState(false)

  useEffect(() => {
    function measure() {
      const container = containerRef.current
      const span = textRef.current
      if (!container || !span) return
      span.style.transform = 'scale(1)'
      const containerWidth = container.clientWidth
      const textWidth = span.scrollWidth
      if (textWidth <= 0 || containerWidth <= 0) return
      const rawScale = containerWidth / textWidth
      if (rawScale >= minScale) {
        setScale(Math.min(1, rawScale))
        setNeedsTruncate(false)
      } else {
        setScale(minScale)
        setNeedsTruncate(true)
      }
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text, minScale])

  return (
    <div
      ref={containerRef}
      onClick={needsTruncate ? (e) => { e.stopPropagation(); alert(text || '') } : undefined}
      style={{
        width: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        cursor: needsTruncate ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {needsTruncate ? (
        // โหมดตัดข้อความ: ใช้ text-overflow ล้วนๆ ห้ามผสม transform เด็ดขาด
        // (ผสมกันแล้วเบราว์เซอร์คำนวณจุดตัดผิด ไม่ขึ้น "..." ให้)
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'underline dotted' }}>
          {text}
        </span>
      ) : (
        <span
          ref={textRef}
          style={{ display: 'inline-block', transform: `scale(${scale})`, transformOrigin: 'center' }}
        >
          {text}
        </span>
      )}
      {/* ช่องวัดขนาดที่ซ่อนไว้ (ใช้เทียบว่าข้อความยาวแค่ไหนตอนขนาดเต็ม 100%) */}
      {needsTruncate && (
        <span ref={textRef} style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {text}
        </span>
      )}
    </div>
  )
}

export default FitText