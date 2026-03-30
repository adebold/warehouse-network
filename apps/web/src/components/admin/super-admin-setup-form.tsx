'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/ui/icons'
import { validatePassword } from '@/lib/utils'
import Image from 'next/image'

interface TwoFactorSetup {
  qrCodeUrl: string
  backupCodes: string[]
  manualEntryKey: string
}

export function SuperAdminSetupForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1) // 1: Instructions, 2: Form, 3: 2FA Setup, 4: Success
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null)
  const [setupResponse, setSetupResponse] = useState<any>(null)
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean
    errors: string[]
    strength: 'weak' | 'fair' | 'good' | 'strong'
  }>({ isValid: false, errors: [], strength: 'weak' })

  const handlePasswordChange = (password: string) => {
    setPasswordValidation(validatePassword(password))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string,
      setupKey: formData.get('setupKey') as string,
      organizationName: formData.get('organizationName') as string || 'Skidspace Platform'
    }

    // Client-side validation
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    if (!passwordValidation.isValid) {
      setError('Please ensure your password meets all requirements')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/admin/super/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        setSetupResponse(result)
        setTwoFactorSetup(result.twoFactorAuth)
        setStep(3) // Show 2FA setup
      } else {
        setError(result.error || 'Setup failed. Please try again.')
      }
    } catch (error) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getPasswordStrengthColor = () => {
    switch (passwordValidation.strength) {
      case 'weak': return 'bg-red-500'
      case 'fair': return 'bg-orange-500'
      case 'good': return 'bg-yellow-500'
      case 'strong': return 'bg-green-500'
    }
  }

  const getPasswordStrengthWidth = () => {
    switch (passwordValidation.strength) {
      case 'weak': return 'w-1/4'
      case 'fair': return 'w-2/4'
      case 'good': return 'w-3/4'
      case 'strong': return 'w-full'
    }
  }

  if (step === 1) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Icons.alertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-900">Before You Begin</h3>
              <p className="text-sm text-blue-700 mt-1">
                You'll need a setup key to initialize the platform. This key should have been provided
                during the installation process.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium text-gray-900">Setup Requirements:</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <Icons.check className="h-4 w-4 text-green-600" />
              A valid setup key from the installation
            </li>
            <li className="flex items-center gap-2">
              <Icons.check className="h-4 w-4 text-green-600" />
              Your email address for the super admin account
            </li>
            <li className="flex items-center gap-2">
              <Icons.check className="h-4 w-4 text-green-600" />
              A strong password (minimum 12 characters)
            </li>
            <li className="flex items-center gap-2">
              <Icons.check className="h-4 w-4 text-green-600" />
              Access to the email account for verification
            </li>
          </ul>
        </div>

        <Button onClick={() => setStep(2)} className="w-full">
          Continue to Setup
        </Button>
      </div>
    )
  }

  const handleTwoFactorVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const token = formData.get('token') as string

    try {
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify',
          token,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setStep(4) // Show success message
        // Redirect to sign-in after a delay
        setTimeout(() => {
          router.push('/auth/signin?mode=super-admin&setup=complete')
        }, 3000)
      } else {
        setError(result.message || 'Invalid 2FA token. Please try again.')
      }
    } catch (error) {
      setError('Failed to verify 2FA token. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (step === 3) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Icons.shield className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Setup Two-Factor Authentication</h3>
          <p className="text-gray-600 mt-2">
            Secure your super admin account with 2FA. Scan the QR code with your authenticator app.
          </p>
        </div>

        {twoFactorSetup && (
          <div className="space-y-6">
            {/* QR Code */}
            <div className="bg-gray-50 p-6 rounded-lg text-center">
              <h4 className="font-medium text-gray-900 mb-4">Scan with your authenticator app</h4>
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <Image
                    src={twoFactorSetup.qrCodeUrl}
                    alt="2FA QR Code"
                    width={200}
                    height={200}
                    className="mx-auto"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Can't scan? Enter this code manually:
              </p>
              <div className="bg-white border rounded p-3">
                <code className="text-sm font-mono break-all">{twoFactorSetup.manualEntryKey}</code>
              </div>
            </div>

            {/* Backup Codes */}
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Icons.alertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-yellow-900">Save Your Backup Codes</h4>
                  <p className="text-sm text-yellow-800 mt-1 mb-3">
                    Store these codes safely. You can use them if you lose access to your authenticator app.
                  </p>
                  <div className="bg-white border border-yellow-300 rounded p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                      {twoFactorSetup.backupCodes.map((code, index) => (
                        <div key={index} className="text-gray-700">{code}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleTwoFactorVerification} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                  <div className="flex items-center gap-2">
                    <Icons.alertCircle className="h-4 w-4" />
                    {error}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="token">Verification Code</Label>
                <Input
                  id="token"
                  name="token"
                  type="text"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  disabled={isLoading}
                  className="text-center text-lg tracking-widest"
                />
                <p className="text-xs text-gray-500">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Complete Setup
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  if (step === 4) {
    return (
      <div className="text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <Icons.check className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Setup Complete!</h3>
          <p className="text-gray-600 mt-2">
            Your super admin account has been created successfully with 2FA enabled.
            You'll be redirected to the sign-in page shortly.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Important:</strong> Make sure you've saved your backup codes before continuing.
            You won't be able to see them again.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Icons.spinner className="h-4 w-4 animate-spin" />
          Redirecting to sign-in...
        </div>
      </div>
    )
  }

  // Step 2: Form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <div className="flex items-center gap-2">
            <Icons.alertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="admin@your-company.com"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="organizationName">Platform Organization Name</Label>
        <Input
          id="organizationName"
          name="organizationName"
          type="text"
          placeholder="Skidspace Platform"
          disabled={isLoading}
        />
        <p className="text-xs text-gray-500">
          This will be the name of your platform organization
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Create a strong password"
            required
            disabled={isLoading}
            onChange={(e) => handlePasswordChange(e.target.value)}
          />
          {/* Password strength indicator */}
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Password strength</span>
              <span className="capitalize">{passwordValidation.strength}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()} ${getPasswordStrengthWidth()}`}
              />
            </div>
            {passwordValidation.errors.length > 0 && (
              <ul className="mt-2 text-xs text-red-600">
                {passwordValidation.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="setupKey">Setup Key</Label>
        <Input
          id="setupKey"
          name="setupKey"
          type="password"
          placeholder="Enter your setup key"
          required
          disabled={isLoading}
        />
        <p className="text-xs text-gray-500">
          This key was provided during the platform installation
        </p>
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || !passwordValidation.isValid}
        >
          {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Create Super Admin Account
        </Button>
      </div>

      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep(1)}
          disabled={isLoading}
          className="text-sm"
        >
          Back to Instructions
        </Button>
      </div>
    </form>
  )
}