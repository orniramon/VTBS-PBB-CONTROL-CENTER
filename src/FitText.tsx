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
        textOverflow: needsTruncate ? 'ellipsis' : 'clip',
        cursor: needsTruncate ? 'pointer' : 'default',
        textDecoration: needsTruncate ? 'underline dotted' : 'none',
      }}
    >
      <span
        ref={textRef}
        style={{ display: 'inline-block', transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        {text}
      </span>
    </div>
  )
}

export default FitText