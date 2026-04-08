// Simple auth module without Edge Runtime dependencies
export async function getServerSession() {
  return null
}

export async function getCurrentUser() {
  return null
}

export function isAuthenticated() {
  return false
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: []
}
