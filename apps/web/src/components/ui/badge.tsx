import React from 'react'

export const Badge = ({ children, className, ...props }: any) => (
  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ${className || ''}`} {...props}>
    {children}
  </span>
)
