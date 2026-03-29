'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sidebar } from './sidebar';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 w-80 h-full max-h-screen">
        <Sidebar />
      </DialogContent>
    </Dialog>
  );
}