import type { Warehouse, Customer } from '@warehouse/types';
import type { NextPage } from 'next';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
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
  Check,
  ChevronRight,
  DollarSign,
  Clock,
  BarChart3,
  Lock,
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
              <img 
                src="/brand/logo-icon.svg" 
                alt="SkidSpace" 
                className="h-8 w-8" 
              />
              <span className="ml-2 text-xl font-semibold" style={{color: '#0B1220'}}>SkidSpace</span>
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
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900/20">
        <div className="container relative mx-auto px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-4xl text-center">
            {/* Platform Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-4 py-2">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Flexible Warehouse Marketplace
              </span>
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              The Airbnb of
              <span className="text-primary block">Warehouse Space</span>
            </h1>
            <p className="text-muted-foreground mt-6 text-xl leading-relaxed max-w-2xl mx-auto">
              Rent warehouse space by the pallet. List your unused space.
              No long-term contracts. Complete flexibility.
            </p>

            {/* Dual CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/search">
                <Button size="lg" className="w-full sm:w-auto px-8">
                  <Search className="mr-2 h-5 w-5" />
                  I Need Space
                </Button>
              </Link>
              <Link href="/become-a-partner">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  <img 
                    src="/brand/logo-icon.svg" 
                    alt="" 
                    className="mr-2 h-5 w-5" 
                  />
                  I Have Space
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-2 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium">Insured</p>
                <p className="text-xs text-muted-foreground">$1M coverage</p>
              </div>
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium">Instant</p>
                <p className="text-xs text-muted-foreground">Book online</p>
              </div>
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm font-medium">Quick Setup</p>
                <p className="text-xs text-muted-foreground">Get started fast</p>
              </div>
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <Package className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-sm font-medium">Flexible</p>
                <p className="text-xs text-muted-foreground">By the pallet</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Value Propositions */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* For Renters */}
            <div className="relative">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-8 lg:p-10">
                <div className="mb-6">
                  <h2 className="text-3xl font-bold mb-4">Need Warehouse Space?</h2>
                  <p className="text-muted-foreground text-lg">
                    Find the perfect space for your inventory, no long-term commitment required.
                  </p>
                </div>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-blue-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Pay Only for What You Use</p>
                      <p className="text-sm text-muted-foreground">Book by the pallet position, not the whole warehouse</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-blue-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Instant Booking</p>
                      <p className="text-sm text-muted-foreground">Find and reserve space in minutes, not weeks</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-blue-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Vetted Warehouse Partners</p>
                      <p className="text-sm text-muted-foreground">Connect with verified warehouse operators</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-blue-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Complete Flexibility</p>
                      <p className="text-sm text-muted-foreground">Scale up or down as your business needs change</p>
                    </div>
                  </div>
                </div>
                
                <Link href="/search">
                  <Button className="w-full" size="lg">
                    Browse Available Spaces
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* For Warehouse Owners */}
            <div className="relative">
              <div className="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-8 lg:p-10">
                <div className="mb-6">
                  <h2 className="text-3xl font-bold mb-4">Have Unused Space?</h2>
                  <p className="text-muted-foreground text-lg">
                    Turn your empty warehouse space into recurring revenue.
                  </p>
                </div>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-green-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Maximize Revenue</p>
                      <p className="text-sm text-muted-foreground">Monetize every pallet position in your warehouse</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-green-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Zero Management Hassle</p>
                      <p className="text-sm text-muted-foreground">We handle tenant screening and operations</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-green-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Set Your Own Prices</p>
                      <p className="text-sm text-muted-foreground">Dynamic pricing based on demand and seasonality</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-green-600 p-1">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold">Protected & Insured</p>
                      <p className="text-sm text-muted-foreground">$1M liability coverage and verified renters</p>
                    </div>
                  </div>
                </div>
                
                <Link href="/become-a-partner">
                  <Button className="w-full" size="lg" variant="default">
                    List Your Space
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Safety Section */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Built on Trust</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              SkidSpace provides the security and reliability you need for your business
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Fully Insured</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Every booking includes $1M liability coverage. Your inventory is protected from day one.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Verified Spaces</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  All warehouse partners are verified and inspected. Quality standards enforced through regular audits.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Transparent Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  No hidden fees. See exactly what you'll pay before booking. Dynamic pricing for warehouse owners.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Platform Features</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need for flexible warehouse operations
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 max-w-5xl mx-auto">
            {/* Renter Benefits */}
            <div>
              <h3 className="text-xl font-semibold mb-6">For Renters</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                    <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Real-Time Inventory Tracking</p>
                    <p className="text-sm text-muted-foreground">Track your inventory levels and locations online</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                    <Workflow className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Streamlined Operations</p>
                    <p className="text-sm text-muted-foreground">Efficient receiving, putaway, picking, and shipping</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Real-Time Visibility</p>
                    <p className="text-sm text-muted-foreground">Track inventory levels and shipments 24/7</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Owner Benefits */}
            <div>
              <h3 className="text-xl font-semibold mb-6">For Warehouse Owners</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Dynamic Pricing</p>
                    <p className="text-sm text-muted-foreground">Set rates based on demand and seasonality</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                    <Bot className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Hands-Off for You</p>
                    <p className="text-sm text-muted-foreground">Warehouse operators handle daily activities</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2">
                    <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Performance Analytics</p>
                    <p className="text-sm text-muted-foreground">Detailed insights on space utilization and revenue</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-4">How SkidSpace Works</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Get started in minutes, not months
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {/* For Renters */}
            <div>
              <h3 className="text-xl font-semibold mb-6 text-blue-600 dark:text-blue-400">For Renters</h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Search Available Space</p>
                    <p className="text-sm text-muted-foreground">Filter by location, size, and features</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">2</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Book Pallet Positions</p>
                    <p className="text-sm text-muted-foreground">Reserve exact spots, pay only for what you need</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">3</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Ship Your Inventory</p>
                    <p className="text-sm text-muted-foreground">Warehouse partners receive and organize your goods</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">4</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Manage & Monitor</p>
                    <p className="text-sm text-muted-foreground">Track inventory and shipments in real-time</p>
                  </div>
                </div>
              </div>
            </div>

            {/* For Owners */}
            <div>
              <h3 className="text-xl font-semibold mb-6 text-green-600 dark:text-green-400">For Warehouse Owners</h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">1</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">List Your Space</p>
                    <p className="text-sm text-muted-foreground">Add photos, features, and set your prices</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">2</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Accept Bookings</p>
                    <p className="text-sm text-muted-foreground">Approve renters or set auto-accept rules</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">3</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Partners Handle Operations</p>
                    <p className="text-sm text-muted-foreground">Warehouse operators manage daily activities</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">4</span>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Get Paid Monthly</p>
                    <p className="text-sm text-muted-foreground">Direct deposits with detailed reporting</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/90 text-white py-20">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,transparent)]" />
        <div className="container relative mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Ready to Transform Your Warehouse Operations?</h2>
          <p className="mb-8 text-xl opacity-90 max-w-2xl mx-auto">
            Join SkidSpace today and experience the simplicity of flexible warehouse management.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/search">
              <Button size="lg" variant="secondary" className="min-w-[200px]">
                <Search className="mr-2 h-5 w-5" />
                Find Space Now
              </Button>
            </Link>
            <Link href="/become-a-partner">
              <Button
                size="lg"
                variant="outline"
                className="min-w-[200px] text-white border-white hover:bg-white hover:text-primary bg-transparent"
              >
                <img 
                  src="/brand/logo-icon.svg" 
                  alt="" 
                  className="mr-2 h-5 w-5" 
                />
                List Your Warehouse
              </Button>
            </Link>
          </div>
          
          {/* Quick Stats */}
          <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div>
              <p className="text-3xl font-bold">24/7</p>
              <p className="text-sm opacity-90">Support</p>
            </div>
            <div>
              <p className="text-3xl font-bold">$1M</p>
              <p className="text-sm opacity-90">Insurance</p>
            </div>
            <div>
              <p className="text-3xl font-bold">0%</p>
              <p className="text-sm opacity-90">Setup Fees</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center md:mb-0">
              <img 
                src="/brand/logo-icon.svg" 
                alt="SkidSpace" 
                className="h-6 w-6" 
              />
              <span className="ml-2 font-semibold" style={{color: '#0B1220'}}>SkidSpace</span>
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
