/// <reference types="next" />

import type { NextApiRequest as NextReq, NextApiResponse as NextRes } from 'next'
import type { GetServerSideProps, GetServerSidePropsContext, NextPage } from 'next'

declare global {
  type NextApiRequest = NextReq
  type NextApiResponse<T = any> = NextRes<T>
  
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test'
      PROJECT_ID: string
      NEXT_TELEMETRY_DISABLED: string
    }
  }
}