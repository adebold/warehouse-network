
import { Ban, Lock, AlertTriangle, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/router';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface AccountLockWarningProps {
  customer: {
    id: string;
    name: string;
    accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
    paymentStatus?: 'CURRENT' | 'OVERDUE' | 'DELINQUENT';
    lockReason?: string;
  };
  operation?: string;
  showManageButton?: boolean;
  className?: string;
}

export function AccountLockWarning({
  customer,
  operation,
  showManageButton = false,
  className = '',
}: AccountLockWarningProps) {
  const router = useRouter();

  if (customer.accountStatus === 'ACTIVE' && customer.paymentStatus !== 'DELINQUENT') {
    return null;
  }

  const getAlertVariant = () => {
    if (customer.accountStatus === 'LOCKED') {return 'destructive';}
    if (customer.accountStatus === 'SUSPENDED' || customer.paymentStatus === 'DELINQUENT')
      {return 'destructive';}
    return 'default';
  };

  const getIcon = () => {
    if (customer.accountStatus === 'LOCKED') {return <Lock className="h-4 w-4" />;}
    if (customer.accountStatus === 'SUSPENDED') {return <Ban className="h-4 w-4" />;}
    return <AlertTriangle className="h-4 w-4" />;
  };

  const getTitle = () => {
    if (customer.accountStatus === 'LOCKED') {return 'Account Locked';}
    if (customer.accountStatus === 'SUSPENDED') {return 'Account Suspended';}
    if (customer.paymentStatus === 'DELINQUENT') {return 'Payment Delinquent';}
    return 'Account Restriction';
  };

  const getDescription = () => {
    let desc = '';

    if (customer.accountStatus === 'LOCKED') {
      desc = `This customer's account is locked and cannot ${operation || 'perform this operation'}.`;
      if (customer.lockReason) {
        desc += ` Reason: ${customer.lockReason}`;
      }
    } else if (customer.accountStatus === 'SUSPENDED') {
      desc = `This customer's account is suspended with limited operations.`;
    } else if (customer.paymentStatus === 'DELINQUENT') {
      desc = `This customer has delinquent payments. New inventory cannot be received.`;
    }

    return desc;
  };

  return (
    <Alert variant={getAlertVariant()} className={className}>
      {getIcon()}
      <AlertTitle>{getTitle()}</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>{getDescription()}</p>
          {showManageButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin/customers/${customer.id}`)}
            >
              Manage Account
              <ExternalLink className="ml-2 h-3 w-3" />
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

interface InlineAccountStatusProps {
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  paymentStatus?: 'CURRENT' | 'OVERDUE' | 'DELINQUENT';
  size?: 'sm' | 'md';
}

export function InlineAccountStatus({
  accountStatus,
  paymentStatus,
  size = 'md',
}: InlineAccountStatusProps) {
  if (accountStatus === 'ACTIVE' && (!paymentStatus || paymentStatus === 'CURRENT')) {
    return null;
  }

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-2">
      {accountStatus === 'LOCKED' && (
        <div className={`text-destructive flex items-center gap-1 ${textSize}`}>
          <Lock className={iconSize} />
          <span className="font-medium">Locked</span>
        </div>
      )}
      {accountStatus === 'SUSPENDED' && (
        <div className={`text-warning flex items-center gap-1 ${textSize}`}>
          <Ban className={iconSize} />
          <span className="font-medium">Suspended</span>
        </div>
      )}
      {paymentStatus === 'DELINQUENT' && (
        <div className={`text-destructive flex items-center gap-1 ${textSize}`}>
          <AlertTriangle className={iconSize} />
          <span className="font-medium">Delinquent</span>
        </div>
      )}
    </div>
  );
}
