import {z} from 'zod';
import {POLICY_VERSION} from './policies';
export const priceCatalog={CZK:{min:1,max:500000,decimals:2},EUR:{min:1,max:20000,decimals:2},USD:{min:500,max:20000,decimals:2},PLN:{min:1,max:100000,decimals:2},JPY:{min:1,max:32000,decimals:0}} as const;
export const MINIMUM_PAYMENT_USD_MINOR=500;
export type PriceCurrency=keyof typeof priceCatalog;
export const cash=(minor:number,currency:string)=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency}).format(minor/10**(currency==='JPY'?0:2));
export const commerceInput=z.object({profile_id:z.string().uuid(),request_id:z.string().uuid(),amount:z.number().int(),currency:z.enum(['CZK','EUR','USD','PLN','JPY']),country:z.string().regex(/^[A-Z]{2}$/),accepted:z.literal(true),adult:z.literal(true),immediate:z.literal(true),non_political:z.literal(true),version:z.literal(POLICY_VERSION)}).strict().superRefine((v,c)=>{const p=priceCatalog[v.currency];if(v.amount<p.min||v.amount>p.max)c.addIssue({code:'custom',path:['amount'],message:`Částka musí být ${cash(p.min,v.currency)} až ${cash(p.max,v.currency)}. Vyšší platby vyžadují individuální posouzení.`});});
export function computeScore(netMinor:number,currency:PriceCurrency,rate:string){
 if(!Number.isSafeInteger(netMinor)||netMinor<0||!/^\d+(\.\d{1,8})?$/.test(rate))throw new Error('Invalid money or exchange rate');
 const [whole,fraction='']=rate.split('.');const numerator=BigInt(whole+fraction);if(numerator<=BigInt(0))throw new Error('Invalid rate');
 const denominator=BigInt(10)**BigInt(fraction.length);
 const score=BigInt(netMinor)*BigInt(1000000)*denominator/(BigInt(10)**BigInt(priceCatalog[currency].decimals)*numerator);
 const result=Number(score);if(!Number.isSafeInteger(result))throw new Error('Score overflow');return result;
}
export function remainingScore(original:number,gross:number,refund:number){if(![original,gross,refund].every(Number.isSafeInteger)||gross<=0||refund<0||refund>gross||original<0)throw new Error('Invalid refund');return Number(BigInt(original)*BigInt(gross-refund)/BigInt(gross));}
export function launchBlockers(env:Record<string,string|undefined>){return ['PAYMENTS_ENABLED','DODO_APPROVED','LEGAL_REVIEW_APPROVED','LEGACY_RANKING_RECONCILED'].filter(k=>env[k]!=='true').concat(['BUSINESS_NAME','BUSINESS_ADDRESS','BUSINESS_ID','SUPPORT_EMAIL','DODO_PAYMENTS_API_KEY','DODO_PAYMENTS_WEBHOOK_KEY'].filter(k=>!env[k]));}
// ECB currency units per EUR. Use the last published fixing available on the payment date.
export function historicalFixing(xml:string,currency:PriceCurrency,at:string){const day=at.slice(0,10);if(currency==='EUR')return {date:day,rate:'1'};
 const cubes=[...xml.matchAll(/<Cube time=['"]([\d-]+)['"]>([\s\S]*?)<\/Cube>/g)].filter(m=>m[1]<day).sort((a,b)=>b[1].localeCompare(a[1]));
 const cube=cubes[0];if(!cube||Date.parse(day)-Date.parse(cube[1])>7*86400000)throw new Error('Historical FX unavailable');
 const m=new RegExp(`<Cube currency=['"]${currency}['"] rate=['"]([0-9.]+)['"]`).exec(cube[2]);if(!m)throw new Error('Currency not supported');return {date:cube[1],rate:m[1]};
}

// Exact ceiling to a local minor unit: never round the USD 5 minimum down.
export function usdMinimumMinor(currency:PriceCurrency,usdPerEur:string,localPerEur:string){
 const fixed=(rate:string)=>{if(!/^\d+(\.\d{1,8})?$/.test(rate))throw new Error('Invalid exchange rate');const [a,b='']=rate.split('.');const n=BigInt(a+b.padEnd(8,'0'));if(n<=BigInt(0))throw new Error('Invalid exchange rate');return n;};
 const numerator=BigInt(MINIMUM_PAYMENT_USD_MINOR)*fixed(localPerEur)*BigInt(10)**BigInt(priceCatalog[currency].decimals);
 const denominator=BigInt(100)*fixed(usdPerEur);
 const result=Number((numerator+denominator-BigInt(1))/denominator);
 if(!Number.isSafeInteger(result)||result<=0||result>priceCatalog[currency].max)throw new Error('Invalid payment minimum');
 return result;
}
