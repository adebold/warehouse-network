import { useState } from 'react';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');

  const handleSearch = e => {
    e.preventDefault();
    console.log('Searching for:', { searchQuery, location });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <span className="ml-2 text-xl font-bold">Warehouse Network</span>
            </div>
            <nav className="hidden items-center space-x-6 md:flex">
              <a href="/search" className="text-sm font-medium hover:text-blue-600">
                Browse Listings
              </a>
              <a href="/become-a-partner" className="text-sm font-medium hover:text-blue-600">
                List Property
              </a>
              <a
                href="/login"
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Sign In
              </a>
              <a
                href="/become-a-partner"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Get Started
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="container mx-auto px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="mb-6 text-4xl font-bold md:text-5xl lg:text-6xl">
              Find Your Perfect Warehouse Space
            </h1>
            <p className="mb-12 text-xl text-blue-100 md:text-2xl">
              Connect with trusted warehouse providers across the nation
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="mx-auto max-w-3xl">
              <div className="flex flex-col gap-4 md:flex-row">
                <input
                  type="text"
                  placeholder="What are you looking for?"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 rounded-lg px-6 py-4 text-lg text-gray-900"
                />
                <input
                  type="text"
                  placeholder="Location"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="flex-1 rounded-lg px-6 py-4 text-lg text-gray-900"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-yellow-500 px-8 py-4 font-semibold text-gray-900 transition duration-200 hover:bg-yellow-400"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold">Why Choose Warehouse Network?</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">Verified Providers</h3>
              <p className="text-gray-600">
                All warehouse providers are thoroughly vetted for quality and reliability
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">Transparent Pricing</h3>
              <p className="text-gray-600">No hidden fees. Compare prices and features easily</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">Fast & Easy</h3>
              <p className="text-gray-600">Find and book warehouse space in minutes, not days</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-16 text-white">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold">Ready to Find Your Warehouse?</h2>
          <p className="mb-8 text-xl">Join thousands of businesses that trust Warehouse Network</p>
          <a
            href="/search"
            className="inline-block rounded-lg bg-white px-8 py-4 font-semibold text-blue-600 transition duration-200 hover:bg-gray-100"
          >
            Start Searching Now
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 py-8 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p>&copy; 2025 Warehouse Network. All rights reserved.</p>
            <p className="mt-2 text-gray-400">AI Industries Project</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
