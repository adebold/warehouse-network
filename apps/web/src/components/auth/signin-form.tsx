'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'

interface SignInFormProps {
  mode?: 'user' | 'super-admin'
  organizationSlug?: string
}

export function SignInForm({ mode = 'user', organizationSlug }: SignInFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const callbackUrl = searchParams?.get('callbackUrl') || '/dashboard'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const adminCode = formData.get('adminCode') as string

    try {
      const providerId = mode === 'super-admin' ? 'super-admin' : 'credentials'

      const result = await signIn(providerId, {
        email,
        password,
        ...(mode === 'super-admin' && { adminCode }),
        ...(organizationSlug && { organizationSlug }),
        redirect: false
      })

      if (result?.error) {
        setError(result.error)
      } else if (result?.ok) {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch (error) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setIsLoading(true)
    setError('')

    try {
      await signIn(provider, {
        callbackUrl,
        ...(organizationSlug && { organizationSlug })
      })
    } catch (error) {
      setError('OAuth sign-in failed')
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">
          {mode === 'super-admin' ? 'Super Admin Sign In' : 'Welcome back'}
        </h1>
        <p className="text-muted-foreground mt-2">
          {mode === 'super-admin'
            ? 'Sign in with your super admin credentials'
            : 'Enter your email and password to sign in'
          }
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="Enter your email"
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            required
            disabled={isLoading}
          />
        </div>

        {mode === 'super-admin' && (
          <div className="space-y-2">
            <Label htmlFor="adminCode">Admin Code</Label>
            <Input
              id="adminCode"
              name="adminCode"
              type="password"
              placeholder="Enter admin security code"
              required
              disabled={isLoading}
            />
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'super-admin' ? 'Sign In as Super Admin' : 'Sign In'}
        </Button>
      </form>

      {mode === 'user' && (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              onClick={() => handleOAuthSignIn('google')}
              disabled={isLoading}
            >
              <Icons.google className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button
              variant="outline"
              onClick={() => handleOAuthSignIn('github')}
              disabled={isLoading}
            >
              <Icons.github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </div>

          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <a
                href="/auth/register"
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </a>
            </p>
          </div>
        </>
      )}

      {mode === 'user' && (
        <div className="text-center mt-4">
          <p className="text-sm text-muted-foreground">
            <a
              href="/auth/forgot-password"
              className="text-primary hover:underline"
            >
              Forgot your password?
            </a>
          </p>
        </div>
      )}
    </div>
  )
}