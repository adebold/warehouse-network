import type { User, Warehouse } from '@warehouse/types';
import type { NextPage } from 'next';
import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAnalytics } from '@/hooks/useAnalytics';

import Link from 'next/link';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, Mail, Lock, User, ArrowLeft, Loader2 } from 'lucide-react';

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { referralCode } = router.query;
  const { formTracking } = useAnalytics();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isReferralSignup = !!referralCode;

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/app/dashboard',
    });

    if (result?.error) {
      setError('Invalid email or password');
      setIsLoading(false);
    } else if (result?.url) {
      router.push(result.url);
    }
  };

  const handleReferralSignupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register-with-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referralCode, email, name, password }),
      });

      if (response.ok) {
        // Auto sign in after registration
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
          callbackUrl: '/app/dashboard',
        });

        if (result?.url) {
          router.push(result.url);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to create account');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="space-y-1">
          <h2 className="text-center text-2xl font-bold">
            {isReferralSignup ? 'Create an account' : 'Welcome back'}
          </h2>
          <CardDescription className="text-center">
            {isReferralSignup
              ? 'Sign up with your referral code to get started'
              : 'Enter your email and password to access your account'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isReferralSignup ? (
            <form onSubmit={handleReferralSignupSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  type="text"
                  id="name"
                  name="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="John Doe"
                  startIcon={<User className="h-4 w-4" />}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="john@company.com"
                  startIcon={<Mail className="h-4 w-4" />}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="••••••••"
                  startIcon={<Lock className="h-4 w-4" />}
                />
              </div>

              <div className="bg-muted rounded-lg p-3 text-sm">
                <p className="text-muted-foreground">Referral Code:</p>
                <p className="font-medium">{referralCode}</p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="signup-button"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="john@company.com"
                  startIcon={<Mail className="h-4 w-4" />}
                  data-testid="email-input"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-primary text-sm hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  placeholder="••••••••"
                  startIcon={<Lock className="h-4 w-4" />}
                  data-testid="password-input"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="login-button"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">
                {isReferralSignup ? 'Already have an account?' : 'New to Warehouse Network?'}
              </span>
            </div>
          </div>

          {isReferralSignup ? (
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full">
                Sign in instead
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/register" className="w-full">
                <Button variant="outline" className="w-full">
                  Create an account
                </Button>
              </Link>
              <Link href="/become-a-partner" className="w-full">
                <Button variant="outline" className="w-full">
                  List your warehouse
                </Button>
              </Link>
            </>
          )}

          <Link
            href="/"
            className="text-muted-foreground hover:text-primary flex items-center justify-center text-sm"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
};

export default LoginPage;
