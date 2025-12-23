import type { Warehouse, Customer } from '@warehouse/types';
import type { NextPage } from 'next';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  MapPin,
  Package,
  Shield,
  Search,
  TrendingUp,
  Users,
  Zap,
  Star,
  Brain,
  Bot,
  Cpu,
  Workflow,
} from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';

const Home: NextPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const { trackCTA, searchTracking } = useAnalytics();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Track search intent
    searchTracking.query(searchQuery || 'all', 0);
    trackCTA('search_hero', 'homepage')();
    // TODO: Implement search functionality
    console.log('Searching for:', { searchQuery, location });
  };

  return (
    <div className="min-h-screen">
      {/* Modern Navbar */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Building2 className="text-primary h-8 w-8" />
              <span className="ml-2 text-xl font-bold">SkidSpace</span>
            </div>
            <nav className="hidden items-center space-x-6 md:flex">
              <Link
                href="/search"
                className="hover:text-primary text-sm font-medium transition-colors"
              >
                Browse Listings
              </Link>
              <Link
                href="/become-a-partner"
                className="hover:text-primary text-sm font-medium transition-colors"
              >
                List Property
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/become-a-partner">
                <Button size="sm">Get Started</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Hero Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
            alt="Modern warehouse interior"
            className="h-full w-full object-cover opacity-80 dark:opacity-60"
          />
          <div className="from-background/95 to-background/50 absolute inset-0 bg-gradient-to-r" />
          <div className="via-background/50 to-background absolute inset-0 bg-gradient-to-b from-transparent" />
        </div>
        <div className="container relative mx-auto px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Find Your Perfect
              <span className="text-primary"> Warehouse Space</span>
            </h1>
            <p className="text-muted-foreground mt-6 text-lg">
              The AI-powered marketplace for warehouse space. Book by the pallet position,
              managed by autonomous agents. Smart warehousing made simple.
            </p>

            {/* Search Form */}
            <form
              onSubmit={handleSearch}
              className="mx-auto mt-10 flex max-w-2xl flex-col gap-4 sm:flex-row"
            >
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Type of space, size, or features..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-primary w-full rounded-lg border px-4 py-3 focus:outline-none focus:ring-2"
                />
              </div>
              <div className="flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="City or postal code"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:ring-primary w-full rounded-lg border px-4 py-3 focus:outline-none focus:ring-2"
                />
              </div>
              <Button type="submit" size="lg" className="px-8">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </form>

            {/* Quick Stats */}
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-primary text-3xl font-bold">500+</p>
                <p className="text-muted-foreground text-sm">Active Listings</p>
              </div>
              <div className="text-center">
                <p className="text-primary text-3xl font-bold">2M+</p>
                <p className="text-muted-foreground text-sm">Sq Ft Available</p>
              </div>
              <div className="text-center">
                <p className="text-primary text-3xl font-bold">50+</p>
                <p className="text-muted-foreground text-sm">Cities Covered</p>
              </div>
              <div className="text-center">
                <p className="text-primary text-3xl font-bold">98%</p>
                <p className="text-muted-foreground text-sm">Client Satisfaction</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-muted/50 relative overflow-hidden py-24">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5 dark:opacity-10">
          <div className="bg-primary absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl" />
          <div className="bg-primary absolute -bottom-24 -right-24 h-96 w-96 rounded-full blur-3xl" />
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Why Choose Warehouse Network</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              The world's first AI-powered autonomous warehouse platform
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardHeader>
                <Brain className="text-blue-600 mb-4 h-10 w-10" />
                <CardTitle className="text-xl text-blue-900">GOAP AI System</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-blue-700">
                  Goal-Oriented Action Planning with autonomous agents that intelligently manage warehouse operations.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50">
              <CardHeader>
                <Bot className="text-purple-600 mb-4 h-10 w-10" />
                <CardTitle className="text-xl text-purple-900">Autonomous Agents</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-purple-700">
                  AI agents for inventory management, shipping coordination, quality control, and optimization.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
              <CardHeader>
                <Workflow className="text-green-600 mb-4 h-10 w-10" />
                <CardTitle className="text-xl text-green-900">Smart Workflows</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-green-700">
                  Automated planning and execution with A* pathfinding for optimal operational efficiency.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
              <CardHeader>
                <Cpu className="text-orange-600 mb-4 h-10 w-10" />
                <CardTitle className="text-xl text-orange-900">Real-time Intelligence</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-orange-700">
                  Live monitoring, predictive analytics, and autonomous decision-making for warehouse operations.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="from-primary/5 bg-gradient-to-br to-transparent py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Trusted by Leading Businesses</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              See how companies achieve 45%+ efficiency gains with AI-powered warehouse management
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Testimonial 1 */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-8">
                <div className="mb-4 flex items-center">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="fill-warning text-warning h-5 w-5" />
                  ))}
                </div>
                <p className="mb-6 text-lg italic">
                  "The GOAP system revolutionized our operations. Autonomous agents reduced our
                  logistics costs by 45% and optimized our entire supply chain automatically."
                </p>
                <div className="flex items-center">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
                    alt="David Chen"
                    className="mr-4 h-12 w-12 rounded-full"
                  />
                  <div>
                    <p className="font-semibold">David Chen</p>
                    <p className="text-muted-foreground text-sm">VP Operations, TechStart Inc.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 2 */}
            <Card className="relative overflow-hidden md:translate-y-8">
              <CardContent className="pt-8">
                <div className="mb-4 flex items-center">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="fill-warning text-warning h-5 w-5" />
                  ))}
                </div>
                <p className="mb-6 text-lg italic">
                  "The autonomous warehouse agents manage our inventory across 5 locations.
                  AI-driven planning eliminated human errors and increased efficiency by 60%."
                </p>
                <div className="flex items-center">
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
                    alt="Sarah Johnson"
                    className="mr-4 h-12 w-12 rounded-full"
                  />
                  <div>
                    <p className="font-semibold">Sarah Johnson</p>
                    <p className="text-muted-foreground text-sm">CEO, FastShip Commerce</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 3 */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-8">
                <div className="mb-4 flex items-center">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="fill-warning text-warning h-5 w-5" />
                  ))}
                </div>
                <p className="mb-6 text-lg italic">
                  "GOAP's quality control agents ensure perfect pharmaceutical storage compliance.
                  The intelligent monitoring system prevents costly errors before they happen."
                </p>
                <div className="flex items-center">
                  <img
                    src="https://images.unsplash.com/photo-1519345182560-3f2917c472ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
                    alt="Michael Torres"
                    className="mr-4 h-12 w-12 rounded-full"
                  />
                  <div>
                    <p className="font-semibold">Michael Torres</p>
                    <p className="text-muted-foreground text-sm">
                      Supply Chain Director, MedSupply Co.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="mt-20 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="text-center">
              <p className="text-primary text-4xl font-bold">$4.8M</p>
              <p className="text-muted-foreground mt-2 text-sm">Saved through AI optimization annually</p>
            </div>
            <div className="text-center">
              <p className="text-primary text-4xl font-bold">84.8%</p>
              <p className="text-muted-foreground mt-2 text-sm">GOAP system efficiency rate</p>
            </div>
            <div className="text-center">
              <p className="text-primary text-4xl font-bold">8</p>
              <p className="text-muted-foreground mt-2 text-sm">Autonomous agent types</p>
            </div>
            <div className="text-center">
              <p className="text-primary text-4xl font-bold">15+</p>
              <p className="text-muted-foreground mt-2 text-sm">Smart warehouse actions</p>
            </div>
          </div>
        </div>
      </section>

      {/* Property Types */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Find Your Space Type</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              From small units to large distribution centers
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1565891741441-64926e441838?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                  alt="Storage facility"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <Package className="mb-2 h-8 w-8 text-white" />
                </div>
              </div>
              <CardHeader>
                <CardTitle>Storage Facilities</CardTitle>
                <CardDescription>5,000 - 25,000 sq ft</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Perfect for inventory storage, e-commerce fulfillment, and seasonal goods.
                </p>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1553413077-190dd305871c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                  alt="Distribution center"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <Building2 className="mb-2 h-8 w-8 text-white" />
                </div>
              </div>
              <CardHeader>
                <CardTitle>Distribution Centers</CardTitle>
                <CardDescription>25,000 - 100,000 sq ft</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Ideal for regional distribution with multiple loading docks and high ceilings.
                </p>
              </CardContent>
            </Card>

            <Card className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1581087458702-372e94955c9f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                  alt="Manufacturing space"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <Users className="mb-2 h-8 w-8 text-white" />
                </div>
              </div>
              <CardHeader>
                <CardTitle>Manufacturing Spaces</CardTitle>
                <CardDescription>50,000+ sq ft</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Heavy-duty facilities with specialized power, ventilation, and floor loading.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold">Ready for AI-Powered Warehousing?</h2>
          <p className="mb-8 text-xl opacity-90">
            Join the future of warehouse management with autonomous AI agents and intelligent automation.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/search">
              <Button size="lg" variant="secondary">
                Browse Listings
              </Button>
            </Link>
            <Link href="/become-a-partner">
              <Button
                size="lg"
                variant="outline"
                className="text-primary-foreground border-primary-foreground hover:bg-primary-foreground hover:text-primary bg-transparent"
              >
                List Your Property
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center md:mb-0">
              <Building2 className="text-primary h-6 w-6" />
              <span className="ml-2 font-bold">SkidSpace</span>
            </div>
            <nav className="text-muted-foreground flex gap-6 text-sm">
              <Link href="#" className="hover:text-foreground">
                About
              </Link>
              <Link href="#" className="hover:text-foreground">
                Contact
              </Link>
              <Link href="#" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="#" className="hover:text-foreground">
                Privacy
              </Link>
            </nav>
          </div>
          <div className="text-muted-foreground mt-8 text-center text-sm">
            © 2025 SkidSpace. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
