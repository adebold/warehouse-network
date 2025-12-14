import React from 'react'
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { Skid } from '@prisma/client'

interface SkidLabelProps {
  skids: Skid[]
  warehouseName: string
  customerName?: string
  date?: string
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '4in',
    height: '6in',
  },
  skidCode: {
    fontSize: 36,
    marginBottom: 20,
  },
  qrCode: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  details: {
    fontSize: 12,
  },
})

const SkidLabel: React.FC<SkidLabelProps> = ({ skids, warehouseName, customerName, date }) => {
  const [qrCodes, setQrCodes] = React.useState<string[]>([])

  React.useEffect(() => {
    const generateQrCodes = async () => {
      try {
        const urls = await Promise.all(skids.map(skid => QRCode.toDataURL(skid.skidCode)))
        setQrCodes(urls)
      } catch (err) {
        console.error(err)
      }
    }
    generateQrCodes()
  }, [skids])

  return (
    <Document>
      {skids.map((skid, index) => (
        <Page key={skid.id} size={[4 * 72, 6 * 72]} style={styles.page}>
          <Text style={styles.skidCode}>{skid.skidCode}</Text>
          {qrCodes[index] && <Image style={styles.qrCode} src={qrCodes[index]} />}
          <Text style={styles.details}>Warehouse: {warehouseName}</Text>
          {customerName && <Text style={styles.details}>Customer: {customerName}</Text>}
          {date && <Text style={styles.details}>Date: {date}</Text>}
        </Page>
      ))}
    </Document>
  )
}

export default SkidLabel

