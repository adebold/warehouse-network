import type { NextApiRequest as NextReq, NextApiResponse as NextRes } from 'next'
import type { NextPage as NP } from 'next'

declare global {
  type NextApiRequest = NextReq
  type NextApiResponse<T = any> = NextRes<T>
  type NextPage<P = {}, IP = P> = NP<P, IP>
  
  // NextRequest is from next/server
  type NextRequest = import('next/server').NextRequest
}