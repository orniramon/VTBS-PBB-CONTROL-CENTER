import { useEffect, useRef, useState } from 'react'

export type AutocompleteOption = { code: string; label?: string }

type Props = {
  value: string
  onChange: (val: string) => void
  options: AutocompleteOption[]
  placeholder?: string
  displayName?: string // ชื่อเต็มของ initial ปัจจุบัน (ถ้ามี) โชว์เป็นแถบเทาข้างๆ
}

function AutocompleteInput({ value, onChange, options, placeholder, displayName }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter((o) => o.code.toUpperCase().includes(value.toUpperCase()))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          border: '1px solid #ccc',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fff',
          colorScheme: 'light',
        }}
      >
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value.toUpperCase())
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: 12,
            fontSize: 16,
            background: '#fff',
            color: '#000',
            minWidth: 0,
          }}
        />
        {displayName && (
          <div
            style={{
              background: '#f0f0f0',
              color: '#444',
              fontSize: 13,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </div>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 8,
            maxHeight: 220,
            overflowY: 'auto',
            zIndex: 30,
            boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
            marginTop: 4,
          }}
        >
          {filtered.map((o) => (
            <div
              key={o.code}
              onMouseDown={() => {
                onChange(o.code)
                setOpen(false)
              }}
              style={{
                padding: '10px 12px',
                fontSize: 15,
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                color: '#000',
                background: '#fff',
              }}
            >
              {o.code}
              {o.label ? ` — ${o.label}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AutocompleteInput