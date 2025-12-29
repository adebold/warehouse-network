import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';

const DashboardPage = () => {
  // This page is just a redirect, no UI needed
  return null;
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  // Redirect based on user role
  switch (session.user.role) {
    case 'ADMIN':
    case 'FINANCE_ADMIN':
      return {
        redirect: {
          destination: '/admin/dashboard',
          permanent: false,
        },
      };
    
    case 'OPERATOR_ADMIN':
    case 'WAREHOUSE_STAFF':
      return {
        redirect: {
          destination: '/operator/dashboard',
          permanent: false,
        },
      };
    
    case 'CUSTOMER_ADMIN':
    case 'CUSTOMER_USER':
      return {
        redirect: {
          destination: '/customer/dashboard',
          permanent: false,
        },
      };
    
    default:
      // Fallback to customer dashboard
      return {
        redirect: {
          destination: '/customer/dashboard',
          permanent: false,
        },
      };
  }
};

export default DashboardPage;