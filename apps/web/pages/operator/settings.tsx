import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import type { Operator } from '@prisma/client'
import prisma from '../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]'

interface OperatorSettingsProps {
  operator: Operator
}

const OperatorSettings: NextPage<OperatorSettingsProps> = ({ operator }) => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState(operator)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prevState => ({
      ...prevState,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/operator/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        alert('Profile updated successfully')
      } else {
        const errorData = await response.json()
        console.error('Failed to update profile', errorData)
        alert('Failed to update profile')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while updating the profile.')
    }
  }

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Operator Settings</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="legalName">Legal Business Name</label>
          <input
            type="text"
            id="legalName"
            name="legalName"
            value={formData.legalName}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="registrationDetails">Company Registration Details</label>
          <input
            type="text"
            id="registrationDetails"
            name="registrationDetails"
            value={formData.registrationDetails}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="primaryContact">Primary Contact</label>
          <input
            type="text"
            id="primaryContact"
            name="primaryContact"
            value={formData.primaryContact}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="operatingRegions">Operating Regions</label>
          <input
            type="text"
            id="operatingRegions"
            name="operatingRegions"
            value={formData.operatingRegions}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="warehouseCount">Warehouse Count</label>
          <input
            type="number"
            id="warehouseCount"
            name="warehouseCount"
            value={formData.warehouseCount}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="goodsCategories">Goods Categories Supported</label>
          <input
            type="text"
            id="goodsCategories"
            name="goodsCategories"
            value={formData.goodsCategories}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Save Changes</button>
      </form>    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
    return {
      redirect: {
        destination: '/unauthorized',
        permanent: false,
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email ?? '' },
    include: { operatorUser: true },
  })

  if (!user?.operatorUser) {
    return {
      notFound: true,
    }
  }

  const operator = await prisma.operator.findUnique({
    where: { id: user.operatorUser.operatorId },
  })

  return {
    props: {
      operator: JSON.parse(JSON.stringify(operator)),
    },
  }
}

export default OperatorSettings
