import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifiesCardExposure} from '../lib/rankme/card-exposure';
import {boardRequest,demoBoardPage} from '../lib/rankme/board-page';
import {demoProfiles} from '../lib/rankme/demo';
test('card exposures require an actual visible half, including first observer delivery',()=>{
 for(const ratio of [0,.001,.49,.499999,NaN])assert.equal(qualifiesCardExposure({isIntersecting:true,intersectionRatio:ratio}),false);
 for(const ratio of [.5,.75,1])assert.equal(qualifiesCardExposure({isIntersecting:true,intersectionRatio:ratio}),true);
 assert.equal(qualifiesCardExposure({isIntersecting:false,intersectionRatio:1}),false);
});
test('board requests clamp untrusted query parameters and demo retains full counts',()=>{
 const request=boardRequest({view:'full',page:'99999999999',query:'x'.repeat(1000),period:'garbage',country:'XX'},'Facebook');
 assert.equal(request.page,1);assert.equal(request.period,'all');assert.equal(request.country,'all');assert.equal(request.query.length,200);
 const result=demoBoardPage(demoProfiles,boardRequest({}));assert.equal(result.profiles.length,10);assert.equal(result.meta.total,20);assert.equal(result.meta.summary.count,20);
 const search=demoBoardPage(demoProfiles,boardRequest({query:demoProfiles[15].name}));assert.ok(search.profiles.some(p=>p.id===demoProfiles[15].id));assert.equal(search.meta.summary.count,20);
});
