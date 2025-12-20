import React, { useState } from 'react'
import { cn } from '@/lib/utils'

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string
  onLoadingComplete?: () => void
}

export const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  ({ className, fallback, onLoadingComplete, onError, ...props }, ref) => {
    const [error, setError] = useState(false)
    const [loaded, setLoaded] = useState(false)

    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setError(true)
      onError?.(e)
    }

    const handleLoad = () => {
      setLoaded(true)
      onLoadingComplete?.()
    }

    if (error && fallback) {
      return (
        <img
          ref={ref}
          className={className}
          src={fallback}
          alt={props.alt}
          onError={(e) => {
            // If fallback also fails, hide the image
            e.currentTarget.style.display = 'none'
          }}
        />
      )
    }

    return (
      <>
        {!loaded && (
          <div 
            className={cn(
              "animate-pulse bg-muted",
              className
            )}
            style={{ aspectRatio: props.width && props.height ? `${props.width}/${props.height}` : undefined }}
          />
        )}
        <img
          ref={ref}
          className={cn(
            className,
            !loaded && 'sr-only'
          )}
          onError={handleError}
          onLoad={handleLoad}
          {...props}
        />
      </>
    )
  }
)

Image.displayName = 'Image'

// Placeholder image generator
export function getPlaceholderImage(width: number, height: number, text?: string) {
  return `https://via.placeholder.com/${width}x${height}?text=${encodeURIComponent(text || 'Image')}`
}