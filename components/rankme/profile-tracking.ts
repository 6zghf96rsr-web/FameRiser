"use client";
import { useEffect } from 'react';
import { CARD_VISIBLE_RATIO, qualifiesCardExposure } from '@/lib/rankme/card-exposure';
import { nameExposureTracker } from '@/lib/rankme/name-exposure';

export function useProfileTracking(ids: string[], demo: boolean, source: string, context: string, detail = false) {
  const key = ids.join(',');
  useEffect(() => {
    if (demo || !key) return;
    const eventId = crypto.randomUUID();
    const seen = new Set<string>();
    let pageSent = false;
    const send = (kind: string, batch: string[]) => {
      if (!document.cookie.split(';').some(c => c.trim() === 'rankme_analytics=yes') || document.visibilityState !== 'visible') return;
      for (let start = 0; start < batch.length; start += 50) {
        void fetch('/api/track', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind, ids:batch.slice(start,start+50),event_id:eventId,source}),keepalive:true}).catch(() => {});
      }
    };
    const observer = new IntersectionObserver(entries => {
      const batch = entries.filter(qualifiesCardExposure).map(e => (e.target as HTMLElement).dataset.profileId!).filter(id => id && !seen.has(id));
      if (!document.cookie.split(';').some(c => c.trim() === 'rankme_analytics=yes') || document.visibilityState !== 'visible') return;
      batch.forEach(id => seen.add(id));
      send('impression',batch);
    }, {threshold:CARD_VISIBLE_RATIO});
    const names = new Map<string, HTMLElement>();
    const nameTracker = nameExposureTracker(id => send('name_impression',[id]), id => {
      if (document.visibilityState !== 'visible' || !document.cookie.split(';').some(c => c.trim() === 'rankme_analytics=yes')) return false;
      const el = names.get(id);
      if (!el?.isConnected) return false;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) return false;
      const foreground = document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
      return foreground !== null && el.contains(foreground);
    });
    const nameObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.profileNameId;
        if (id) nameTracker.observe(id,entry.isIntersecting && entry.intersectionRatio >= .999);
      }
    }, {threshold:[0,1]});
    const start = () => {
      nameTracker.pause(); nameObserver.disconnect(); observer.disconnect();
      if (!document.cookie.split(';').some(c => c.trim() === 'rankme_analytics=yes') || document.visibilityState !== 'visible') return;
      if (!pageSent) {send(detail ? 'profile_detail_view' : 'leaderboard_page_view',key.split(','));pageSent=true;}
      if (!detail) {observer.disconnect();document.querySelectorAll<HTMLElement>('[data-profile-id]').forEach(el => {if(key.split(',').includes(el.dataset.profileId!))observer.observe(el);});document.querySelectorAll<HTMLElement>('[data-profile-name-id]').forEach(el => {names.set(el.dataset.profileNameId!,el);nameObserver.observe(el);});}
    };
    const timer = setTimeout(start,350);
    window.addEventListener('rankme:consent-changed',start);
    document.addEventListener('visibilitychange',start);
    return () => {clearTimeout(timer);observer.disconnect();nameObserver.disconnect();nameTracker.pause();window.removeEventListener('rankme:consent-changed',start);document.removeEventListener('visibilitychange',start);};
  }, [key,demo,source,context,detail]);
}
