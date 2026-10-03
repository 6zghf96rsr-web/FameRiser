import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionOptions} from '../lib/rankme/connection-options';
import {authReturnPath} from '../lib/rankme/connections';
const status={ready:true,facebook:true,facebookPages:false,youtube:false,twitch:false,x:false,google:true,apple:true,unavailable:false};
test('account chooser exposes only active profile integrations, not login-only methods',()=>{
 assert.deepEqual(connectionOptions(status).filter(o=>o.available).map(o=>o.id),['facebook']);
 assert.equal(connectionOptions(status).some(o=>['google','apple'].includes(o.id)),false);
 assert.deepEqual(connectionOptions({...status,facebookPages:true,youtube:true}).filter(o=>o.available).map(o=>o.id),['facebook','facebookPages','youtube']);
 assert.equal(connectionOptions({...status,ready:false}).some(o=>o.available),false);
});
test('onboarding destinations preserve chooser and settings but reject arbitrary redirects',()=>{
 for(const path of ['/connections','/connections?add=1','/dashboard?tab=settings','/join?profile=22222222-2222-4222-8222-222222222222','/join?connection=22222222-2222-4222-8222-222222222222'])assert.equal(authReturnPath(path),path);
 for(const path of ['https://evil.test','//evil.test','/connections?next=https://evil.test','/dashboard?tab=settings&next=https://evil.test','/join?profile=not-an-id'])assert.equal(authReturnPath(path),'/dashboard');
});
