// isIntersecting can be true below the observer's threshold on its first delivery.
export const CARD_VISIBLE_RATIO = .5;
export function qualifiesCardExposure(entry:{isIntersecting:boolean;intersectionRatio:number}) {
 return entry.isIntersecting && Number.isFinite(entry.intersectionRatio) && entry.intersectionRatio >= CARD_VISIBLE_RATIO;
}
