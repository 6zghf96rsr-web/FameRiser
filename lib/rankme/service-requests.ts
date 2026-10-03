import {z} from 'zod';
export const requestKinds={withdrawal:'Odstoupit od smlouvy',refund:'Reklamace / vrácení platby',appeal:'Odvolání proti rozhodnutí',country:'Ověřit nebo změnit zemi profilu'};
export const serviceRequestInput=z.object({
 request_id:z.string().uuid(),kind:z.enum(['withdrawal','refund','appeal','country']),
 email:z.string().trim().email().max(254),name:z.string().trim().min(2).max(150),
 reference:z.string().trim().min(3).max(200),details:z.string().trim().max(10000).default(''),
 country:z.string().regex(/^[A-Z]{2}$/).optional(),
}).strict().superRefine((v,c)=>{if(v.kind==='country'&&!v.country)c.addIssue({code:'custom',path:['country'],message:'Vyber zemi.'});if(v.kind==='appeal'&&v.details.length<20)c.addIssue({code:'custom',path:['details'],message:'Doplň důvod přezkumu alespoň 20 znaky.'});});
