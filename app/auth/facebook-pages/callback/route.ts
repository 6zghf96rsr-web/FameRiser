import { NextResponse } from 'next/server';
import { finishFacebookPages } from '@/lib/rankme/facebook-pages-server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const origin=new URL(process.env.APP_URL || req.url).origin;
  if(new URL(req.url).origin!==origin)return NextResponse.redirect(origin+'/connections?result=facebook-pages-failed',{headers:{'Cache-Control':'no-store'}});
  let result='facebook-pages-failed';
  try{result=await finishFacebookPages(req);}catch{/* Never include Meta codes, tokens or request URLs in logs or redirects. */}
  return NextResponse.redirect(origin+'/connections?result='+result,{headers:{'Cache-Control':'no-store'}});
}
