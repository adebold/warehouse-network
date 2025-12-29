import type { RFQ, Customer } from '@prisma/client';
import type { Customer } from '@warehouse/types';
import { ArrowLeft, FileText, Package, Calendar } from 'lucide-react';
import type { NextPage, GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import prisma from '../../lib/prisma';
import { authOptions } from '../api/auth/[...nextauth]';


import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


interface AdminRFQsProps {
  rfqs: (RFQ & { customer: Customer })[];
}

const AdminRFQs: NextPage<AdminRFQsProps> = ({ rfqs }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'SUPER_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

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
          <h1 className="text-3xl font-bold tracking-tight">RFQs for Review</h1>
          <p className="text-muted-foreground mt-2">Review and create quotes for pending RFQs</p>
        </div>

        {/* RFQs List */}
        <div className="grid gap-6">
          {rfqs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-600">No pending RFQs to review</p>
              </CardContent>
            </Card>
          ) : (
            rfqs.map(rfq => (
              <Card key={rfq.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">RFQ #{rfq.id.slice(-8)}</CardTitle>
                      <CardDescription className="mt-1">
                        Customer: {rfq.customer.name}
                      </CardDescription>
                    </div>
                    <Badge variant={rfq.status === 'PENDING' ? 'secondary' : 'default'}>
                      {rfq.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                    <div>
                      <p className="flex items-center font-medium text-gray-500">
                        <Package className="mr-2 h-4 w-4" />
                        Estimated Skids
                      </p>
                      <p className="mt-1 text-lg font-semibold">{rfq.estimatedSkidCount}</p>
                    </div>
                    <div>
                      <p className="flex items-center font-medium text-gray-500">
                        <Calendar className="mr-2 h-4 w-4" />
                        Created Date
                      </p>
                      <p className="mt-1">{new Date(rfq.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Status</p>
                      <p className="mt-1 capitalize">{rfq.status.toLowerCase()}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 border-t pt-4">
                    <Link href={`/admin/quotes/new?rfqId=${rfq.id}`} className="flex-1">
                      <Button className="w-full">
                        <FileText className="mr-2 h-4 w-4" />
                        Create Quote
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const rfqs = await prisma.rFQ.findMany({
    where: { status: 'PENDING' },
    include: {
      customer: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    props: {
      rfqs: JSON.parse(JSON.stringify(rfqs)),
    },
  };
};

export default AdminRFQs;
