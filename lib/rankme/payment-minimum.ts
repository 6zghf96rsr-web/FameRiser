import {historicalFixing,usdMinimumMinor,MINIMUM_PAYMENT_USD_MINOR,cash,type PriceCurrency} from './commerce';
import {ServiceError} from './service-error';
export async function paymentMinimum(currency:PriceCurrency){
 if(currency==='USD')return {currency,minimum:MINIMUM_PAYMENT_USD_MINOR,usd_minimum:500,rate_date:null};
 try{
  const response=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('FX unavailable');
  const xml=await response.text(),at=new Date().toISOString();
  const usd=historicalFixing(xml,'USD',at),local=currency==='EUR'?{rate:'1',date:usd.date}:historicalFixing(xml,currency,at);
  if(usd.date!==local.date)throw new Error('Mismatched fixing');
  return {currency,minimum:usdMinimumMinor(currency,usd.rate,local.rate),usd_minimum:500,rate_date:usd.date};
 }catch{throw new ServiceError(503,'Minimum v této měně teď nelze přepočítat. Zvol USD, kde je první vklad i každé navýšení nejméně 5 USD.');}
}
export async function enforcePaymentMinimum(amount:number,currency:PriceCurrency){
 const quote=await paymentMinimum(currency);
 if(amount<quote.minimum)throw new ServiceError(400,`První vklad i každý příhoz musí být alespoň 5 USD, v této měně nyní ${cash(quote.minimum,currency)}. Uprav částku a znovu ji potvrď.`);
 return quote;
}
