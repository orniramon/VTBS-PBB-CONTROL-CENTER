// สีพื้นหลังพาสเทลของแต่ละ Service Type — ใช้ร่วมกันทั้งหน้า PBB CHECK (popup สำเร็จ)
// และหน้า Check-in Record ที่จะทำต่อไป เพื่อให้สีตรงกันทั้งระบบ
export const SERVICE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
    ARR: { bg: '#e6f4ea', text: '#137333' },
    DEP: { bg: '#fef7e0', text: '#b06000' },
    'TOWING IN': { bg: '#e8eaf6', text: '#3949ab' },
    'TOWING OUT': { bg: '#fce4ec', text: '#ad1457' },
  }
  
  export function getServiceTypeColor(type: string) {
    return SERVICE_TYPE_COLORS[type] || { bg: '#eee', text: '#333' }
  }