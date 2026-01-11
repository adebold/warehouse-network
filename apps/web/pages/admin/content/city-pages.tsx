import type { CityPage } from '@prisma/client';
import { ArrowLeft, Globe, Edit, Trash2, Plus } from 'lucide-react';
import type { NextPage, GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import prisma from '../../../lib/prisma';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/client-logger';


interface CityPagesProps {
  cityPages: CityPage[];
}

const CityPages: NextPage<CityPagesProps> = ({ cityPages }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    city: '',
    region: '',
    h1: '',
    introContent: '',
    isActive: false,
  });

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'SUPER_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prevState => ({
      ...prevState,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/admin/content/city-pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        logger.error('Failed to create city page', errorData);
        alert('Failed to create city page');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while creating the city page.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/dashboard"
            className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">City Pages Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage city-specific landing pages
          </p>
        </div>

        {/* Existing City Pages */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Existing City Pages</CardTitle>
            <CardDescription>All city pages in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {cityPages.length === 0 ? (
              <div className="py-8 text-center">
                <Globe className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-600">No city pages created yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left">City</th>
                      <th className="px-4 py-3 text-left">Region</th>
                      <th className="px-4 py-3 text-left">H1 Title</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cityPages.map(page => (
                      <tr key={page.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{page.city}</td>
                        <td className="px-4 py-3">{page.region}</td>
                        <td className="px-4 py-3 text-gray-600">{page.h1}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={page.isActive ? 'default' : 'secondary'}>
                            {page.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create New City Page Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create New City Page</CardTitle>
            <CardDescription>Add a new city-specific landing page</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City Name</Label>
                  <Input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="e.g., San Francisco"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    type="text"
                    id="region"
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    placeholder="e.g., California"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="h1">H1 Title</Label>
                <Input
                  type="text"
                  id="h1"
                  name="h1"
                  value={formData.h1}
                  onChange={handleChange}
                  placeholder="e.g., Warehouse Storage Solutions in San Francisco"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="introContent">Introduction Content</Label>
                <Textarea
                  id="introContent"
                  name="introContent"
                  value={formData.introContent}
                  onChange={handleChange}
                  placeholder="Enter the introduction content for this city page..."
                  rows={6}
                  required
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, isActive: checked as boolean }))
                  }
                />
                <Label htmlFor="isActive" className="cursor-pointer">
                  Make page active immediately
                </Label>
              </div>
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setFormData({
                      city: '',
                      region: '',
                      h1: '',
                      introContent: '',
                      isActive: false,
                    })
                  }
                >
                  Clear Form
                </Button>
                <Button type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  Create City Page
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const cityPages = await prisma.cityPage.findMany();

  return {
    props: {
      cityPages: JSON.parse(JSON.stringify(cityPages)),
    },
  };
};

export default CityPages;
