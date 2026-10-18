import { Database } from 'lucide-react';
import { cn } from '~/utils';

/** Unified Filestore glyph — a database icon used everywhere a filestore appears. */
export default function FilestoreIcon({ className }: { className?: string }) {
  return <Database className={cn('h-4 w-4 text-text-secondary', className)} aria-hidden="true" />;
}
