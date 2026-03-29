'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'

interface SidebarItem {
  name: string
  href: string
  icon: keyof typeof Icons
  permission?: string
  children?: SidebarItem[]
}

const navigationItems: Record<string, SidebarItem[]> = {
  // Super Admin Navigation
  'super-admin': [
    { name: 'Dashboard', href: '/admin/dashboard', icon: 'home' },
    { name: 'Organizations', href: '/admin/organizations', icon: 'building' },
    { name: 'Users', href: '/admin/users', icon: 'users' },
    { name: 'System Settings', href: '/admin/settings', icon: 'settings' },
    { name: 'Audit Logs', href: '/admin/audit', icon: 'shield' },
  ],

  // Warehouse Owner/Manager Navigation
  'warehouse': [
    { name: 'Dashboard', href: '/dashboard', icon: 'home' },
    { name: 'Warehouses', href: '/warehouses', icon: 'warehouse' },
    { name: 'Inventory', href: '/inventory', icon: 'package' },
    { name: 'Orders', href: '/orders', icon: 'truck' },
    { name: 'Analytics', href: '/analytics', icon: 'barChart3' },
    { name: 'Team', href: '/team', icon: 'users' },
    { name: 'Settings', href: '/settings', icon: 'settings' },
  ],

  // E-bike Business Navigation
  'ebike-business': [
    { name: 'Dashboard', href: '/dashboard', icon: 'home' },
    { name: 'Fleet Management', href: '/fleet', icon: 'truck' },
    { name: 'Bookings', href: '/bookings', icon: 'calendar' },
    { name: 'Customers', href: '/customers', icon: 'users' },
    { name: 'Analytics', href: '/analytics', icon: 'barChart3' },
    { name: 'Team', href: '/team', icon: 'users' },
    { name: 'Settings', href: '/settings', icon: 'settings' },
  ],

  // Customer Navigation
  'customer': [
    { name: 'Dashboard', href: '/dashboard', icon: 'home' },
    { name: 'My Bookings', href: '/bookings', icon: 'calendar' },
    { name: 'History', href: '/history', icon: 'clock' },
    { name: 'Profile', href: '/profile', icon: 'user' },
  ],
}

export function Sidebar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!session?.user) return null

  // Determine navigation based on user roles and organization type
  const getNavigation = (): SidebarItem[] => {
    // Super admin navigation
    if (session.user.roles?.some(role => ['super-admin', 'platform-admin'].includes(role.slug))) {
      return navigationItems['super-admin']
    }

    // Organization-specific navigation
    const orgType = session.user.organization?.type?.toLowerCase()
    if (orgType === 'warehouse') {
      return navigationItems['warehouse']
    } else if (orgType === 'ebike_business') {
      return navigationItems['ebike-business']
    } else if (orgType === 'customer') {
      return navigationItems['customer']
    }

    // Default navigation
    return navigationItems['customer']
  }

  const navigation = getNavigation()

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  return (
    <div className={cn(
      "bg-card border-r border-border h-full flex flex-col transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {!isCollapsed && (
            <>
              <Icons.logo className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">
                  {session.user.organization?.name || 'Skidspace'}
                </h2>
                <p className="text-xs text-muted-foreground capitalize truncate">
                  {session.user.organization?.type?.replace('_', ' ').toLowerCase() || 'Platform'}
                </p>
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex-shrink-0"
          >
            <Icons.chevronLeft className={cn(
              "h-4 w-4 transition-transform",
              isCollapsed && "rotate-180"
            )} />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navigation.map((item) => {
          const Icon = Icons[item.icon]
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}>
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* User Section */}
      <div className="p-2 border-t border-border">
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg",
          isCollapsed ? "justify-center" : "justify-between"
        )}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="flex-shrink-0"
            title="Sign Out"
          >
            <Icons.logOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Role Badges */}
        {!isCollapsed && session.user.roles && session.user.roles.length > 0 && (
          <div className="mt-2 space-y-1">
            {session.user.roles.slice(0, 2).map((role) => (
              <div
                key={role.id}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground mr-1"
              >
                {role.name}
              </div>
            ))}
            {session.user.roles.length > 2 && (
              <div className="text-xs text-muted-foreground">
                +{session.user.roles.length - 2} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}