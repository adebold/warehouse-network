import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface NavItem {
  title: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
  icon?: React.ReactNode;
  label?: string;
  children?: NavItem[];
}

interface NavigationMenuProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  orientation?: 'horizontal' | 'vertical';
}

export function NavigationMenu({
  items,
  orientation = 'horizontal',
  className,
  ...props
}: NavigationMenuProps) {
  const router = useRouter();

  const navClasses = {
    horizontal: 'flex items-center space-x-6',
    vertical: 'flex flex-col space-y-2',
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = item.href && router.pathname === item.href;

    if (!item.href) {
      return (
        <span
          className={cn(
            'text-muted-foreground text-sm font-medium',
            item.disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          {item.icon && <span className="mr-2 inline-block">{item.icon}</span>}
          {item.title}
        </span>
      );
    }

    const linkContent = (
      <>
        {item.icon && <span className="mr-2 inline-block">{item.icon}</span>}
        {item.title}
        {item.label && (
          <span className="bg-primary/10 text-primary ml-2 rounded-md px-1.5 py-0.5 text-xs">
            {item.label}
          </span>
        )}
      </>
    );

    if (item.external) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'hover:text-primary text-sm font-medium transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground',
            item.disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          {linkContent}
        </a>
      );
    }

    return (
      <Link
        href={item.href}
        className={cn(
          'hover:text-primary text-sm font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground',
          item.disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        {linkContent}
      </Link>
    );
  };

  return (
    <nav className={cn(navClasses[orientation], className)} {...props}>
      {items.map((item, index) => (
        <div key={index}>
          {renderNavItem(item)}
          {item.children && (
            <NavigationMenu items={item.children} orientation={orientation} className="ml-4 mt-2" />
          )}
        </div>
      ))}
    </nav>
  );
}

interface MobileNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  items: NavItem[];
  logo?: React.ReactNode;
}

export function MobileNavigation({ items, logo, className, ...props }: MobileNavigationProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className={cn('lg:hidden', className)} {...props}>
      <div className="flex items-center justify-between p-4">
        {logo}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {isOpen && (
        <div className="bg-background fixed inset-x-0 top-16 z-50 h-[calc(100vh-4rem)] border-t">
          <NavigationMenu items={items} orientation="vertical" className="p-4" />
        </div>
      )}
    </div>
  );
}

interface BreadcrumbItem {
  title: string;
  href?: string;
}

interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
}

export function Breadcrumb({ items, separator = '/', className, ...props }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center space-x-2 text-sm', className)}
      {...props}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="text-muted-foreground">{separator}</span>}
          {item.href && index < items.length - 1 ? (
            <Link
              href={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.title}
            </Link>
          ) : (
            <span
              className={cn(
                index === items.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
              )}
            >
              {item.title}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

interface TabItem {
  title: string;
  value: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface TabNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
}

export function TabNavigation({
  items,
  value,
  onValueChange,
  className,
  ...props
}: TabNavigationProps) {
  return (
    <div
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1',
        className
      )}
      {...props}
    >
      {items.map(item => (
        <button
          key={item.value}
          onClick={() => !item.disabled && onValueChange(item.value)}
          disabled={item.disabled}
          className={cn(
            'ring-offset-background focus-visible:ring-ring inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            value === item.value
              ? 'bg-background text-foreground shadow-sm'
              : 'hover:text-foreground',
            item.disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {item.icon && <span className="mr-2">{item.icon}</span>}
          {item.title}
        </button>
      ))}
    </div>
  );
}

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  items: NavItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function Sidebar({
  items,
  header,
  footer,
  collapsible = false,
  defaultCollapsed = false,
  className,
  ...props
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const router = useRouter();

  return (
    <aside
      className={cn(
        'bg-background flex h-full flex-col border-r transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
      {...props}
    >
      {header && (
        <div className="border-b p-4">
          {header}
          {collapsible && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {items.map((item, index) => {
            const isActive = item.href && router.pathname === item.href;

            return (
              <li key={index}>
                <Link
                  href={item.href || '#'}
                  className={cn(
                    'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground',
                    item.disabled && 'cursor-not-allowed opacity-60'
                  )}
                >
                  {item.icon && (
                    <span className={cn('shrink-0', !isCollapsed && 'mr-3')}>{item.icon}</span>
                  )}
                  {!isCollapsed && (
                    <>
                      <span className="flex-1">{item.title}</span>
                      {item.label && (
                        <span className="bg-primary/10 text-primary ml-auto rounded-md px-2 py-1 text-xs">
                          {item.label}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {footer && <div className="border-t p-4">{footer}</div>}
    </aside>
  );
}
