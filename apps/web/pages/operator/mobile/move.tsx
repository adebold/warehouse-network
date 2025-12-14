import type { NextPage } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { QrScanner } from '@yudiel/react-qr-scanner'

type MoveState = 'SCAN_SKID' | 'SCAN_LOCATION' | 'CONFIRM'

const Move: NextPage = () => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [moveState, setMoveState] = useState<MoveState>('SCAN_SKID')
  const [scannedSkid, setScannedSkid] = useState('')
  const [scannedLocation, setScannedLocation] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
  }, [session, status, router])

  const handleScan = (result: string) => {
    if (moveState === 'SCAN_SKID') {
      setScannedSkid(result)
      setMoveState('SCAN_LOCATION')
    } else if (moveState === 'SCAN_LOCATION') {
      setScannedLocation(result)
      setMoveState('CONFIRM')
    }
  }

  // Expose handleScan to window for Playwright testing
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      (window as any).handleScan = handleScan;
    }
  }, [handleScan]);


  const handleConfirm = async () => {
    try {
      const response = await fetch('/api/operator/move-skid', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skidCode: scannedSkid,
          locationName: scannedLocation,
        }),
      })

      if (response.ok) {
        alert('Skid moved successfully')
        setMoveState('SCAN_SKID')
        setScannedSkid('')
        setScannedLocation('')
      } else {
        const errorData = await response.json()
        console.error('Failed to move skid', errorData)
        alert('Failed to move skid')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while moving the skid.')
    }
  }

  if (status === 'loading' || !session) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Move Skid</h1>
      {moveState === 'SCAN_SKID' && <p>Scan a Skid QR Code</p>}
      {moveState === 'SCAN_LOCATION' && <p>Scan a Location QR Code</p>}
      
      <QrScanner
        onDecode={handleScan}
        onError={(error) => console.log(error?.message)}
      />

      {moveState === 'CONFIRM' && (
        <div>
          <h2>Confirm Move</h2>
          <p>Skid: {scannedSkid}</p>
          <p>Location: {scannedLocation}</p>
          <button onClick={handleConfirm}>Confirm</button>
          <button onClick={() => setMoveState('SCAN_SKID')}>Cancel</button>
        </div>
      )}
    </div>
  )
}

export default Move
