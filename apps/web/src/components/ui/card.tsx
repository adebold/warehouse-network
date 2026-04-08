import React from 'react'

export const Card = ({ children, className, ...props }: any) => (
  <div className={`p-6 border rounded-lg bg-white shadow-sm ${className || ''}`} {...props}>
    {children}
  </div>
)

export const CardHeader = ({ children, className, ...props }: any) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className || ''}`} {...props}>
    {children}
  </div>
)

export const CardTitle = ({ children, className, ...props }: any) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className || ''}`} {...props}>
    {children}
  </h3>
)

export const CardContent = ({ children, className, ...props }: any) => (
  <div className={`p-6 pt-0 ${className || ''}`} {...props}>
    {children}
  </div>
)

export const CardDescription = ({ children, className, ...props }: any) => (
  <p className={`text-sm text-gray-500 ${className || ''}`} {...props}>
    {children}
  </p>
)

export const CardFooter = ({ children, className, ...props }: any) => (
  <div className={`flex items-center p-6 pt-0 ${className || ''}`} {...props}>
    {children}
  </div>
)
