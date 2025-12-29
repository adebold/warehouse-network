import type { Invitation } from '@prisma/client';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';

import prisma from '../../lib/prisma';

interface AcceptInvitationProps {
  invitation: Invitation | null;
  error?: string;
}

const AcceptInvitation: NextPage<AcceptInvitationProps> = ({ invitation, error }) => {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: invitation?.token, name, password }),
      });

      if (response.ok) {
        router.push('/login');
      } else {
        const errorData = await response.json();
        console.error('Failed to accept invitation', errorData);
        alert('Failed to accept invitation');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while accepting the invitation.');
    }
  };

  if (error || !invitation) {
    return <div>{error || 'Invalid or expired invitation.'}</div>;
  }

  return (
    <div>
      <h1>Accept Invitation</h1>
      <p>Create an account to join the operator team.</p>
      <form onSubmit={handleSubmit}>
        <input type="text" value={invitation.email} disabled />
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Choose a password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button type="submit">Create Account</button>
      </form>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const { token } = context.params || {};

  if (typeof token !== 'string') {
    return { props: { invitation: null, error: 'Invalid token.' } };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token },
  });

  if (!invitation || invitation.expires < new Date()) {
    return { props: { invitation: null, error: 'Invalid or expired invitation.' } };
  }

  return {
    props: {
      invitation: JSON.parse(JSON.stringify(invitation)),
    },
  };
};

export default AcceptInvitation;
