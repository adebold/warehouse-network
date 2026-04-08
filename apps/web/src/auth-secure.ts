// Secure auth configuration stub
export const auth = () => null
export const signIn = () => null
export const signOut = () => null
export const handlers = {
  GET: () => new Response('Auth not configured', { status: 500 }),
  POST: () => new Response('Auth not configured', { status: 500 })
}
export default auth
