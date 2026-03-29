import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { SignInForm } from '@/components/auth/signin-form'
import { Icons } from '@/components/ui/icons'

export const metadata = {
  title: 'Sign In - Skidspace',
  description: 'Sign in to your Skidspace account',
}

interface SignInPageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth()

  if (session?.user) {
    redirect('/dashboard')
  }

  const mode = searchParams.mode as 'user' | 'super-admin' | undefined
  const organizationSlug = searchParams.org as string | undefined

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 bg-primary text-primary-foreground p-12 flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <Icons.logo className="h-10 w-10" />
              <h1 className="text-2xl font-bold">Skidspace</h1>
            </div>
            <div className="max-w-md">
              <h2 className="text-4xl font-bold mb-6">
                Welcome back to your warehouse network
              </h2>
              <p className="text-lg text-primary-foreground/80 mb-8">
                Manage your warehouse operations, track inventory, and optimize logistics
                with our comprehensive platform.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <Icons.check className="h-5 w-5 text-green-300" />
                  <span>Real-time inventory tracking</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icons.check className="h-5 w-5 text-green-300" />
                  <span>Multi-location management</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icons.check className="h-5 w-5 text-green-300" />
                  <span>Advanced analytics & reporting</span>
                </li>
                <li className="flex items-center gap-3">
                  <Icons.check className="h-5 w-5 text-green-300" />
                  <span>Seamless team collaboration</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="text-sm text-primary-foreground/60">
            &copy; 2024 Skidspace. All rights reserved.
          </div>
        </div>

        {/* Right side - Sign in form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Icons.spinner className="h-8 w-8 animate-spin" />
              </div>
            }>
              <SignInForm mode={mode} organizationSlug={organizationSlug} />
            </Suspense>

            {/* Show success message if redirected from registration */}
            {searchParams.message === 'registration-success' && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md">
                <p className="text-sm">
                  Registration successful! You can now sign in with your credentials.
                </p>
              </div>
            )}

            {/* Show error message if any */}
            {searchParams.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
                <p className="text-sm">
                  {searchParams.error === 'CredentialsSignin'
                    ? 'Invalid email or password. Please try again.'
                    : 'An error occurred during sign in. Please try again.'
                  }
                </p>
              </div>
            )}

            {/* Additional links */}
            <div className="mt-8 text-center">
              {mode !== 'super-admin' && (
                <p className="text-sm text-muted-foreground">
                  Need help?{' '}
                  <a href="/support" className="text-primary hover:underline">
                    Contact Support
                  </a>
                </p>
              )}

              {mode !== 'super-admin' && (
                <div className="mt-2">
                  <a
                    href="/auth/signin?mode=super-admin"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Super Admin Access
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}