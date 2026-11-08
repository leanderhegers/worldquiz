// Mobil-Anpassung: lange Ziele (Ländernamen, Trivia-Fragen, Namen in den Eintipp-Quizzen) werden nie mehr abgeschnitten.
// Der Text darf umbrechen; reicht das nicht, wird die Schrift stufenweise verkleinert (Mindestgröße), erst danach wird gekürzt.
// Beobachtet Textänderungen, Größenänderungen (Drehen, Tastatur) und das Einblenden der Bildschirme.
(function(){
'use strict';
const TARGETS=[
  {id:'target-name',lines:3,min:13,max:21},
  {id:'reg-target-name',lines:3,min:13,max:21},
  {id:'iq-text',lines:3,min:18,max:34}
];
function fit(el,c){
  if(!el||!el.offsetParent&&getComputedStyle(el).position!=='fixed')return; // verborgen: später beim Einblenden
  el.style.fontSize=c.max+'px';
  let px=c.max,guard=30;
  const over=()=>el.scrollHeight>px*1.2*c.lines+1||el.scrollWidth>el.clientWidth+1;
  while(guard--&&px>c.min&&over()){px-=1;el.style.fontSize=px+'px';}
  el.style.webkitLineClamp='';
}
const pending=new Set();
function schedule(c){
  if(pending.has(c))return;pending.add(c);
  requestAnimationFrame(()=>{pending.delete(c);fit(document.getElementById(c.id),c);});
}
function init(){
  TARGETS.forEach(c=>{
    const el=document.getElementById(c.id);if(!el)return;
    new MutationObserver(()=>schedule(c)).observe(el,{childList:true,characterData:true,subtree:true});
    if(window.ResizeObserver)new ResizeObserver(()=>schedule(c)).observe(el.parentElement||el);
    schedule(c);
  });
  window.addEventListener('resize',()=>TARGETS.forEach(schedule));
  window.addEventListener('orientationchange',()=>setTimeout(()=>TARGETS.forEach(schedule),250));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
