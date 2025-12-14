import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import type { OperatorUser, Invitation } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]'

interface ManageUsersProps {
  users: OperatorUser[]
  invitations: Invitation[]
}

const ManageUsers: NextPage<ManageUsersProps> = ({ users, invitations }) => {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('WAREHOUSE_STAFF')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      const response = await fetch('/api/operator/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, role }),
      })

      if (response.ok) {
        router.replace(router.asPath) // Refresh the page
      } else {
        const errorData = await response.json()
        console.error('Failed to send invitation', errorData)
        alert('Failed to send invitation')
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while sending the invitation.')
    }
  }

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Manage Users</h1>
      
      <h2>Existing Users</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map(opUser => (
            <tr key={opUser.id}>
              <td>{opUser.user.name}</td>
              <td>{opUser.user.email}</td>
              <td>{opUser.user.role}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Invitations</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map(invitation => (
            <tr key={invitation.id}>
              <td>{invitation.email}</td>
              <td>{invitation.role}</td>
              <td>Pending</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Invite New User</h2>
      <form onSubmit={handleInvite}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="WAREHOUSE_STAFF">Warehouse Staff</option>
          <option value="FINANCE_ADMIN">Finance Admin</option>
        </select>
        <button type="submit">Send Invitation</button>
      </form>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
    return {
      redirect: {
        destination: '/unauthorized',
        permanent: false,
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email ?? '' },
    include: { operatorUser: true },
  })

  if (!user?.operatorUser) {
    return {
      notFound: true,
    }
  }

  const operatorId = user.operatorUser.operatorId;

  const users = await prisma.operatorUser.findMany({
    where: { operatorId },
    include: { user: true },
  })

  const invitations = await prisma.invitation.findMany({
    where: { operatorId },
  })

  return {
    props: {
      users: JSON.parse(JSON.stringify(users)),
      invitations: JSON.parse(JSON.stringify(invitations)),
    },
  }
}

export default ManageUsers
