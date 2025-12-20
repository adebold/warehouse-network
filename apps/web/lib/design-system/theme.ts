/**
 * Theme Configuration
 * Provides light and dark theme configurations with semantic color mappings
 */

import { tokens } from './tokens'

export type Theme = {
  name: 'light' | 'dark'
  colors: {
    // Background colors
    background: {
      primary: string
      secondary: string
      tertiary: string
      elevated: string
      overlay: string
    }
    
    // Foreground colors
    foreground: {
      primary: string
      secondary: string
      tertiary: string
      disabled: string
      inverse: string
    }
    
    // Border colors
    border: {
      default: string
      light: string
      dark: string
      focus: string
    }
    
    // Interactive elements
    interactive: {
      primary: {
        default: string
        hover: string
        active: string
        disabled: string
      }
      secondary: {
        default: string
        hover: string
        active: string
        disabled: string
      }
      tertiary: {
        default: string
        hover: string
        active: string
        disabled: string
      }
    }
    
    // Semantic colors
    semantic: {
      success: {
        default: string
        light: string
        dark: string
      }
      warning: {
        default: string
        light: string
        dark: string
      }
      error: {
        default: string
        light: string
        dark: string
      }
      info: {
        default: string
        light: string
        dark: string
      }
    }
  }
}

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: {
      primary: tokens.colors.neutral[0],
      secondary: tokens.colors.neutral[50],
      tertiary: tokens.colors.neutral[100],
      elevated: tokens.colors.neutral[0],
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    foreground: {
      primary: tokens.colors.neutral[900],
      secondary: tokens.colors.neutral[700],
      tertiary: tokens.colors.neutral[600],
      disabled: tokens.colors.neutral[400],
      inverse: tokens.colors.neutral[0],
    },
    border: {
      default: tokens.colors.neutral[200],
      light: tokens.colors.neutral[100],
      dark: tokens.colors.neutral[300],
      focus: tokens.colors.primary[500],
    },
    interactive: {
      primary: {
        default: tokens.colors.primary[600],
        hover: tokens.colors.primary[700],
        active: tokens.colors.primary[800],
        disabled: tokens.colors.primary[300],
      },
      secondary: {
        default: tokens.colors.secondary[200],
        hover: tokens.colors.secondary[300],
        active: tokens.colors.secondary[400],
        disabled: tokens.colors.secondary[100],
      },
      tertiary: {
        default: 'transparent',
        hover: tokens.colors.neutral[100],
        active: tokens.colors.neutral[200],
        disabled: 'transparent',
      },
    },
    semantic: {
      success: {
        default: tokens.colors.success[600],
        light: tokens.colors.success[100],
        dark: tokens.colors.success[800],
      },
      warning: {
        default: tokens.colors.warning[600],
        light: tokens.colors.warning[100],
        dark: tokens.colors.warning[800],
      },
      error: {
        default: tokens.colors.error[600],
        light: tokens.colors.error[100],
        dark: tokens.colors.error[800],
      },
      info: {
        default: tokens.colors.info[600],
        light: tokens.colors.info[100],
        dark: tokens.colors.info[800],
      },
    },
  },
}

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: {
      primary: tokens.colors.neutral[950],
      secondary: tokens.colors.neutral[900],
      tertiary: tokens.colors.neutral[800],
      elevated: tokens.colors.neutral[900],
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
    foreground: {
      primary: tokens.colors.neutral[50],
      secondary: tokens.colors.neutral[200],
      tertiary: tokens.colors.neutral[300],
      disabled: tokens.colors.neutral[600],
      inverse: tokens.colors.neutral[900],
    },
    border: {
      default: tokens.colors.neutral[800],
      light: tokens.colors.neutral[900],
      dark: tokens.colors.neutral[700],
      focus: tokens.colors.primary[400],
    },
    interactive: {
      primary: {
        default: tokens.colors.primary[500],
        hover: tokens.colors.primary[400],
        active: tokens.colors.primary[300],
        disabled: tokens.colors.primary[800],
      },
      secondary: {
        default: tokens.colors.secondary[800],
        hover: tokens.colors.secondary[700],
        active: tokens.colors.secondary[600],
        disabled: tokens.colors.secondary[900],
      },
      tertiary: {
        default: 'transparent',
        hover: tokens.colors.neutral[800],
        active: tokens.colors.neutral[700],
        disabled: 'transparent',
      },
    },
    semantic: {
      success: {
        default: tokens.colors.success[500],
        light: tokens.colors.success[900],
        dark: tokens.colors.success[300],
      },
      warning: {
        default: tokens.colors.warning[500],
        light: tokens.colors.warning[900],
        dark: tokens.colors.warning[300],
      },
      error: {
        default: tokens.colors.error[500],
        light: tokens.colors.error[900],
        dark: tokens.colors.error[300],
      },
      info: {
        default: tokens.colors.info[500],
        light: tokens.colors.info[900],
        dark: tokens.colors.info[300],
      },
    },
  },
}

// CSS Variable mapping for runtime theme switching
export const generateCSSVariables = (theme: Theme) => {
  return {
    // Primary palette
    '--primary': theme.colors.interactive.primary.default,
    '--primary-foreground': theme.colors.background.primary,
    
    // Secondary palette
    '--secondary': theme.colors.interactive.secondary.default,
    '--secondary-foreground': theme.colors.foreground.primary,
    
    // Muted palette
    '--muted': theme.colors.background.tertiary,
    '--muted-foreground': theme.colors.foreground.tertiary,
    
    // Accent palette
    '--accent': theme.colors.background.secondary,
    '--accent-foreground': theme.colors.foreground.primary,
    
    // Destructive palette
    '--destructive': theme.colors.semantic.error.default,
    '--destructive-foreground': theme.colors.background.primary,
    
    // Success palette
    '--success': theme.colors.semantic.success.default,
    '--success-foreground': theme.colors.background.primary,
    
    // Warning palette
    '--warning': theme.colors.semantic.warning.default,
    '--warning-foreground': theme.colors.background.primary,
    
    // Info palette
    '--info': theme.colors.semantic.info.default,
    '--info-foreground': theme.colors.background.primary,
    
    // Border
    '--border': theme.colors.border.default,
    '--input': theme.colors.border.default,
    '--ring': theme.colors.border.focus,
    
    // Backgrounds
    '--background': theme.colors.background.primary,
    '--background-secondary': theme.colors.background.secondary,
    '--background-tertiary': theme.colors.background.tertiary,
    '--foreground': theme.colors.foreground.primary,
    
    // Card
    '--card': theme.colors.background.elevated,
    '--card-foreground': theme.colors.foreground.primary,
    
    // Popover
    '--popover': theme.colors.background.elevated,
    '--popover-foreground': theme.colors.foreground.primary,
    
    // Radius
    '--radius': tokens.radii.lg,
  }
}

// Theme context helper
export const getThemeFromLocalStorage = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light'
  
  const stored = localStorage.getItem('theme')
  if (stored === 'dark' || stored === 'light') return stored
  
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  
  return 'light'
}

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  const variables = generateCSSVariables(theme)
  
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  
  root.setAttribute('data-theme', theme.name)
  localStorage.setItem('theme', theme.name)
}