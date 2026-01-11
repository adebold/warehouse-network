import { ReferralType } from '@prisma/client';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { logger } from '@/lib/client-logger';

const GenerateReferral: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [referralType, setReferralType] = useState<ReferralType>('CUSTOMER_TO_CUSTOMER');
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
  }, [session, status, router]);

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/app/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referralType }),
      });

      if (response.ok) {
        const data = await response.json();
        setReferralCode(data.referralCode);
        setReferralLink(data.referralLink);
      } else {
        const errorData = await response.json();
        logger.error('Failed to generate referral', errorData);
        alert('Failed to generate referral');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while generating the referral.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Generate Referral Code</h1>
      <form onSubmit={handleGenerate}>
        <div>
          <label htmlFor="referralType">Referral Type</label>
          <select
            name="referralType"
            value={referralType}
            onChange={e => setReferralType(e.target.value as ReferralType)}
          >
            <option value="CUSTOMER_TO_CUSTOMER">Customer to Customer</option>
            <option value="OPERATOR_TO_OPERATOR">Operator to Operator</option>
            <option value="OPERATOR_TO_CUSTOMER">Operator to Customer</option>
          </select>
        </div>
        <button type="submit">Generate Code</button>
      </form>

      {referralCode && (
        <div>
          <h2>Your Referral Code: {referralCode}</h2>
          <p>
            Share this link: <a href={referralLink}>{referralLink}</a>
          </p>
        </div>
      )}
    </div>
  );
};

export default GenerateReferral;
