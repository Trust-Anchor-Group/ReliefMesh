/** Evidence predicates: these never execute a Neuro operation. */
export function contractFullySigned(c:{state:string;roles:{Name:string;MinCount:number}[];signatures:{actor:string;role:string}[]}){
 return c.state==='Signed'&&c.signatures.some(s=>s.actor==='A')&&c.signatures.some(s=>s.actor==='B')&&c.roles.every(r=>c.signatures.filter(s=>s.role===r.Name).length>=r.MinCount);
}
export function paymentEvidence(v:Record<string,unknown>,amount:number,currency:string,recipients:string[],before:{A:number;B:number},after:{A:number;B:number}){
 const processed=typeof v.Processed==='number'?v.Processed*1000:typeof v.Processed==='string'?Date.parse(v.Processed):NaN;
 return v.Success===true&&typeof v.Id==='string'&&v.Id.length>0&&Number.isFinite(processed)&&processed>0&&v.Amount===amount&&v.Currency===currency&&typeof v.To==='string'&&recipients.includes(v.To)&&Math.abs(before.A-after.A-amount)<0.000001&&Math.abs(after.B-before.B-amount)<0.000001;
}
