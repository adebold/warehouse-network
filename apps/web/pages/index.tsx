import type { NextPage } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'

const Home: NextPage = () => {
  const router = useRouter()
  const [location, setLocation] = useState('')
  const [skidCount, setSkidCount] = useState(1)

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    router.push(`/search?location=${location}&skidCount=${skidCount}`)
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section with Unsplash Background */}
      <div className="relative h-screen">
        <Image
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1920&h=1080&fit=crop"
          alt="Modern warehouse interior"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black bg-opacity-50" />
        
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-white px-4">
          <h1 className="text-5xl md:text-7xl font-bold text-center mb-6">
            Warehouse Network
          </h1>
          <p className="text-xl md:text-2xl text-center mb-12 max-w-2xl">
            Find trusted warehouse space for your business needs. Connect with verified operators across the country.
          </p>
          
          {/* Search Form */}
          <form onSubmit={handleSearch} className="w-full max-w-2xl bg-white rounded-lg shadow-2xl p-8">
            <div className="mb-6">
              <label htmlFor="location" className="block text-gray-700 text-sm font-semibold mb-2">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City, State, or Zip"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                required
              />
            </div>
            
            <div className="mb-6">
              <label htmlFor="skidCount" className="block text-gray-700 text-sm font-semibold mb-2">
                Estimated Skid Count
              </label>
              <input
                type="number"
                id="skidCount"
                name="skidCount"
                value={skidCount}
                onChange={e => setSkidCount(parseInt(e.target.value, 10))}
                min="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-200"
            >
              Search Warehouses
            </button>
          </form>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">
            Why Choose Warehouse Network?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative h-64 rounded-lg overflow-hidden group">
              <Image
                src="https://images.unsplash.com/photo-1553413077-190dd305871c?w=400&h=300&fit=crop"
                alt="Warehouse operations"
                fill
                className="object-cover group-hover:scale-110 transition duration-300"
              />
              <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                <div className="text-white text-center p-6">
                  <h3 className="text-2xl font-bold mb-2">Verified Operators</h3>
                  <p>All warehouse operators are vetted and verified for quality service</p>
                </div>
              </div>
            </div>

            <div className="relative h-64 rounded-lg overflow-hidden group">
              <Image
                src="https://images.unsplash.com/photo-1565891741441-64926e441838?w=400&h=300&fit=crop"
                alt="Warehouse technology"
                fill
                className="object-cover group-hover:scale-110 transition duration-300"
              />
              <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                <div className="text-white text-center p-6">
                  <h3 className="text-2xl font-bold mb-2">Real-time Tracking</h3>
                  <p>Track your inventory with our advanced management system</p>
                </div>
              </div>
            </div>

            <div className="relative h-64 rounded-lg overflow-hidden group">
              <Image
                src="https://images.unsplash.com/photo-1494412685616-a5d310fbb07b?w=400&h=300&fit=crop"
                alt="Secure warehouse"
                fill
                className="object-cover group-hover:scale-110 transition duration-300"
              />
              <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                <div className="text-white text-center p-6">
                  <h3 className="text-2xl font-bold mb-2">Secure Payments</h3>
                  <p>Powered by Stripe for secure and reliable transactions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 text-white">
            Are you a warehouse operator?
          </h2>
          <p className="text-xl mb-8 text-blue-100">
            Join our network and connect with businesses looking for storage solutions
          </p>
          <button
            onClick={() => router.push('/become-a-partner')}
            className="bg-white text-blue-600 font-bold py-3 px-8 rounded-lg hover:bg-gray-100 transition duration-200"
          >
            Become a Partner
          </button>
        </div>
      </section>
    </div>
  )
}

export default Home