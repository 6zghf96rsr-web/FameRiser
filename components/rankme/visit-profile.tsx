"use client";
import { ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/lib/rankme/config';
export function VisitProfile({profile, demo, className = ''}: {profile: Profile; demo: boolean; className?: string}) {
  const label = <>Navštívit profil <ArrowUpRight size={16} /></>;
  return demo ? <Button className={className} variant="outline" onClick={() => toast('Fiktivní demo profil nemá skutečný účet na sociální síti.')}>{label}</Button> :
    <Button className={className} variant="outline" asChild><a href={`/api/outbound/${profile.id}`} target="_blank" rel="noopener noreferrer nofollow sponsored" aria-label={`Navštívit ${profile.name} na síti ${profile.platform}`}>{label}</a></Button>;
}
