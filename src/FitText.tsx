import { useEffect, useRef, useState } from 'react'

// แสดงข้อความบรรทัดเดียวเสมอ ไม่ตัด ไม่ขึ้นบรรทัดใหม่ — ถ้ายาวเกินพื้นที่
// จะย่อขนาดตัวเองอัตโนมัติ (เหมือนโหมด "shrink to fit" ใน Excel/Google Sheets)
function FitText({ text }: { text: string | null | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function measure() {
      const container = containerRef.current
      const span = textRef.current
      if (!container || !span) return
      // รีเซ็ต scale ก่อนวัด ไม่งั้น scrollWidth จะเพี้ยนจาก transform เดิม
      span.style.transform = 'scale(1)'
      const containerWidth = container.clientWidth
      const textWidth = span.scrollWidth
      if (textWidth <= 0 || containerWidth <= 0) return
      setScale(Math.min(1, containerWidth / textWidth))
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text])

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
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