const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
export async function onRequestPost({request,env,waitUntil}){
 let d;try{d=JSON.parse(await request.text())}catch{return J({ok:0},400)}
 const id=String(d.id||'').slice(0,64),nome=String(d.nome||'').slice(0,80),wa=String(d.whatsapp||'').replace(/\D/g,'').slice(0,15);
 const estado=['progresso','saiu','completo'].includes(d.estado)?d.estado:'progresso';
 if(!id||nome.length<2||wa.length<9)return J({ok:0},400);
 const dados={fase:String(d.fase||'').slice(0,20),pilares:d.pilares||{},respostas:(Array.isArray(d.respostas)?d.respostas:[]).slice(0,25).map(x=>({p:String(x.p).slice(0,160),r:String(x.r).slice(0,60)}))};
 await env.DB.prepare('INSERT INTO leads(id,nome,whatsapp,estado,dados,atualizado) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET nome=?2,whatsapp=?3,estado=?4,dados=?5,atualizado=?6').bind(id,nome,wa,estado,JSON.stringify(dados),new Date().toISOString()).run();
 if(estado!=='progresso'){const r=await env.DB.prepare('SELECT enviado FROM leads WHERE id=?1').bind(id).first();
  if(r&&r.enviado!==estado)waitUntil(enviar(env,id,nome,wa,estado,dados))}
 return J({ok:1})}
async function enviar(env,id,nome,wa,estado,d){
 const tit=estado==='completo'?'Diagnóstico COMPLETO':'Saiu a meio do diagnóstico',link='https://wa.me/'+wa;
 const L=[tit,'','Nome: '+nome,'WhatsApp: '+wa,'Fase da empresa: '+d.fase,'Data: '+new Date().toISOString().slice(0,16).replace('T',' '),'','Pilares (%):',...Object.entries(d.pilares).map(([k,v])=>'  '+k+': '+v+'%'),'','Respostas:',...d.respostas.map(x=>'- '+x.p+' => '+x.r)];
 const pdf=mkPdf(L),cap=tit+': '+nome+' ('+wa+')';
 const tg=()=>{const f=new FormData();f.append('chat_id',env.TG_CHAT);f.append('caption',cap);f.append('reply_markup',JSON.stringify({inline_keyboard:[[{text:'Abrir WhatsApp',url:link}]]}));f.append('document',new Blob([pdf],{type:'application/pdf'}),'diagnostico.pdf');return fetch('https://api.telegram.org/bot'+env.TG_TOKEN+'/sendDocument',{method:'POST',body:f})};
 const em=()=>fetch('https://api.resend.com/emails',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.RESEND_KEY},body:JSON.stringify({from:env.EMAIL_FROM,to:[env.EMAIL_TO],subject:cap,html:'<p>'+cap+'</p><p><a href="'+link+'">Abrir conversa no WhatsApp</a></p>',attachments:[{filename:'diagnostico.pdf',content:btoa(pdf)}]})});
 const [a,b]=await Promise.allSettled([tg(),em()]);
 if((a.status==='fulfilled'&&a.value.ok)||(b.status==='fulfilled'&&b.value.ok))await env.DB.prepare('UPDATE leads SET enviado=?2 WHERE id=?1').bind(id,estado).run()}
function mkPdf(lines){
 const e=s=>[...s].map(c=>{const n=c.charCodeAt(0);return n>255?'?':(n>126||n<32||c==='('||c===')'||c==='\\')?'\\'+n.toString(8).padStart(3,'0'):c}).join('');
 const rows=[];for(const l of lines){let t=l;do{rows.push(t.slice(0,88));t=t.slice(88)}while(t)}
 const pages=[];for(let i=0;i<rows.length;i+=50)pages.push(rows.slice(i,i+50));
 const o=[];o[1]='<</Type/Catalog/Pages 2 0 R>>';o[3]='<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>';const kids=[];
 pages.forEach((p,i)=>{const c=4+i*2,pg=c+1;kids.push(pg+' 0 R');const s='BT /F1 10 Tf 14 TL 50 800 Td '+p.map(r=>'('+e(r)+') Tj T*').join(' ')+' ET';
  o[c]='<</Length '+s.length+'>>\nstream\n'+s+'\nendstream';o[pg]='<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents '+c+' 0 R/Resources<</Font<</F1 3 0 R>>>>>>'});
 o[2]='<</Type/Pages/Kids['+kids.join(' ')+']/Count '+kids.length+'>>';
 let out='%PDF-1.4\n';const off=[];for(let i=1;i<o.length;i++){off[i]=out.length;out+=i+' 0 obj\n'+o[i]+'\nendobj\n'}
 const x=out.length;return out+'xref\n0 '+o.length+'\n0000000000 65535 f \n'+off.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<</Size '+o.length+'/Root 1 0 R>>\nstartxref\n'+x+'\n%%EOF'}
