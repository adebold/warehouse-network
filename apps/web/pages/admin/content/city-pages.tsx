import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import type { CityPage } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../api/auth/[...nextauth]'

interface CityPagesProps {
  cityPages: CityPage[]
}

const CityPages: NextPage<CityPagesProps> = ({ cityPages }) => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState({
    city: '',
    region: '',
    h1: '',
    introContent: '',
    isActive: false,
  })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/admin/content/city-pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        router.replace(router.asPath)
      } else {
        const errorData = await response.json()
        console.error('Failed to create city page', errorData)
        alert('Failed to create city page')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while creating the city page.')
    }
  }

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Manage City Pages</h1>
      
      <h2>Existing City Pages</h2>
      <table>
        <thead>
          <tr>
            <th>City</th>
            <th>Region</th>
            <th>H1</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cityPages.map(page => (
            <tr key={page.id}>
              <td>{page.city}</td>
              <td>{page.region}</td>
              <td>{page.h1}</td>
              <td>{page.isActive ? 'Yes' : 'No'}</td>
              <td>
                <button>Edit</button>
                <button>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Create New City Page</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="city">City</label>
          <input
            type="text"
            id="city"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="region">Region</label>
          <input
            type="text"
            id="region"
            name="region"
            value={formData.region}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="h1">H1 Title</label>
          <input
            type="text"
            id="h1"
            name="h1"
            value={formData.h1}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="introContent">Intro Content</label>
          <textarea
            id="introContent"
            name="introContent"
            value={formData.introContent}
            onChange={handleChange}
          />
        </div>
        <div>
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            checked={formData.isActive}
            onChange={handleChange}
          />
          <label htmlFor="isActive">Active</label>
        </div>
        <button type="submit">Create City Page</button>
      </form>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  const cityPages = await prisma.cityPage.findMany()

  return {
    props: {
      cityPages: JSON.parse(JSON.stringify(cityPages)),
    },
  }
}

export default CityPages
