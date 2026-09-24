import type { ReactNode } from 'react'

export const TABS = [
  'VTBS PBB CHECK',
  'PBB Check Record',
  'PBB Photo',
  'PBB Operator',
  'e-Summary',
  'Check-in',
  'Check-in Record',
] as const
export type TabName = (typeof TABS)[number]

type Props = {
  initial: string
  role: string
  onLogout: () => void
  activeTab: TabName
  onTabChange: (tab: TabName) => void
  children: ReactNode
}

function MainLayout({ initial, role, onLogout, activeTab, onTabChange, children }: Props) {
  return (
    <div style={{ fontFamily: "'TH Sarabun PSK', 'Sarabun', sans-serif", background: '#f5f6f8', minHeight: '100vh', colorScheme: 'light' }}>
      {/* ---------- แถบบนสุด ---------- */}
      <div
        style={{
          background: '#1a73e8',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          fontSize: 14,
        }}
      >
        <span style={{ fontWeight: 600 }}>VTBS AEROBRIDGE CONTROL CENTER</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 20, fontSize: 13 }}>
            {role} {initial}
          </span>
          <a href="#" onClick={onLogout} style={{ color: '#fff', textDecoration: 'underline' }}>
            Logout
          </a>
        </span>
      </div>

      {/* ---------- แท็บเมนู ---------- */}
      <div style={{ display: 'flex', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        {TABS.map((tab) => (
          <div
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              flex: '1 0 auto',
              minWidth: 100,
              textAlign: 'center',
              padding: '12px 8px',
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === tab ? '#1a73e8' : '#666',
              borderBottom: activeTab === tab ? '3px solid #1a73e8' : '3px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {children}
    </div>
  )
}

export default MainLayout