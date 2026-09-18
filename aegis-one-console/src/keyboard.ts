let uxActiveDialog:HTMLElement|null=null,uxReturnFocus:HTMLElement|null=null;
new MutationObserver(()=>{
 const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));const next=dialogs.at(-1)||null;
 if(next===uxActiveDialog)return;
 if(next){if(!uxActiveDialog)uxReturnFocus=document.activeElement as HTMLElement;uxActiveDialog=next;requestAnimationFrame(()=>{if(next.isConnected)(next.querySelector<HTMLElement>('button,input,select,[tabindex="0"]')||next).focus()})}
 else{uxActiveDialog=null;uxReturnFocus?.isConnected&&uxReturnFocus.focus();uxReturnFocus=null}
}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('keydown',e=>{
 const target=e.target;if(!(target instanceof HTMLElement))return;
 if((e.key==='Enter'||e.key===' ')&&target.matches('[data-ux-keyboard]')){e.preventDefault();target.click()}
 if(target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const tabs=Array.from(target.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')||[]);if(!tabs.length)return;let index=tabs.indexOf(target);index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;e.preventDefault();tabs[index].focus();tabs[index].click()}
 if(e.key==='Tab'&&uxActiveDialog){const nodes=Array.from(uxActiveDialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||!uxActiveDialog.contains(document.activeElement))){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||!uxActiveDialog.contains(document.activeElement))){e.preventDefault();first.focus()}}
});
