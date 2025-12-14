import type { NextPage } from 'next'
import { useState } from 'react'

const BecomeAPartner: NextPage = () => {
  const [formData, setFormData] = useState({
    legalName: '',
    registrationDetails: '',
    primaryContact: '',
    operatingRegions: '',
    warehouseCount: 0,
    goodsCategories: '',
    insurance: false,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/operator-applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        // Handle success
        console.log('Application submitted successfully')
        alert('Application submitted successfully')
      } else {
        // Handle error
        console.error('Failed to submit application')
        alert('Failed to submit application')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while submitting the application.')
    }
  }

  return (
    <div>
      <h1>Become a Warehouse Partner</h1>
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
        <div>
          <input
            type="checkbox"
            id="insurance"
            name="insurance"
            checked={formData.insurance}
            onChange={handleChange}
          />
          <label htmlFor="insurance">I acknowledge that we carry appropriate insurance.</label>
        </div>
        <button type="submit">Submit Application</button>
      </form>
    </div>
  )
}

export default BecomeAPartner
