import type { NextPage, GetServerSideProps } from 'next';
import prisma from '../../lib/prisma';
import type { Operator } from '@prisma/client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle, XCircle, Clock, Building2 } from 'lucide-react';
import Link from 'next/link';


interface AdminOperatorApplicationsProps {
  applications: Operator[];
}

const AdminOperatorApplications: NextPage<AdminOperatorApplicationsProps> = ({ applications }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Do nothing while loading
    if (!session) router.push('/login'); // If not authenticated, redirect
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized'); // If not a super admin, redirect
  }, [session, status, router]);

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await fetch(`/api/admin/operator-applications/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Refresh the page to show the updated status
        window.location.reload();
      } else {
        console.error('Failed to update status');
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while updating the status.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div>Loading...</div>;
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
          <h1 className="text-3xl font-bold tracking-tight">Operator Applications</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve warehouse operator applications
          </p>
        </div>

        {/* Applications Grid */}
        <div className="grid gap-6">
          {applications.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-600">No operator applications to review</p>
              </CardContent>
            </Card>
          ) : (
            applications.map(app => (
              <Card key={app.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{app.legalName}</CardTitle>
                      <CardDescription className="mt-1">
                        {app.operatingRegions} • {app.warehouseCount} warehouses
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        app.status === 'APPROVED'
                          ? 'default'
                          : app.status === 'REJECTED'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="flex items-center gap-1"
                    >
                      {app.status === 'APPROVED' && <CheckCircle className="h-3 w-3" />}
                      {app.status === 'REJECTED' && <XCircle className="h-3 w-3" />}
                      {app.status === 'PENDING' && <Clock className="h-3 w-3" />}
                      {app.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-medium text-gray-500">Primary Contact</p>
                      <p className="mt-1">{app.primaryContact}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Goods Categories</p>
                      <p className="mt-1">{app.goodsCategories}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Registration Details</p>
                      <p className="mt-1">{app.registrationDetails}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Insurance Acknowledged</p>
                      <p className="mt-1">{app.insuranceAcknowledged ? 'Yes' : 'No'}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {app.status === 'PENDING' && (
                    <div className="flex gap-3 border-t pt-4">
                      <Button
                        onClick={() => handleUpdateStatus(app.id, 'APPROVED')}
                        className="flex-1"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve Application
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleUpdateStatus(app.id, 'REJECTED')}
                        className="flex-1"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject Application
                      </Button>
                    </div>
                  )}

                  {app.status !== 'PENDING' && (
                    <div className="border-t pt-4 text-sm text-gray-600">
                      Application {app.status.toLowerCase()} on{' '}
                      {new Date(app.updatedAt || app.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const applications = await prisma.operator.findMany();
  return {
    props: {
      applications: JSON.parse(JSON.stringify(applications)), // Serialize date objects
    },
  };
};

export default AdminOperatorApplications;
