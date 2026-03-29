import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function HomePage() {
  const session = await auth()

  if (session?.user) {
    // Redirect authenticated users to dashboard
    redirect('/dashboard')
  }

  // Redirect unauthenticated users to sign in
  redirect('/auth/signin')
}