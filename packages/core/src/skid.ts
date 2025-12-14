export function generateSkidCode(receivingOrderReference: string, sequence: number): string {
  return `${receivingOrderReference}-${String(sequence).padStart(4, '0')}`
}
