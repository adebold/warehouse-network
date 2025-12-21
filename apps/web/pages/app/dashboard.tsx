import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

const Dashboard: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/login');
      return;
    }

    // Redirect based on user role
    switch (session.user?.role) {
      case 'SUPER_ADMIN':
        router.push('/admin/dashboard');
        break;
      case 'OPERATOR_ADMIN':
      case 'WAREHOUSE_STAFF':
        router.push('/operator/dashboard');
        break;
      case 'CUSTOMER_ADMIN':
      case 'CUSTOMER_USER':
        router.push('/customer/dashboard');
        break;
      default:
        router.push('/');
    }
  }, [session, status, router]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-xl font-semibold">Redirecting...</h2>
        <p className="text-muted-foreground">Please wait while we load your dashboard.</p>
      </div>
    </div>
  );
};

export default Dashboard;
