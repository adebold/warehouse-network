import React from 'react'

export const Alert = ({ children, className, ...props }: any) => (
  <div role="alert" className={`p-4 border rounded ${className || ''}`} {...props}>
    {children}
  </div>
)

export const AlertTitle = ({ children, className, ...props }: any) => (
  <h5 className={`mb-1 font-medium leading-none tracking-tight ${className || ''}`} {...props}>
    {children}
  </h5>
)

export const AlertDescription = ({ children, className, ...props }: any) => (
  <div className={`text-sm ${className || ''}`} {...props}>
    {children}
  </div>
)
