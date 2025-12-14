import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import type { Skid, DisputeType } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'

interface NewDisputeProps {
  skids: Skid[]
}

const NewDispute: NextPage<NewDisputeProps> = ({ skids }) => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState({
    type: 'DAMAGED_GOODS' as DisputeType,
    description: '',
    skidIds: [] as string[],
    evidence: '', // For now, a simple text input for URLs or description of evidence
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'CUSTOMER_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSkidSelection = (skidId: string) => {
    setFormData(prevState => {
      const skidIds = prevState.skidIds.includes(skidId)
        ? prevState.skidIds.filter(id => id !== skidId)
        : [...prevState.skidIds, skidId]
      return { ...prevState, skidIds }
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/app/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        router.push('/app/disputes')
      } else {
        const errorData = await response.json()
        console.error('Failed to submit dispute', errorData)
        alert('Failed to submit dispute')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while submitting the dispute.')
    }
  }

  if (status === 'loading' || !session) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Submit New Dispute</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="type">Dispute Type</label>
          <select name="type" value={formData.type} onChange={handleChange}>
            <option value="DAMAGED_GOODS">Damaged Goods</option>
            <option value="MISSING_GOODS">Missing Goods</option>
            <option value="INCORRECT_CHARGES">Incorrect Charges</option>
            <option value="SLA_BREACHES">SLA Breaches</option>
            <option value="MISDECLARED_GOODS">Misdeclared Goods</option>
          </select>
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
          />
        </div>
        <div>
          <h3>Affected Skids</h3>
          {skids.map(skid => (
            <div key={skid.id}>
              <input
                type="checkbox"
                id={skid.id}
                checked={formData.skidIds.includes(skid.id)}
                onChange={() => handleSkidSelection(skid.id)}
              />
              <label htmlFor={skid.id}>{skid.skidCode}</label>
            </div>
          ))}
        </div>
        <div>
          <label htmlFor="evidence">Evidence (URLs, description)</label>
          <textarea
            id="evidence"
            name="evidence"
            value={formData.evidence}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Submit Dispute</button>
      </form>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }
  
  if (!session.user.customerId) {
    return { props: { skids: [] } }
  }

  const skids = await prisma.skid.findMany({
    where: { customerId: session.user.customerId },
    select: { id: true, skidCode: true },
  })

  return {
    props: {
      skids: JSON.parse(JSON.stringify(skids)),
    },
  }
}

export default NewDispute
