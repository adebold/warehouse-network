import type { Warehouse } from '@warehouse/types';
import type { NextPage } from 'next';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAnalytics } from '@/hooks/useAnalytics';
import { trackConversion, logEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  Shield,
  Zap,
  Check,
  ArrowRight,
  DollarSign,
  Users,
  BarChart3,
  Clock,
  Star,
  ChevronRight,
  Brain,
  Bot,
  Workflow,
  Cpu,
} from 'lucide-react';

const BecomeAPartner: NextPage = () => {
  const router = useRouter();
  const { trackCTA, formTracking } = useAnalytics();
  const [formData, setFormData] = useState({
    legalName: '',
    registrationDetails: '',
    primaryContact: '',
    email: '',
    phone: '',
    operatingRegions: '',
    warehouseCount: 0,
    goodsCategories: '',
    insurance: false,
  });
  const [lastInteractedField, setLastInteractedField] = useState<string>('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = e.target;
    const value = target.type === 'checkbox' && 'checked' in target ? target.checked : target.value;
    setFormData(prev => ({ ...prev, [target.name]: value }));

    // Track field interaction
    setLastInteractedField(target.name);
    formTracking.field('partner_application', target.name);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Track form submission
    formTracking.submit('partner_application');
    trackConversion('partner_application_submit', {
      warehouseCount: formData.warehouseCount,
      regions: formData.operatingRegions,
    });

    try {
      const response = await fetch('/api/operator-applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        // Track successful conversion
        trackConversion('partner_signup_complete', {
          value: calculateEstimatedRevenue(formData.warehouseCount),
          warehouseCount: formData.warehouseCount,
        });
        router.push('/operator/welcome');
      } else {
        formTracking.error('partner_application', 'submission_failed');
        alert('Application submission failed. Please try again.');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      formTracking.error('partner_application', 'network_error');
      alert('An error occurred while submitting the application.');
    }
  };

  // Calculate estimated monthly revenue based on warehouse count
  const calculateEstimatedRevenue = (count: number): number => {
    const avgRevenuePerWarehouse = 18500;
    const countValue = typeof count === 'string' ? parseInt(count) : count;
    if (countValue === 1) return avgRevenuePerWarehouse;
    if (countValue <= 5) return avgRevenuePerWarehouse * 3;
    if (countValue <= 10) return avgRevenuePerWarehouse * 7;
    return avgRevenuePerWarehouse * 15;
  };

  // Track form starts
  useEffect(() => {
    formTracking.start('partner_application');

    // Track form abandonment on unmount
    return () => {
      if (lastInteractedField && !formData.email) {
        formTracking.abandon('partner_application', lastInteractedField);
      }
    };
  }, []);

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <img 
                src="/brand/logo-icon.svg" 
                alt="SkidSpace" 
                className="h-8 w-8" 
              />
              <span className="ml-2 text-xl font-semibold" style={{color: '#0B1220'}}>SkidSpace</span>
            </Link>
            <nav className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
            alt="Warehouse interior"
            className="h-full w-full object-cover"
          />
          <div className="from-background via-background/90 to-background/70 absolute inset-0 bg-gradient-to-r" />
        </div>

        <div className="container relative mx-auto px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Turn Your Empty Space Into
              <span className="text-primary"> Steady Revenue</span>
            </h1>
            <p className="text-muted-foreground mt-6 text-xl">
              Join Canada's fastest-growing warehouse marketplace. List your property in minutes and
              connect with pre-qualified businesses looking for space.
            </p>

            {/* Value Props */}
            <div className="mt-8 space-y-3">
              <div className="flex items-center">
                <Check className="mr-3 h-5 w-5 text-green-600" />
                <span className="text-lg">Average 95% occupancy rate within 30 days</span>
              </div>
              <div className="flex items-center">
                <Check className="mr-3 h-5 w-5 text-green-600" />
                <span className="text-lg">Get 15-20% higher rates than traditional leasing</span>
              </div>
              <div className="flex items-center">
                <Check className="mr-3 h-5 w-5 text-green-600" />
                <span className="text-lg">Automated payments and tenant management</span>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button
                size="lg"
                className="px-8 text-lg"
                onClick={() => {
                  trackCTA('start_earning_now', 'hero')();
                  document
                    .getElementById('application-form')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Start Earning Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 text-lg"
                onClick={() => {
                  trackCTA('calculate_revenue', 'hero')();
                  logEvent('Calculator', 'open', 'partner_hero');
                }}
              >
                Calculate Your Revenue
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Partner Success Story */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="overflow-hidden">
            <div className="grid md:grid-cols-2">
              <div className="relative h-64 md:h-auto">
                <img
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
                  alt="Success story"
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="p-8 md:p-12">
                <div className="mb-4 flex items-center">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <h3 className="mb-4 text-2xl font-bold">
                  "We went from 60% to 98% occupancy in just 6 weeks"
                </h3>
                <p className="text-muted-foreground mb-6 text-lg">
                  Warehouse Network transformed our underutilized 50,000 sq ft facility into a
                  profitable multi-tenant operation. The platform handles everything from tenant
                  screening to payments. We're now earning 40% more than with our previous single
                  tenant.
                </p>
                <div className="flex items-center">
                  <img
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80"
                    alt="Partner"
                    className="mr-4 h-12 w-12 rounded-full"
                  />
                  <div>
                    <p className="font-semibold">Robert Mitchell</p>
                    <p className="text-muted-foreground text-sm">
                      Premium Logistics Properties, Toronto
                    </p>
                  </div>
                </div>
              </CardContent>
            </div>
          </Card>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Why Partners Choose SkidSpace</h2>
            <p className="text-muted-foreground mt-4 text-lg">
              Proven platform to maximize your warehouse revenue with flexible rentals
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <Card className="relative overflow-hidden border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardHeader>
                <TrendingUp className="text-blue-600 mb-4 h-10 w-10" />
                <CardTitle className="text-blue-900">Maximize Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-700 mb-4">
                  Fill unused space with flexible rentals. Set your own rates and terms to optimize income.
                </p>
                <p className="text-blue-600 text-2xl font-bold">95%</p>
                <p className="text-blue-600 text-sm">Average occupancy rate</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50">
              <CardHeader>
                <Users className="text-purple-600 mb-4 h-10 w-10" />
                <CardTitle className="text-purple-900">Verified Tenants</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-purple-700 mb-4">
                  Pre-screened businesses with verified insurance and payment history. Reduce risk, increase peace of mind.
                </p>
                <p className="text-purple-600 text-2xl font-bold">500+</p>
                <p className="text-purple-600 text-sm">Active business customers</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
              <CardHeader>
                <Shield className="text-green-600 mb-4 h-10 w-10" />
                <CardTitle className="text-green-900">Full Protection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-green-700 mb-4">
                  $1M liability insurance included with every rental. Your property and business are fully protected.
                </p>
                <p className="text-green-600 text-2xl font-bold">100%</p>
                <p className="text-green-600 text-sm">Coverage on all rentals</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Revenue Calculator */}
      <section className="from-primary/10 bg-gradient-to-br to-transparent py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <BarChart3 className="text-primary mx-auto mb-6 h-16 w-16" />
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Your warehouse could be earning
            </h2>
            <p className="text-primary mb-2 text-5xl font-bold">$26,800/month</p>
            <p className="text-muted-foreground mb-8 text-lg">
              Based on average 10,000 sq ft warehouse in the Greater Toronto Area
            </p>
            <Button
              size="lg"
              className="px-8 text-lg"
              onClick={() => {
                trackCTA('custom_estimate', 'revenue_calculator')();
                trackConversion('revenue_calculator_interest', { estimated_revenue: 18500 });
              }}
            >
              Get Your Custom Estimate
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="application-form" className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Start Your Application</h2>
              <p className="text-muted-foreground mt-4 text-lg">
                Takes less than 5 minutes. Get approved within 24 hours.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>Tell us about your warehouse operation</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="legalName" className="text-sm font-medium">
                        Legal Business Name *
                      </label>
                      <input
                        type="text"
                        id="legalName"
                        name="legalName"
                        required
                        value={formData.legalName}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                        placeholder="ABC Logistics Inc."
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="registrationDetails" className="text-sm font-medium">
                        Business Number
                      </label>
                      <input
                        type="text"
                        id="registrationDetails"
                        name="registrationDetails"
                        value={formData.registrationDetails}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                        placeholder="123456789"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="primaryContact" className="text-sm font-medium">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        id="primaryContact"
                        name="primaryContact"
                        required
                        value={formData.primaryContact}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                        placeholder="John Smith"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                        placeholder="john@company.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        required
                        value={formData.phone}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                        placeholder="+1 (416) 555-0123"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="warehouseCount" className="text-sm font-medium">
                        Number of Properties *
                      </label>
                      <select
                        id="warehouseCount"
                        name="warehouseCount"
                        required
                        value={formData.warehouseCount}
                        onChange={handleChange}
                        className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                      >
                        <option value="">Select...</option>
                        <option value="1">1 property</option>
                        <option value="2">2-5 properties</option>
                        <option value="6">6-10 properties</option>
                        <option value="11">11+ properties</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="operatingRegions" className="text-sm font-medium">
                      Operating Regions *
                    </label>
                    <input
                      type="text"
                      id="operatingRegions"
                      name="operatingRegions"
                      required
                      value={formData.operatingRegions}
                      onChange={handleChange}
                      className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                      placeholder="Greater Toronto Area, Hamilton, Ottawa"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="goodsCategories" className="text-sm font-medium">
                      Types of Goods You Can Store *
                    </label>
                    <input
                      type="text"
                      id="goodsCategories"
                      name="goodsCategories"
                      required
                      value={formData.goodsCategories}
                      onChange={handleChange}
                      className="focus:ring-primary w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2"
                      placeholder="General merchandise, Electronics, Food (dry), etc."
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start">
                      <input
                        type="checkbox"
                        id="insurance"
                        name="insurance"
                        checked={formData.insurance}
                        onChange={handleChange}
                        className="mr-3 mt-1"
                        required
                      />
                      <label htmlFor="insurance" className="text-sm">
                        I confirm that our facilities carry appropriate commercial insurance
                        including general liability coverage of at least $2 million
                      </label>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="mb-2 flex items-center">
                      <Shield className="mr-2 h-5 w-5 text-green-600" />
                      <span className="font-semibold">What happens next?</span>
                    </div>
                    <ul className="text-muted-foreground ml-7 space-y-1 text-sm">
                      <li>• We'll review your application within 24 hours</li>
                      <li>• Complete a quick onboarding call (15 minutes)</li>
                      <li>• List your properties and start earning</li>
                    </ul>
                  </div>

                  <Button type="submit" size="lg" className="w-full text-lg">
                    Submit Application
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="border-t py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            <div className="text-center">
              <p className="text-2xl font-bold">500+</p>
              <p className="text-sm">Active Partners</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">$12M+</p>
              <p className="text-sm">Paid to Partners</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">98%</p>
              <p className="text-sm">Partner Satisfaction</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">24hr</p>
              <p className="text-sm">Approval Time</p>
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
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
              <Link href="/contact" className="hover:text-foreground">
                Contact
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-foreground">
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

export default BecomeAPartner;
