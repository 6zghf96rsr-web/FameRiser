import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentConsent,CONSENT_SECONDS} from '../lib/rankme/cookie-consent.ts';
test('measurement permission requires an unexpired matching decision',()=>{
 const now=Date.now(), record=(choice,savedAt=now)=>JSON.stringify({choice,savedAt});
 assert.equal(currentConsent(record('analytics'),'rankme_analytics=yes',now),true);
 assert.equal(currentConsent(record('necessary'),'rankme_analytics=no',now),true);
 for(const [raw,cookie] of [[record('analytics',now-CONSENT_SECONDS*1000),'rankme_analytics=yes'],[record('analytics',now+1),'rankme_analytics=yes'],['analytics','rankme_analytics=yes'],[record('analytics'),''],[record('necessary'),'rankme_analytics=yes'],['invalid','rankme_analytics=yes']])assert.equal(currentConsent(raw,cookie,now),false);
});
