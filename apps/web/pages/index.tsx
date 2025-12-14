import type { NextPage } from 'next'

import type { NextPage } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'

const Home: NextPage = () => {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [skidCount, setSkidCount] = useState(1)

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Redirect to search results page or display results on the same page
    router.push(`/search?location=${location}&skidCount=${skidCount}`)
  }

  return (
    <div>
      <h1>Welcome to the Warehouse Network</h1>
      <form onSubmit={handleSearch}>
        <div>
          <label htmlFor="location">Location</label>
          <input
            type="text"
            id="location"
            name="location"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="City, State, or Zip"
          />
        </div>
        <div>
          <label htmlFor="skidCount">Estimated Skid Count</label>
          <input
            type="number"
            id="skidCount"
            name="skidCount"
            value={skidCount}
            onChange={e => setSkidCount(parseInt(e.target.value, 10))}
            min="1"
          />
        </div>
        <button type="submit">Search Warehouses</button>
      </form>
    </div>
  )
}

export default Home
