import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { Quote, RFQ, QuoteItem } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]';
import { loadStripe } from '@stripe/stripe-js';

interface CustomerQuoteDetailsProps {
  quote: Quote & { rfq: RFQ; warehouse: { name: string }; items: QuoteItem[] };
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY!);

const CustomerQuoteDetails: NextPage<CustomerQuoteDetailsProps> = ({ quote }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'CUSTOMER_ADMIN' && session?.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  const handleAcceptQuote = async () => {
    try {
      const response = await fetch(`/api/app/quotes/${quote.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ACCEPTED' }),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        console.error('Failed to accept quote', errorData);
        alert('Failed to accept quote');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while accepting the quote.');
    }
  };

  const handleRejectQuote = async () => {
    try {
      const response = await fetch(`/api/app/quotes/${quote.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'REJECTED' }),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        console.error('Failed to reject quote', errorData);
        alert('Failed to reject quote');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while rejecting the quote.');
    }
  };

  const handlePayDeposit = async () => {
    try {
      const response = await fetch('/api/app/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quoteId: quote.id }),
      });

      if (response.ok) {
        const { url } = await response.json();
        router.push(url);
      } else {
        const errorData = await response.json();
        console.error('Failed to create checkout session', errorData);
        alert('Failed to create checkout session');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while creating the checkout session.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Quote Details: {quote.id}</h1>
      <p>RFQ ID: {quote.rfqId}</p>
      <p>Warehouse: {quote.warehouse.name}</p>
      <p>Currency: {quote.currency}</p>
      <p>Deposit Amount: {quote.depositAmount}</p>
      <p>Status: {quote.status}</p>

      <h2>Quote Items</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Unit Price</th>
            <th>Quantity</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map(item => (
            <tr key={item.id}>
              <td>{item.chargeCategory}</td>
              <td>{item.unitPrice}</td>
              <td>{item.quantity}</td>
              <td>{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {quote.status === 'PENDING' && (
        <div>
          <button onClick={handleAcceptQuote}>Accept Quote</button>
          <button onClick={handleRejectQuote}>Reject Quote</button>
        </div>
      )}

      {quote.status === 'ACCEPTED' && (
        <div>
          <button onClick={handlePayDeposit}>Pay Deposit</button>
        </div>
      )}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const { id } = context.params || {};

  if (
    !session ||
    (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')
  ) {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const quote = await prisma.quote.findUnique({
    where: { id: String(id) },
    include: {
      rfq: true,
      warehouse: { select: { name: true } },
      items: true,
      deposits: true, // Include deposits to check if deposit has been paid
    },
  });

  if (!quote || quote.rfq.customerId !== session.user.customerId) {
    return { notFound: true };
  }

  // Check if deposit has been paid
  const depositPaid = quote.deposits.some(deposit => deposit.status === 'succeeded');
  if (depositPaid) {
    quote.status = 'DEPOSIT_PAID'; // Update quote status on the client side
  }

  return {
    props: {
      quote: JSON.parse(JSON.stringify(quote)),
    },
  };
};

export default CustomerQuoteDetails;
