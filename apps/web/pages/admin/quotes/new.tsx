import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import type { RFQ, Warehouse, ChargeCategory } from '@prisma/client'
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'

interface NewQuoteProps {
  rfq: RFQ
  warehouses: Warehouse[]
  chargeCategories: ChargeCategory[]
}

const NewQuote: NextPage<NewQuoteProps> = ({ rfq, warehouses, chargeCategories }) => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState({
    warehouseId: '',
    items: [] as { chargeCategoryId: string; unitPrice: number; quantity: number; description: string }[],
    currency: 'USD',
    assumptions: '',
    guaranteedCharges: false,
    depositAmount: 0,
    accrualStartRule: 'ON_RECEIPT',
    expiryDate: '',
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prevState => {
      const newItems = [...prevState.items]
      newItems[index] = { ...newItems[index], [field]: value }
      return { ...prevState, items: newItems }
    })
  }

  const handleAddItem = () => {
    setFormData(prevState => ({
      ...prevState,
      items: [
        ...prevState.items,
        { chargeCategoryId: '', unitPrice: 0, quantity: 1, description: '' },
      ],
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, rfqId: rfq.id }),
      })

      if (response.ok) {
        const newQuote = await response.json()
        router.push(`/admin/quotes/${newQuote.id}`)
      } else {
        const errorData = await response.json()
        console.error('Failed to create quote', errorData)
        alert('Failed to create quote')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while creating the quote.')
    }
  }

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Create Quote for RFQ: {rfq.id}</h1>
      <p>Customer: {rfq.customerId}</p>
      <p>Estimated Skids: {rfq.estimatedSkidCount}</p>
      {/* More RFQ details */}

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="warehouseId">Select Warehouse</label>
          <select name="warehouseId" value={formData.warehouseId} onChange={handleChange}>
            <option value="">Select a warehouse</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <input
            type="text"
            id="currency"
            name="currency"
            value={formData.currency}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="assumptions">Assumptions</label>
          <textarea
            id="assumptions"
            name="assumptions"
            value={formData.assumptions}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="guaranteedCharges">Guaranteed Charges</label>
          <input
            type="checkbox"
            id="guaranteedCharges"
            name="guaranteedCharges"
            checked={formData.guaranteedCharges}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="depositAmount">Deposit Amount</label>
          <input
            type="number"
            id="depositAmount"
            name="depositAmount"
            value={formData.depositAmount}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="accrualStartRule">Accrual Start Rule</label>
          <select name="accrualStartRule" value={formData.accrualStartRule} onChange={handleChange}>
            <option value="ON_RECEIPT">On Receipt</option>
            <option value="FIXED_DATE">Fixed Date</option>
          </select>
        </div>
        <div>
          <label htmlFor="expiryDate">Expiry Date</label>
          <input
            type="datetime-local"
            id="expiryDate"
            name="expiryDate"
            value={formData.expiryDate}
            onChange={handleChange}
          />
        </div>
      
        <h2>Quote Items</h2>
        {formData.items.map((item, index) => (
          <div key={index}>
            <select
              name="chargeCategoryId"
              value={item.chargeCategoryId}
              onChange={e => handleItemChange(index, 'chargeCategoryId', e.target.value)}
            >
              <option value="">Select charge category</option>
              {chargeCategories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Unit Price"
              value={item.unitPrice}
              onChange={e => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))}
            />
            <input
              type="number"
              placeholder="Quantity"
              value={item.quantity}
              onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value, 10))}
            />
            <input
              type="text"
              placeholder="Description"
              value={item.description}
              onChange={e => handleItemChange(index, 'description', e.target.value)}
            />
          </div>
        ))}
        <button type="button" onClick={handleAddItem}>Add Item</button>
        <button type="submit">Create Quote</button>
      </form>    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)
  const { rfqId } = context.query

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  const rfq = await prisma.rFQ.findUnique({
    where: { id: String(rfqId) },
  })

  if (!rfq) {
    return { notFound: true }
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { status: 'READY_FOR_MARKETPLACE' },
  })

  const chargeCategories = await prisma.chargeCategory.findMany()

  return {
    props: {
      rfq: JSON.parse(JSON.stringify(rfq)),
      warehouses: JSON.parse(JSON.stringify(warehouses)),
      chargeCategories: JSON.parse(JSON.stringify(chargeCategories)),
    },
  }
}

export default NewQuote
