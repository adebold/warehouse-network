import type { NextPage } from 'next'
import { signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

const LoginPage: NextPage = () => {
  const router = useRouter()
  const { referralCode } = router.query

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const isReferralSignup = !!referralCode

  const handleLoginSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    signIn('credentials', { email, password, callbackUrl: '/admin/operator-applications' })
  }

  const handleReferralSignupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/auth/register-with-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referralCode, email, name, password }),
      })

      if (response.ok) {
        alert('Account created successfully. Please log in.')
        router.push('/login')
      } else {
        const errorData = await response.json()
        console.error('Failed to register with referral', errorData)
        alert('Failed to register with referral: ' + (errorData.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('An error occurred:', error)
      alert('An error occurred while registering with referral.')
    }
  }

  return (
    <div>
      <h1>{isReferralSignup ? 'Sign Up with Referral' : 'Login'}</h1>
      {isReferralSignup ? (
        <form onSubmit={handleReferralSignupSubmit}>
          <div>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Create Account</button>
        </form>
      ) : (
        <form onSubmit={handleLoginSubmit}>
          <div>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit">Login</button>
        </form>
      )}
    </div>
  )
}

export default LoginPage
