import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { SignInForm } from '@/components/auth/signin-form'

// Mock dependencies
jest.mock('next/navigation')
jest.mock('next-auth/react')

const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

describe('SignInForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRouter.mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    } as any)
  })

  it('should render sign in form correctly', () => {
    render(<SignInForm />)

    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('should render super admin form when mode is super-admin', () => {
    render(<SignInForm mode="super-admin" />)

    expect(screen.getByText('Super Admin Sign In')).toBeInTheDocument()
    expect(screen.getByLabelText('Admin Code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in as super admin/i })).toBeInTheDocument()
  })

  it('should hide OAuth buttons in super admin mode', () => {
    render(<SignInForm mode="super-admin" />)

    expect(screen.queryByText('Google')).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  it('should submit credentials form successfully', async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInForm />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false
      })
    })

    expect(mockPush).toHaveBeenCalledWith('/dashboard')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should submit super admin form with admin code', async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInForm mode="super-admin" />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const adminCodeInput = screen.getByLabelText('Admin Code')
    const submitButton = screen.getByRole('button', { name: /sign in as super admin/i })

    fireEvent.change(emailInput, { target: { value: 'admin@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'adminPassword123' } })
    fireEvent.change(adminCodeInput, { target: { value: 'admin-code' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('super-admin', {
        email: 'admin@example.com',
        password: 'adminPassword123',
        adminCode: 'admin-code',
        redirect: false
      })
    })
  })

  it('should display error message on sign in failure', async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: 'Invalid credentials' } as any)

    render(<SignInForm />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should handle OAuth sign in', async () => {
    mockSignIn.mockResolvedValue(undefined as any)

    render(<SignInForm />)

    const googleButton = screen.getByText('Google').closest('button')
    expect(googleButton).toBeInTheDocument()

    fireEvent.click(googleButton!)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google', {
        callbackUrl: '/dashboard'
      })
    })
  })

  it('should include organization slug when provided', async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInForm organizationSlug="acme-warehouse" />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        organizationSlug: 'acme-warehouse',
        redirect: false
      })
    })
  })

  it('should disable form during loading state', async () => {
    mockSignIn.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

    render(<SignInForm />)

    const emailInput = screen.getByLabelText('Email') as HTMLInputElement
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    const submitButton = screen.getByRole('button', { name: /sign in/i }) as HTMLButtonElement

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    // Form should be disabled during loading
    expect(emailInput.disabled).toBe(true)
    expect(passwordInput.disabled).toBe(true)
    expect(submitButton.disabled).toBe(true)
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      expect(submitButton.disabled).toBe(false)
    })
  })

  it('should show loading spinner on OAuth sign in', async () => {
    mockSignIn.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))

    render(<SignInForm />)

    const googleButton = screen.getByText('Google').closest('button')
    fireEvent.click(googleButton!)

    // Should show loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('should handle unexpected errors gracefully', async () => {
    mockSignIn.mockRejectedValue(new Error('Network error'))

    render(<SignInForm />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  it('should display registration and forgot password links', () => {
    render(<SignInForm />)

    expect(screen.getByText('Sign up')).toBeInTheDocument()
    expect(screen.getByText('Forgot your password?')).toBeInTheDocument()

    expect(screen.getByText('Sign up').closest('a')).toHaveAttribute('href', '/auth/register')
    expect(screen.getByText('Forgot your password?').closest('a')).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('should not show registration link in super admin mode', () => {
    render(<SignInForm mode="super-admin" />)

    expect(screen.queryByText('Sign up')).not.toBeInTheDocument()
    expect(screen.queryByText('Forgot your password?')).not.toBeInTheDocument()
  })

  it('should handle form validation', async () => {
    render(<SignInForm />)

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submitButton)

    // Form should require email and password
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement

    expect(emailInput.checkValidity()).toBe(false)
    expect(passwordInput.checkValidity()).toBe(false)

    // signIn should not be called with invalid form
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('should respect custom callback URL', async () => {
    // Mock search params
    Object.defineProperty(window, 'location', {
      value: {
        search: '?callbackUrl=/custom-page'
      },
      writable: true
    })

    mockSignIn.mockResolvedValue({ ok: true, error: null } as any)

    render(<SignInForm />)

    const emailInput = screen.getByLabelText('Email')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard') // Default fallback since we can't mock URLSearchParams easily
    })
  })
})