import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
const db = new PGlite();
const u = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const p = "10000000-0000-4000-8000-000000000001",
  q = "10000000-0000-4000-8000-000000000002";
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create publication supabase_realtime;create function public.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;`,
);
for (const file of [
  "001_rankme.sql",
  "002_admin.sql",
  "003_connections.sql",
  "004_private_accounts_and_ratings.sql",
  "005_verification_required.sql",
  "006_primary_platforms.sql",
  "007_add_x.sql",
  "008_fameriser_brand.sql",
  "009_profile_discovery.sql",
  "010_creator_insights_reviews.sql",
  "011_name_exposure.sql",
  "012_promo_placements.sql",
  "013_review_discussions.sql",
  "014_content_notices.sql",
  "015_service_safeguards.sql",
  "016_dodo_commerce.sql",
  "018_reasoned_admin_actions.sql",
  "019_score_timestamps.sql",
]) {
  let sql = await readFile(
    new URL("../supabase/migrations/" + file, import.meta.url),
    "utf8",
  );
  sql = sql.replace("create extension if not exists pgcrypto;", "");
  await db.exec(sql);
}
await db.query("insert into auth.users(id) values($1),($2)", [u, other]);
await db.query(
  `insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$3,'Test One','test.one','test-one','https://instagram.com/test.one','instagram','creators'),($2,$3,'Test Two','test.two','test-two','https://instagram.com/test.two','instagram','creators')`,
  [p, q, u],
);
// Trusted provider-proof fixtures; no browser or owner can write these rows.
const prove = async (owner, url) => query(
  "insert into social_connections(user_id,platform,social_url,label,status,method,verified_at) values($1,'Instagram',$2,'Test proof','verified','bio',now()) on conflict(user_id,platform,social_url) do update set status='verified',method='bio',verified_at=now() returning id",
  [owner, url],
);
await prove(u, 'https://instagram.com/test.one');
await prove(u, 'https://instagram.com/test.two');
const reserve = async (profile, total, request, user = u) =>
  (
    await query("select * from reserve_checkout($1,$2,$3,$4)", [
      user,
      profile,
      total,
      request,
    ])
  )[0];
const apply = async (pay, event, intent) => {
  await db.query("update payments set stripe_checkout_id=$1 where id=$2", [
    "cs_" + pay.id,
    pay.id,
  ]);
  return (
    await query(
      "select apply_stripe_payment($1,$2,$3,$4,$5,$6,$7) as applied",
      [
        event,
        "checkout.session.completed",
        pay.id,
        "cs_" + pay.id,
        intent,
        pay.amount,
        "czk",
      ],
    )
  )[0].applied;
};
await test("atomic checkout, webhook, ordering, refund and security integration", async (t) => {
  let first, second, boost;
  await t.test("new profile has no rank before verified payment", async () => {
    assert.equal((await query("select * from get_leaderboard()")).length, 0);
    first = await reserve(p, 100000, crypto.randomUUID());
    assert.equal(Number(first.amount), 100000);
    assert.equal((await query("select * from get_leaderboard()")).length, 0);
  });
  await t.test(
    "ownership and single pending checkout are enforced in PostgreSQL",
    async () => {
      await assert.rejects(() =>
        reserve(p, 200000, crypto.randomUUID(), other),
      );
      await assert.rejects(() => reserve(p, 200000, crypto.randomUUID()));
      assert.equal((await reserve(p, 100000, first.request_id)).id, first.id);
    },
  );
  await t.test(
    "first verified payment adds amount once, even under duplicate events",
    async () => {
      assert.equal(await apply(first, "evt_1", "pi_1"), true);
      assert.equal(await apply(first, "evt_1", "pi_1"), false);
      assert.equal(await apply(first, "evt_1_retry", "pi_1"), false);
      assert.equal(
        Number(
          (await query("select total_paid from profiles where id=$1", [p]))[0]
            .total_paid,
        ),
        100000,
      );
    },
  );
  await t.test("equal amount keeps earlier profile ahead", async () => {
    second = await reserve(q, 100000, crypto.randomUUID());
    await apply(second, "evt_2", "pi_2");
    const rows = await query("select * from get_leaderboard()");
    assert.deepEqual(
      rows.map((r) => r.id),
      [p, q],
    );
  });
  await t.test(
    "increase to 3000 Kč charges only 2000 Kč difference",
    async () => {
      boost = await reserve(q, 300000, crypto.randomUUID());
      assert.equal(Number(boost.amount), 200000);
      assert.equal(
        Number(
          (await query("select total_paid from profiles where id=$1", [q]))[0]
            .total_paid,
        ),
        100000,
      );
      await apply(boost, "evt_boost", "pi_boost");
      const rows = await query("select * from get_leaderboard()");
      assert.equal(rows[0].id, q);
      assert.equal(Number(rows[0].total_paid), 300000);
      const h = await query(
        "select * from rank_history where profile_id=$1 order by created_at desc",
        [p],
      );
      assert.equal(Number(h[0].new_rank), 2);
    },
  );
  await t.test(
    "mismatched amount rolls back, without consuming event ID",
    async () => {
      const pay = await reserve(p, 110000, crypto.randomUUID());
      await db.query("update payments set stripe_checkout_id=$1 where id=$2", [
        "cs_bad",
        pay.id,
      ]);
      await assert.rejects(() =>
        query("select apply_stripe_payment($1,$2,$3,$4,$5,$6,$7)", [
          "evt_bad",
          "checkout.session.completed",
          pay.id,
          "cs_bad",
          "pi_bad",
          1,
          "czk",
        ]),
      );
      assert.equal(
        (await query("select * from webhook_events where id='evt_bad'")).length,
        0,
      );
      assert.equal(
        Number(
          (await query("select total_paid from profiles where id=$1", [p]))[0]
            .total_paid,
        ),
        100000,
      );
    },
  );
  await t.test(
    "refunds are idempotent and correctly reduce ranking totals",
    async () => {
      await query("select apply_refund($1,$2,$3)", [
        "evt_refund",
        "pi_boost",
        200000,
      ]);
      await query("select apply_refund($1,$2,$3)", [
        "evt_refund_retry",
        "pi_boost",
        200000,
      ]);
      assert.equal(
        Number(
          (await query("select total_paid from profiles where id=$1", [q]))[0]
            .total_paid,
        ),
        100000,
      );
      assert.equal((await query("select * from get_leaderboard()"))[0].id, p);
    },
  );
  await t.test(
    "last 24 hours expire from Today without reducing All Time",
    async () => {
      await db.query(
        "update payments set paid_at=now()-interval '25 hours' where profile_id=$1",
        [p],
      );
      const row = (
        await query("select * from get_leaderboard() where id=$1", [p])
      )[0];
      assert.equal(Number(row.today_paid), 0);
      assert.equal(Number(row.total_paid), 100000);
    },
  );
  await t.test(
    "clients cannot write payment totals or call privileged RPCs",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec("set role " + role);
        await assert.rejects(() =>
          query("update public.profiles set total_paid=999999 where id=$1", [
            p,
          ]),
        );
        await assert.rejects(() => query("select * from public.payments"));
        await assert.rejects(() =>
          query("select * from public.get_leaderboard()"),
        );
        await db.exec("reset role");
      }
    },
  );
  await t.test(
    "admin authorization, settings and moderation produce audit records",
    async () => {
      await assert.rejects(() =>
        query("select admin_mutation($1,$2,$3,$4)", [
          u,
          "moderate",
          p,
          { status: "hidden" },
        ]),
      );
      await db.query("update users set role='admin' where id=$1", [u]);
      await query("select admin_mutation($1,$2,$3,$4)", [
        u,
        "moderate",
        p,
        { status: "hidden" },
      ]);
      assert.equal((await query("select * from get_leaderboard()")).length, 1);
      assert.equal((await query("select * from admin_actions")).length, 1);
      await assert.rejects(() =>
        query("select admin_mutation($1,$2,$3,$4)", [
          u,
          "settings",
          "public",
          { name: "RankMe", minimum: 0, increment: 0 },
        ]),
      );
    },
  );
  await t.test(
    "analytics deduplicates repeated impressions and rate limiting is atomic",
    async () => {
      await db.query(
        "insert into profile_views(profile_id,visitor_hash,kind) values($1,'test','impression') on conflict do nothing",
        [q],
      );
      await db.query(
        "insert into profile_views(profile_id,visitor_hash,kind) values($1,'test','impression') on conflict do nothing",
        [q],
      );
      assert.equal(
        (await query("select count(*) n from profile_views"))[0].n,
        1,
      );
      assert.equal(
        (await query("select consume_rate('test',1,60) ok"))[0].ok,
        true,
      );
      assert.equal(
        (await query("select consume_rate('test',1,60) ok"))[0].ok,
        false,
      );
    },
  );
});
await test("social connection ownership and proof lifecycle", async (t) => {
  const c = (await query("select id from social_connections where user_id=$1 and social_url='https://instagram.com/test.two'", [u]))[0].id;
  const act = async (who, action, id = c, value = {}) =>
    (await query("select connection_action($1,$2,$3,$4) result", [who, action, id, JSON.stringify(value)]))[0].result;
  const challenge = { id: crypto.randomUUID(), code: "retired-code" };
  await t.test("bio challenges and approvals are retired, even for admins", async () => {
    for (const action of ["challenge", "submit", "approve", "reject"])
      await assert.rejects(() => act(u, action));
  });
  await t.test("address changes and disconnect revoke public listing and ratings", async () => {
    await query("update profiles set social_url='https://instagram.com/another',verified=true where id=$1", [q]);
    assert.equal((await query("select verified from profiles where id=$1", [q]))[0].verified, false);
    assert.equal((await query("select is_public_profile($1) ok", [q]))[0].ok, false);
    await assert.rejects(() => query("select get_profile_ratings($1,$2)", [q, other]));
    await query("update profiles set social_url='https://instagram.com/test.two' where id=$1", [q]);
    assert.equal((await query("select is_public_profile($1) ok", [q]))[0].ok, true);
    await assert.rejects(() => act(other, "disconnect"));
    await act(u, "disconnect");
    assert.equal((await query("select verified from profiles where id=$1", [q]))[0].verified, false);
    assert.equal((await query("select is_public_profile($1) ok", [q]))[0].ok, false);
    assert(!(await query("select * from get_leaderboard()")).some(row => row.id === q));
    await db.exec("set role anon");
    try { await assert.rejects(() => query("select * from activity where profile_id=$1", [q]), /permission denied/); }
    finally { await db.exec("reset role"); }
  });
  await t.test(
    "OAuth state is bound to its user, expires and can be consumed once",
    async () => {
      await query(
        "insert into social_oauth_states(state_hash,user_id,verifier) values('test-state',$1,'test-verifier')",
        [u],
      );
      await assert.rejects(() =>
        query("select consume_social_oauth('test-state',$1)", [other]),
      );
      assert.equal(
        (await query("select consume_social_oauth('test-state',$1) v", [u]))[0]
          .v,
        "test-verifier",
      );
      await assert.rejects(() =>
        query("select consume_social_oauth('test-state',$1)", [u]),
      );
      await query(
        "insert into social_oauth_states(state_hash,user_id,verifier,expires_at) values('old-state',$1,'v',now()-interval '1 minute')",
        [u],
      );
      await assert.rejects(() =>
        query("select consume_social_oauth('old-state',$1)", [u]),
      );
    },
  );
  await t.test(
    "YouTube proof uses canonical IDs and excludes a second owner",
    async () => {
      const id = "UC" + "a".repeat(22);
      const payload = JSON.stringify([
        {
          remote_id: id,
          label: "My channel",
          social_url: "https://youtube.com/channel/" + id,
        },
      ]);
      await query("select verify_youtube_connections($1,$2)", [u, payload]);
      await query("select verify_youtube_connections($1,$2)", [u, payload]);
      assert.equal(
        (
          await query(
            "select count(*) n from social_connections where platform='YouTube'",
          )
        )[0].n,
        1,
      );
      await assert.rejects(() =>
        query("select verify_youtube_connections($1,$2)", [other, payload]),
      );
      await assert.rejects(() =>
        query("select verify_youtube_connections($1,$2)", [
          u,
          JSON.stringify([
            {
              remote_id: id,
              label: "Fake",
              social_url: "https://youtube.com/@someone-else",
            },
          ]),
        ]),
      );
    },
  );
  await t.test(
    "browser roles cannot read proof codes or grant ownership",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec("set role " + role);
        try {
          await assert.rejects(() =>
            query("select * from connection_challenges"),
          );
          await assert.rejects(() =>
            query("select * from social_oauth_states"),
          );
          await assert.rejects(() =>
            act(u, "approve", challenge.id, { code_seen: challenge.code }),
          );
          await assert.rejects(() =>
            query("select verify_youtube_connections($1,'[]')", [u]),
          );
        } finally {
          await db.exec("reset role");
        }
      }
    },
  );
});
await test("private free accounts and ratings by non-paying users", async (t) => {
  const target = "20000000-0000-4000-8000-000000000001";
  const privateProfile = "20000000-0000-4000-8000-000000000002";
  await query(
    "insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$3,'Rating Target','rating.target','rating-target','https://instagram.com/rating.target','instagram','creators'),($2,$4,'Private Person','private.person','private-person','https://instagram.com/private.person','instagram','creators')",
    [target, privateProfile, u, other],
  );
  const rateProfile = async (userId, profileId, score) =>
    (
      await query("select set_profile_rating($1,$2,$3) result", [
        userId,
        profileId,
        score,
      ])
    )[0].result;
  const getRating = async (profileId, userId = null) =>
    (
      await query("select get_profile_ratings($1,$2) result", [
        profileId,
        userId,
      ])
    )[0].result;
  await t.test(
    "free linking and verification do not publish a private account",
    async () => {
      await prove(other, "https://instagram.com/private.person");
      assert.equal(
        (
          await query("select verified from profiles where id=$1", [
            privateProfile,
          ])
        )[0].verified,
        true,
      );
      assert.equal(
        (await query("select is_public_profile($1) ok", [privateProfile]))[0]
          .ok,
        false,
      );
      assert(
        !(await query("select * from get_leaderboard()")).some(
          (p) => p.id === privateProfile,
        ),
      );
      await assert.rejects(() => getRating(privateProfile));
    },
  );
  await t.test(
    "private activity and artificially active unpaid profiles remain hidden",
    async () => {
      await query(
        "insert into activity(profile_id,kind,payload) values($1,'profile_updated','{}')",
        [privateProfile],
      );
      await query(
        "update profiles set status='active',total_paid=10000 where id=$1",
        [privateProfile],
      );
      assert.equal(
        (await query("select is_public_profile($1) ok", [privateProfile]))[0]
          .ok,
        false,
      );
      await db.exec("set role anon");
      try {
        await assert.rejects(() => query("select * from activity where profile_id=$1", [privateProfile]), /permission denied/);
      } finally {
        await db.exec("reset role");
      }
      await query(
        "update profiles set status='pending_payment',total_paid=0 where id=$1",
        [privateProfile],
      );
    },
  );
  await t.test(
    "only an ownership-verified paid profile becomes public",
    async () => {
      await assert.rejects(() => reserve(target, 125000, crypto.randomUUID()), /Profile verification required/);
      await query("update profiles set verified=true where id=$1", [target]);
      assert.equal((await query("select verified from profiles where id=$1", [target]))[0].verified, false);
      await prove(u, "https://instagram.com/rating.target");
      const payment = await reserve(target, 125000, crypto.randomUUID());
      await apply(payment, "evt_ratings_payment", "pi_ratings");
      const row = (await query("select * from get_leaderboard()")).find(
        (p) => p.id === target,
      );
      assert(row);
      assert.equal(row.verified, true);
      assert.equal(row.social_url, "https://instagram.com/rating.target");
      assert.equal((await getRating(target)).count, 0);
    },
  );
  await t.test(
    "a non-paying person can rate once, revise and remove without affecting ranks",
    async () => {
      assert.equal(
        (
          await query("select count(*) n from payments where user_id=$1", [
            other,
          ])
        )[0].n,
        0,
      );
      const before = await query("select id,total_paid from get_leaderboard()");
      const first = await rateProfile(other, target, 5);
      assert.equal(first.count, 1);
      assert.equal(first.average, 5);
      assert.equal(first.mine, 5);
      assert.equal((await rateProfile(other, target, 4)).count, 1);
      assert.equal((await getRating(target)).average, 4);
      const publicResult = await getRating(target);
      assert.equal(publicResult.mine, null);
      assert.equal(publicResult.signed_in, false);
      assert.deepEqual(
        Object.keys(publicResult).sort(),
        [
          "average",
          "can_rate",
          "count",
          "is_owner",
          "mine",
          "signed_in",
        ].sort(),
      );
      assert.deepEqual(
        await query("select id,total_paid from get_leaderboard()"),
        before,
      );
      const removed = await rateProfile(other, target, null);
      assert.equal(removed.count, 0);
      assert.equal(removed.average, null);
    },
  );
  await t.test(
    "own, anonymous, banned, invalid and non-public ratings are rejected",
    async () => {
      await assert.rejects(() => rateProfile(u, target, 5));
      await assert.rejects(() => rateProfile(null, target, 5));
      await assert.rejects(() => rateProfile(other, target, 0));
      await assert.rejects(() => rateProfile(other, target, 6));
      await assert.rejects(() => rateProfile(u, privateProfile, 5));
      await query("update users set banned=true where id=$1", [other]);
      await assert.rejects(() => rateProfile(other, target, 5));
      await query("update users set banned=false where id=$1", [other]);
    },
  );
  await t.test(
    "refunds and moderation remove visibility and rating eligibility",
    async () => {
      await rateProfile(other, target, 3);
      await query("update profiles set status='hidden' where id=$1", [target]);
      await assert.rejects(() => getRating(target));
      await assert.rejects(() => rateProfile(other, target, 5));
      await query("update profiles set status='active' where id=$1", [target]);
      await query(
        "select apply_refund('evt_ratings_refund','pi_ratings',125000)",
      );
      assert.equal(
        (await query("select is_public_profile($1) ok", [target]))[0].ok,
        false,
      );
      assert(
        !(await query("select * from get_leaderboard()")).some(
          (p) => p.id === target,
        ),
      );
      await assert.rejects(() => getRating(target));
    },
  );
  await t.test(
    "clients cannot list private accounts or voters, or impersonate a voter through RPC",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec("set role " + role);
        try {
          await assert.rejects(() => query("select * from social_connections"));
          await assert.rejects(() => query("select * from profile_ratings"));
          await assert.rejects(() => rateProfile(other, target, 5));
          await assert.rejects(() => getRating(target, other));
        } finally {
          await db.exec("reset role");
        }
      }
    },
  );
});
await test("proof lost during checkout keeps credited funds private until reverified", async () => {
  const id = crypto.randomUUID();
  const url = "https://instagram.com/proof.race";
  await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Proof Race','proof.race','proof-race',$3,'instagram','creators')", [id, u, url]);
  const request = crypto.randomUUID();
  await assert.rejects(() => reserve(id, 100000, request), /Profile verification required/);
  await prove(other, url);
  await assert.rejects(() => reserve(id, 100000, request), /Profile verification required/);
  await assert.rejects(() => prove(u, url)); // Cannot claim an already verified social account.
  await query("delete from social_connections where user_id=$1 and social_url=$2", [other, url]);
  const connection = (await prove(u, url))[0];
  const pay = await reserve(id, 100000, request);
  await query("select connection_action($1,'disconnect',$2)", [u, connection.id]);
  await assert.rejects(() => reserve(id, 100000, request), /Profile verification required/);
  assert.equal(await apply(pay, "evt_proof_lost", "pi_proof_lost"), true);
  assert.equal(Number((await query("select total_paid from profiles where id=$1", [id]))[0].total_paid), 100000);
  assert.equal((await query("select is_public_profile($1) ok", [id]))[0].ok, false);
  assert(!(await query("select * from get_leaderboard()")).some(row => row.id === id));
  await assert.rejects(() => query("select set_profile_rating($1,$2,5)", [other, id]));
  await assert.rejects(() => query("select get_profile_ratings($1,null)", [id]));
  await db.exec("set role anon");
  try { await assert.rejects(() => query("select * from activity where profile_id=$1", [id]), /permission denied/); }
  finally { await db.exec("reset role"); }
  await prove(u, url);
  assert.equal((await query("select is_public_profile($1) ok", [id]))[0].ok, true);
  assert.equal(Number((await query("select count(*) n from payments where profile_id=$1", [id]))[0].n), 1);
});

await test('discovery metadata stays private until verified payment and cannot expose connection owners', async () => {
  await db.exec('begin');
  try {
    const id='70000000-0000-4000-8000-000000000001';
    const url='https://instagram.com/discovery.test';
    await query("insert into social_connections(user_id,platform,social_url,label,status,method,verified_at,social_bio,avatar_url) values($1,'Instagram',$2,'Discovery','verified','bio',now(),'Imported biography','https://example.com/avatar.jpg')",[u,url]);
    await query("insert into profiles(id,user_id,name,username,slug,bio,social_url,social_platform_id,category_id,language,country,region) values($1,$2,'Discovery Person','discovery.test','discovery-test','A public description',$3,'instagram','photography','cs','CZ','Praha')",[id,u,url]);
    assert(!(await query("select value from get_leaderboard_discovery() value")).some(row=>row.value.id===id));
    await query("insert into payments(user_id,profile_id,amount,target_total,request_id,status) values($1,$2,10000,10000,gen_random_uuid(),'paid')",[u,id]);
    await query("update profiles set total_paid=10000,status='active' where id=$1",[id]);
    const result=(await query("select value from get_leaderboard_discovery() value")).find(row=>row.value.id===id).value;
    assert.equal(result.language,'cs'); assert.equal(result.country,'CZ'); assert.equal(result.region,'Praha');
    assert.equal(result.social_bio,'Imported biography'); assert.equal(result.avatar_url,'https://example.com/avatar.jpg');
    assert.equal(result.user_id,undefined); assert.equal(result.remote_id,undefined);
    await query("delete from social_connections where user_id=$1 and social_url=$2",[u,url]);
    assert(!(await query("select value from get_leaderboard_discovery() value")).some(row=>row.value.id===id));
  } finally { await db.exec('rollback'); }
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(()=>query('select * from get_leaderboard_discovery()')); }
    finally { await db.exec('reset role'); }
  }
});


await test('rolling payment sums, private insights and moderated text reviews',async(t)=>{
 const owner=crypto.randomUUID(),writer=crypto.randomUUID(),moderator=crypto.randomUUID(),profile=crypto.randomUUID();
 await query('insert into auth.users(id) values($1),($2),($3)',[owner,writer,moderator]);
 await query("update users set role='admin' where id=$1",[moderator]);
 const url='https://instagram.com/insight.creator';await prove(owner,url);
 await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id,total_paid,status) values($1,$2,'Insight Creator','insight.creator','insight-creator',$3,'instagram','creators',100000,'active')",[profile,owner,url]);
 for(const [amount,age,refund] of [[10000,0,0],[20000,3,5000],[30000,15,0],[40000,40,0]]) await query("insert into payments(user_id,profile_id,amount,refunded_amount,target_total,request_id,status,paid_at) values($1,$2,$3,$4,100000,gen_random_uuid(),case when $4::bigint>0 then 'partially_refunded' else 'paid' end,now()-make_interval(days=>$5))",[owner,profile,amount,refund,age]);
 await t.test('7 and 30 days use confirmed net sums and do not replace lifetime total',async()=>{
 const p=(await query('select value from get_leaderboard_discovery() value')).find(r=>r.value.id===profile).value;
 assert.equal(p.today_paid,10000);assert.equal(p.week_paid,25000);assert.equal(p.month_paid,55000);assert.equal(p.total_paid,100000);
 });
 await t.test('analytics retry is idempotent and owner-only aggregates distinguish page, card, detail and click',async()=>{
 const event=crypto.randomUUID();
 for(const kind of ['leaderboard_page_view','impression','name_impression','name_impression','profile_detail_view','outbound_click','outbound_click']) await query('insert into profile_traffic(profile_id,kind,event_id,visitor_hash) values($1,$2,$3,$4) on conflict do nothing',[profile,kind,event,'visitor-day-1']);
 await query("insert into profile_traffic(profile_id,kind,event_id,visitor_hash,created_at) values($1,'outbound_click',gen_random_uuid(),'visitor-old',now()-interval '10 days')",[profile]);
 const stats=(await query('select creator_insights($1,7) value',[owner]))[0].value;
 const r=stats.profiles.find(r=>r.profile_id===profile);assert.equal(r.board_views,1);assert.equal(r.impressions,1);assert.equal(r.name_views,1);assert.equal(r.daily_name_viewers,1);assert.equal(r.detail_views,1);assert.equal(r.clicks,1);assert.equal(r.daily_clickers,1);assert.equal(r.daily.length,2);assert.equal(r.visitor_hash,undefined);
 assert(!(await query('select creator_insights($1,7) value',[writer]))[0].value.profiles.some(r=>r.profile_id===profile));
 assert.equal((await query('select creator_insights($1,0) value',[owner]))[0].value.profiles.find(r=>r.profile_id===profile).clicks,2);
 await assert.rejects(()=>query('select creator_insights($1,8)',[owner]));
 });
 await t.test('event recorder ignores owners, private IDs and wrong networks, and deduplicates retries',async()=>{
 const event=crypto.randomUUID(),hash='a'.repeat(64);
 const record=async(who,source='Instagram',ids=[profile])=>(await query("select record_profile_traffic($1,$2,'impression',$3,$4,$5) n",[who,ids,event,hash,source]))[0].n;
 assert.equal(Number(await record(owner)),0);assert.equal(Number(await record(writer,'YouTube')),0);
 assert.equal(Number(await record(writer,'Instagram',[crypto.randomUUID()])),0);
 assert.equal(Number(await record(writer)),1);assert.equal(Number(await record(writer)),0);
 });
 const save=(who,text,score=4)=>query("select save_profile_review($1,$2,'Public nickname',$3,$4) value",[who,profile,text,score]);
 const read=async(who=null)=>(await query('select get_profile_reviews($1,$2,1) value',[profile,who]))[0].value;
 await t.test('text mandatory, stars optional, no self-rating and no anonymous writes',async()=>{
 await assert.rejects(()=>save(owner,'My own review text',5));await assert.rejects(()=>save(null,'Anonymous review text',5));await assert.rejects(()=>save(writer,'',5));await assert.rejects(()=>save(writer,'A meaningful review text',6));
 await save(writer,'A helpful text without stars.',null);
 const data=await read(writer);assert.equal(data.count,0);assert.equal(data.mine.status,'pending');assert.equal(data.mine.score,null);assert.equal((await read()).mine,null);
 });
 await t.test('only admins publish, edits re-enter moderation, averages include only public text and no private author IDs',async()=>{
 let r=(await read(writer)).mine;
 await assert.rejects(()=>query("select moderate_profile_review($1,$2,'published')",[writer,r.id]));
 await query("select moderate_profile_review($1,$2,'published')",[moderator,r.id]);
 let d=await read();assert.equal(d.count,1);assert.equal(d.rated_count,0);assert.equal(d.average,null);assert.equal(d.items[0].user_id,undefined);
 await save(writer,'Updated review with useful feedback.',2);assert.equal((await read()).count,0);
 await query("select moderate_profile_review($1,$2,'published')",[moderator,r.id]);d=await read();assert.equal(d.average,2);assert.equal(d.rated_count,1);
 await query('update users set banned=true where id=$1',[writer]);assert.equal((await read()).count,0);await query('update users set banned=false where id=$1',[writer]);
 // Even the profile owner cannot delete another author's comment through self-deletion.
 await save(owner,null,null);assert.equal((await read()).count,1);assert.equal((await read(writer)).mine.id,r.id);
 await save(writer,null,null);assert.equal((await read()).count,0);
 });
 await t.test('public callers cannot read event identities, legacy payment deltas or invoke privileged RPCs',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{
 for(const table of ['profile_traffic','profile_reviews','activity'])await assert.rejects(()=>query('select * from '+table),/permission denied/);
 await assert.rejects(()=>query('select creator_insights($1,7)',[owner]),/permission denied/);
 await assert.rejects(()=>query('select get_profile_reviews($1,null,1)',[profile]),/permission denied/);
 }finally{await db.exec('reset role')}}
 });
});
await test('promo placement has paid features but never bypasses verification or creates money', async(t)=>{
 const owner=crypto.randomUUID(),otherOwner=crypto.randomUUID(),id=crypto.randomUUID(),second=crypto.randomUUID();
 const url='https://instagram.com/promo.creator';
 await query('insert into auth.users(id) values($1),($2)',[owner,otherOwner]);
 await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Promo Creator','promo.creator','promo-creator',$3,'instagram','creators')",[id,owner,url]);
 const claim=(who=owner,profile=id)=>query('select claim_promo_placement($1,$2) value',[who,profile]);
 const visible=async()=>(await query('select is_public_profile($1) value',[id]))[0].value;
 await t.test('campaign opt-in and trusted ownership proof are both required',async()=>{
  await assert.rejects(()=>claim(),/verification/);await prove(owner,url);
  await assert.rejects(()=>claim(),/not active/);
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  await assert.rejects(()=>claim(otherOwner),/eligible/);
 });
 await t.test('one admission, idempotent retries, zero payment and public metadata',async()=>{
  const first=(await claim())[0].value, retry=(await claim())[0].value;
  assert.equal(first.slot,retry.slot);assert.equal(first.promo_granted_at,retry.promo_granted_at);assert.equal(await visible(),true);
  assert.equal(Number((await query('select count(*) n from payments where profile_id=$1',[id]))[0].n),0);
  const row=(await query('select value from get_leaderboard_discovery() value')).find(r=>r.value.id===id).value;
  assert.equal(row.total_paid,0);assert(row.promo_granted_at);
 });
 await t.test('promo exposes the same traffic, private insights and review features',async()=>{
  await query("select record_profile_traffic($1,$2,'name_impression',$3,$4,'Instagram')",[otherOwner,[id],crypto.randomUUID(),'c'.repeat(64)]);
  const stat=(await query('select creator_insights($1,30) value',[owner]))[0].value.profiles.find(p=>p.profile_id===id);assert.equal(stat.name_views,1);
  assert(!(await query('select creator_insights($1,30) value',[otherOwner]))[0].value.profiles.some(p=>p.profile_id===id));
  const review=(await query("select save_profile_review($1,$2,'A visitor','Useful creator with great photographs.',5) value",[otherOwner,id]))[0].value;
  assert.equal(review.mine.status,'pending');
 });
 await t.test('one promo profile per person and network, verified only',async()=>{
  const secondUrl='https://instagram.com/promo.second';await prove(owner,secondUrl);
  await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Second Promo','promo.second','promo-second',$3,'instagram','creators')",[second,owner,secondUrl]);
  await assert.rejects(()=>claim(owner,second),/already used/);
  await query('delete from social_connections where user_id=$1 and social_url=$2',[owner,url]);assert.equal(await visible(),false);await assert.rejects(()=>claim(),/verification/);
  assert(!(await query('select creator_insights($1,30) value',[owner]))[0].value.profiles.some(p=>p.profile_id===id));
  await prove(owner,url);assert.equal(await visible(),true);
 });
 await t.test('turning promo off preserves earned placement; boost and refund preserve zero-cost entitlement',async()=>{
  await query(`update app_settings set value=value || '{"promo_enabled":false}'::jsonb where key='public'`);
  await claim();assert.equal(await visible(),true);
  const pay=await reserve(id,10000,crypto.randomUUID(),owner);await apply(pay,'evt_promo_boost','pi_promo_boost');
  await query("select apply_refund('evt_promo_refund','pi_promo_boost',10000)");assert.equal(await visible(),true);
  assert.equal(Number((await query('select total_paid from profiles where id=$1',[id]))[0].total_paid),0);
 });
 await t.test('identity change cannot move a promo slot to a different account',async()=>{
  await query("update profiles set social_url='https://instagram.com/promo.changed' where id=$1",[id]);
  assert.equal(await visible(),false);assert.equal((await query('select promo_granted_at from profiles where id=$1',[id]))[0].promo_granted_at,null);
  await prove(owner,'https://instagram.com/promo.changed');assert.equal(await visible(),false);
 });
 await t.test('100 slots per network cannot be exceeded and revoked entries do not recycle slots',async()=>{
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  await query("insert into promo_admissions(social_platform_id,social_url,slot) select 'instagram','https://instagram.com/reserved.'||n,n from generate_series(2,100) n");
  await prove(otherOwner,'https://instagram.com/last.slot');const last=crypto.randomUUID();
  await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Last Slot','last.slot','last-slot','https://instagram.com/last.slot','instagram','creators')",[last,otherOwner]);
  await assert.rejects(()=>claim(otherOwner,last),/full/);
  await query("insert into social_connections(user_id,platform,social_url,label,status,method,verified_at) values($1,'Facebook','https://facebook.com/promo.page','Facebook proof','verified','bio',now())",[otherOwner]);
  const fb=crypto.randomUUID();await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'FB Page','promo.page','promo-page','https://facebook.com/promo.page','facebook','creators')",[fb,otherOwner]);
  assert.equal((await claim(otherOwner,fb))[0].value.slot,1);
 });
 await t.test('clients cannot grant themselves promo access or read admissions',async()=>{
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{
   await assert.rejects(()=>claim(),/permission denied/);
   await assert.rejects(()=>query('select * from promo_admissions'),/permission denied/);
   await assert.rejects(()=>query('update profiles set promo_granted_at=now() where id=$1',[id]),/permission denied/);
  }finally{await db.exec('reset role')}}
 });
});
await test('profile discussion participants, moderation, reactions and privacy',async(t)=>{
 const owner=crypto.randomUUID(),author=crypto.randomUUID(),visitor=crypto.randomUUID(),moderator=crypto.randomUUID(),profile=crypto.randomUUID();
 await query('insert into auth.users(id) values($1),($2),($3),($4)',[owner,author,visitor,moderator]);
 await query("update users set role='admin' where id=$1",[moderator]);
 await query("insert into social_connections(user_id,platform,social_url,label,status,method,verified_at) values($1,'YouTube','https://youtube.com/@discussion','Proof','verified','youtube_oauth',now())",[owner]);
 await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Profile Owner','discussion','discussion','https://youtube.com/@discussion','youtube','creators')",[profile,owner]);
 await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
 await query('select claim_promo_placement($1,$2)',[owner,profile]);
 const root=(await query("select save_profile_review($1,$2,'Comment Author','What will you create next?',4) value",[author,profile]))[0].value.mine.id;
 const discussion=async(who=null,page=1)=>(await query('select get_review_discussion($1,$2,$3) value',[root,who,page]))[0].value;
 const reply=async(who,text,id=null)=>(await query('select save_review_reply($1,$2,$3,$4) value',[who,root,text,id]))[0].value;
 const react=async(who,emoji,id=null)=>(await query('select set_review_reaction($1,$2,$3,$4) value',[who,root,id,emoji]))[0].value;
 let answer,response;
 await t.test('pending root hides its whole discussion and blocks replies and reactions',async()=>{
  await assert.rejects(()=>discussion(),/not public/);await assert.rejects(()=>reply(owner,'An answer'),/not public/);await assert.rejects(()=>react(visitor,'❤️'),/not public/);
  await query("select moderate_profile_review($1,$2,'published')",[moderator,root]);
 });
 await t.test('only profile owner and original author may reply, using server-derived names',async()=>{
  assert.equal((await discussion(owner)).can_reply,true);assert.equal((await discussion(author)).can_reply,true);assert.equal((await discussion(visitor)).can_reply,false);assert.equal((await discussion()).can_reply,false);
  await assert.rejects(()=>reply(visitor,'Cannot join'),/participants/);await assert.rejects(()=>reply(null,'Cannot join'),/Forbidden/);
  answer=await reply(owner,'Thanks! A photography tutorial is next.');response=await reply(author,'That sounds good.');
  assert.equal(answer.status,'pending');assert.equal((await discussion()).count,0);const mine=await discussion(owner);assert.equal(mine.count,1);assert.equal(mine.items[0].author_name,'Profile Owner');assert.equal(mine.items[0].is_owner,true);assert.equal(mine.items[0].user_id,undefined);
 });
 await t.test('reply moderation, ownership of edits and own pending visibility are enforced',async()=>{
  await assert.rejects(()=>query("select moderate_review_reply($1,$2,'published')",[owner,answer.id]),/Forbidden/);
  await query("select moderate_review_reply($1,$2,'published')",[moderator,answer.id]);
  assert.equal((await discussion()).count,1);
  await assert.rejects(()=>reply(author,'Hijacked answer',answer.id),/not owned/);
  await assert.rejects(()=>reply(author,null,answer.id),/not owned/);
  await reply(owner,'Updated answer with more detail.',answer.id);assert.equal((await discussion()).count,0);
  await query("select moderate_review_reply($1,$2,'published')",[moderator,answer.id]);
  await query("select moderate_review_reply($1,$2,'published')",[moderator,response.id]);
  assert.equal((await discussion()).items.find(r=>r.id===response.id).is_owner,false);
 });
 await t.test('one reaction per person per target, replace and toggle off, no self reaction',async()=>{
  await assert.rejects(()=>react(null,'❤️'),/Forbidden/);await assert.rejects(()=>react(author,'❤️'),/self reaction/);await assert.rejects(()=>react(owner,'👍',answer.id),/self reaction/);
  let r=await react(visitor,'❤️');assert.deepEqual(r,[{emoji:'❤️',count:1,mine:true}]);
  r=await react(visitor,'👍');assert.deepEqual(r,[{emoji:'👍',count:1,mine:true}]);
  assert.deepEqual(await react(visitor,'👍'),[]);
  await react(visitor,'🤩');await react(owner,'🤩');await react(author,'👍',answer.id);
  r=await react(visitor,'👎',answer.id);assert.equal(r.length,2);
  const list=(await query('select get_profile_reviews($1,$2,1) value',[profile,visitor]))[0].value;
  const comment=list.items.find(r=>r.id===root);assert.equal(comment.reactions[0].count,2);assert.equal(comment.reactions[0].mine,true);assert.equal(comment.reply_count,2);assert.equal(comment.user_id,undefined);
  const anonymous=(await query('select get_profile_reviews($1,null,1) value',[profile]))[0].value.items.find(r=>r.id===root);assert.equal(anonymous.reactions[0].mine,false);
 });
 await t.test('cross-thread replies cannot receive a reaction under another comment',async()=>{
  const another=(await query("select save_profile_review($1,$2,'Other author','A separate review text.',null) value",[visitor,profile]))[0].value.mine.id;
  await query("select moderate_profile_review($1,$2,'published')",[moderator,another]);
  await assert.rejects(()=>query("select set_review_reaction($1,$2,$3,'👍')",[owner,another,response.id]),/not public/);
 });
 await t.test('bans and hidden replies remove reactions and visibility immediately',async()=>{
  await query('update users set banned=true where id=$1',[visitor]);
  await assert.rejects(()=>react(visitor,'❤️'),/Forbidden/);
  const reactions=(await query('select get_profile_reviews($1,null,1) value',[profile]))[0].value.items.find(r=>r.id===root).reactions;assert.equal(reactions[0].count,1);
  await query('update users set banned=false where id=$1',[visitor]);
  await query("select moderate_review_reply($1,$2,'hidden')",[moderator,answer.id]);
  assert(!(await discussion()).items.some(r=>r.id===answer.id));await assert.rejects(()=>react(visitor,'😠',answer.id),/not public/);
  assert((await discussion(owner)).items.some(r=>r.id===answer.id&&r.status==='hidden'));
 });
 await t.test('paginated discussions do not lose replies or expose other peoples pending drafts',async()=>{
  await query("insert into review_replies(review_id,user_id,author_name,body,status) select $1,$2,'Profile Owner','Public answer '||n,'published' from generate_series(1,25) n",[root,owner]);
  const first=await discussion(null,1),second=await discussion(null,2);assert.equal(first.items.length,20);assert.equal(second.items.length,6);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,26);
 });
 await t.test('hiding parent or revoking profile proof hides whole thread but permits deleting own replies',async()=>{
  await query("select moderate_profile_review($1,$2,'hidden')",[moderator,root]);await assert.rejects(()=>discussion(),/not public/);await assert.rejects(()=>react(visitor,'👍'),/not public/);
  await reply(owner,null,answer.id);assert.equal(Number((await query('select count(*) n from review_reactions where reply_id=$1',[answer.id]))[0].n),0);
  await query("select moderate_profile_review($1,$2,'published')",[moderator,root]);
  await query('delete from social_connections where user_id=$1',[owner]);await assert.rejects(()=>discussion(),/not public/);await assert.rejects(()=>reply(author,'Another reply'),/not public/);
 });
 await t.test('browser roles cannot read identities or invoke discussion mutations directly',async()=>{
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{
   for(const table of ['review_replies','review_reactions'])await assert.rejects(()=>query('select * from '+table),/permission denied/);
   await assert.rejects(()=>discussion(owner),/permission denied/);await assert.rejects(()=>reply(owner,'No'),/permission denied/);await assert.rejects(()=>react(visitor,'👍'),/permission denied/);
  }finally{await db.exec('reset role')}}
 });
});

await test('content notices retain private evidence and require reasoned decisions', async () => {
  const request=crypto.randomUUID();
  const insert=`insert into content_notices(request_id,payload_hash,reporter_hash,content_url,reason,details,reporter_name,reporter_email,good_faith) values($1,repeat('a',64),'test','https://fameriser.com/p/test','copyright','A sufficiently specific copyright notice.','Reporter','reporter@example.test',true) returning id`;
  const notice=(await query(insert,[request]))[0];
  await assert.rejects(()=>query(insert,[request]));
  await assert.rejects(()=>query("update content_notices set good_faith=false where id=$1",[notice.id]));
  await assert.rejects(()=>query("update content_notices set reporter_email='' where id=$1",[notice.id]));
  await assert.rejects(()=>query("update content_notices set status='resolved' where id=$1",[notice.id]));
  const evidence=(await query("select public,file_size_limit from storage.buckets where id='notice-evidence'"))[0];
  assert.equal(evidence.public,false);assert.equal(Number(evidence.file_size_limit),2097152);
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    try {
      await assert.rejects(()=>query('select * from content_notices'));
      await assert.rejects(()=>query("select update_content_notice($1,$2,'receipt_sent')",[u,notice.id]));
    } finally {await db.exec('reset role');}
  }
  const regular=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[regular]);
  await assert.rejects(()=>query("select update_content_notice($1,$2,'reviewing')",[regular,notice.id]));
  await query("update users set role='admin',banned=false where id=$1",[u]);
  await query("select update_content_notice($1,$2,'decision',$3::jsonb)",[u,notice.id,JSON.stringify({decision:'Reviewed the notice; no infringement established.',redress:'Contact info@fameriser.com to request reconsideration.'})]);
  const resolved=(await query('select status,decision_sent_at from content_notices where id=$1',[notice.id]))[0];
  assert.equal(resolved.status,'resolved');assert.equal(resolved.decision_sent_at,null);
  assert.equal((await query("select count(*)::int n from admin_actions where target_id=$1 and action='notice_decision'",[notice.id]))[0].n,1);
  await query("update content_notices set reason='sexual',child_safety=true,reporter_name='',reporter_email='',receipt_state='not_requested' where id=$1",[notice.id]);
  await assert.rejects(()=>query("update content_notices set attachments='[{\"path\":\"bad\"}]' where id=$1",[notice.id]));
});

await test('Dodo ledger freezes consent and FX, deduplicates payments, respects refunds and profile verification',async()=>{
 const owner=crypto.randomUUID(),profile=crypto.randomUUID(),order=crypto.randomUUID();
 await query('insert into auth.users(id,email) values($1,$2)',[owner,'owner@example.com']);
 await query("insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id) values($1,$2,'Dodo Test','dodo-test','dodo-test','https://instagram.com/dodo-test','instagram','creators')",[profile,owner]);
 await prove(owner,'https://instagram.com/dodo-test');
 await query("insert into dodo_orders(id,request_id,user_id,profile_id,amount,currency,billing_country,product_id,documents,documents_hash,consents) values($1,$2,$3,$4,12100,'CZK','CZ','prod_1','{}',repeat('a',64),'{}')",[order,crypto.randomUUID(),owner,profile]);
 const paid=(event,refund=0,score=4000000)=>query("select apply_dodo_payment($1,$2,'payment.succeeded','pay_1',2100,'25',current_date,$3,$4,false,now())",[order,event,score,refund]);
 await paid('dodo-event-1');await paid('dodo-event-1');
 let o=(await query('select * from dodo_orders where id=$1',[order]))[0];assert.equal(Number(o.active_score),4000000);assert.equal(Number(o.net),10000);
 assert.equal((await query('select is_public_profile($1) as ok',[profile]))[0].ok,true);
 const publicRow=(await query("select get_commerce_board as p from get_commerce_board() where get_commerce_board->>'id'=$1",[profile]))[0].p;
 assert.equal(publicRow.rank_score,4000000);assert.equal(publicRow.country,null);assert.equal(publicRow.paid_totals.CZK,12100);assert.equal(publicRow.total_paid,0);
 const originalStamp=(await query('select score_changed_at from dodo_orders where id=$1',[order]))[0].score_changed_at;
 await paid('dodo-refund-1',6050,9000000);o=(await query('select * from dodo_orders where id=$1',[order]))[0];assert.equal(Number(o.rank_score),4000000);assert.equal(Number(o.active_score),2000000);
 const refundStamp=(await query('select score_changed_at from dodo_orders where id=$1',[order]))[0].score_changed_at;assert.ok(refundStamp>=originalStamp);
 await paid('dodo-stale',0);assert.equal(String((await query('select score_changed_at from dodo_orders where id=$1',[order]))[0].score_changed_at),String(refundStamp));assert.equal(Number((await query('select active_score from dodo_orders where id=$1',[order]))[0].active_score),2000000);
 await assert.rejects(()=>query("update dodo_orders set documents='[]' where id=$1",[order]));await assert.rejects(()=>query("update dodo_orders set fx_rate='50' where id=$1",[order]));
 await paid('dodo-refund-full',12100);assert.equal((await query('select is_public_profile($1) as ok',[profile]))[0].ok,false);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{for(const table of ['dodo_orders','email_outbox','service_requests','account_acceptances','moderation_decisions'])await assert.rejects(()=>query('select * from '+table));}finally{await db.exec('reset role')}}
});
await test('moderation and email are atomic; manual acknowledgements cancel queued copies',async()=>{
 await query("update users set role='admin',banned=false where id=$1",[u]);
 await query("update auth.users set email='owner@example.com' where id=$1",[u]);
 const id=(await query("select decide_profile($1,$2,'hidden','A sufficiently detailed moderation reason','guidelines section 1','Payment claim remains eligible for review.') id",[u,p]))[0].id;
 assert.ok(id);assert.equal((await query('select status from profiles where id=$1',[p]))[0].status,'hidden');
 assert.equal((await query("select count(*)::int n from email_outbox where dedupe_key=$1",['moderation-'+id]))[0].n,1);
 const before=(await query('select count(*)::int n from moderation_decisions'))[0].n;
 await assert.rejects(()=>query("select decide_profile($1,$2,'banned','short','rule','Payment impact description')",[u,p]));assert.equal((await query('select count(*)::int n from moderation_decisions'))[0].n,before);
 const n=(await query("insert into content_notices(request_id,payload_hash,reporter_hash,content_url,reason,details,reporter_name,reporter_email,good_faith) values($1,repeat('b',64),'visitor','https://fameriser.com/p/test','other','A detailed notice message','Test Person','test@example.com',true) returning id",[crypto.randomUUID()]))[0];
 await query("update content_notices set receipt_state='manual' where id=$1",[n.id]);assert.equal((await query('select status from email_outbox where notice_id=$1',[n.id]))[0].status,'cancelled');
});
// Native extension boundaries are stubbed; worker SQL, leases and access control execute in PostgreSQL.
await db.exec(`create schema vault;create table vault.secrets(name text primary key,decrypted_secret text);create view vault.decrypted_secrets as select * from vault.secrets;
create schema net;create table net.http_request_queue(id bigint generated always as identity,body jsonb,headers jsonb);create table net._http_response(id bigint,status_code integer,content text);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$insert into net.http_request_queue(body,headers) values(body,headers) returning id$$;
create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
await db.exec((await readFile(new URL('../supabase/migrations/017_mail_worker.sql',import.meta.url),'utf8')).replace(/^create extension .*;$/gm,''));
await test('mail worker protects secrets, retries idempotently and never treats queued mail as delivered',async()=>{
 await query("update email_outbox set status='cancelled' where status<>'sent'");
 assert.equal((await query('select database_mail_configured() ok'))[0].ok,false);
 await query("insert into vault.secrets values('fameriser_resend_api_key','test-key-only')");await query('update mail_settings set enabled=true');
 const id=(await query("insert into email_outbox(dedupe_key,recipient,subject,body) values('worker-test','test@example.test','Test','Message') returning id"))[0].id;
 await query('select process_mail_queue()');let row=(await query('select * from email_outbox where id=$1',[id]))[0];assert.equal(row.status,'sending');assert.equal(row.attempts,1);assert.equal(row.sent_at,null);
 await query('select process_mail_queue()');assert.equal((await query('select count(*)::int n from net.http_request_queue'))[0].n,1);
 await query('insert into net._http_response values($1,429,\'{}\')',[row.http_request_id]);await query('select process_mail_queue()');row=(await query('select * from email_outbox where id=$1',[id]))[0];assert.equal(row.status,'failed');assert.equal(row.last_error,'provider_429');
 await query("update email_outbox set next_attempt_at=now()-interval '1 second' where id=$1",[id]);await query('update mail_settings set last_enqueued_at=null');await query('select process_mail_queue()');
 row=(await query('select * from email_outbox where id=$1',[id]))[0];assert.equal(row.attempts,2);
 const keys=await query("select headers->>'Idempotency-Key' k from net.http_request_queue");assert.equal(keys[0].k,keys[1].k);
 await query('insert into net._http_response values($1,200,\'{"id":"provider-accepted-1"}\')',[row.http_request_id]);await query('select process_mail_queue()');row=(await query('select * from email_outbox where id=$1',[id]))[0];assert.equal(row.status,'sent');assert.equal(row.provider_id,'provider-accepted-1');
 const stale=(await query("insert into email_outbox(dedupe_key,recipient,subject,body,status,attempts,first_attempt_at) values('stale','test@example.test','Test','Message','failed',1,now()-interval '25 hours') returning id"))[0].id;
 await query('update mail_settings set last_enqueued_at=null');await query('select process_mail_queue()');assert.equal((await query('select last_error from email_outbox where id=$1',[stale]))[0].last_error,'manual_review_required');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(()=>query('select process_mail_queue()'));await assert.rejects(()=>query('select * from net.http_request_queue'));await assert.rejects(()=>query('select * from mail_settings'));}finally{await db.exec('reset role')}}
});
await test('reasoned admin editing cannot bypass account restrictions and rolls back invalid decisions',async()=>{
 await query("update users set role='admin',banned=false where id=$1",[u]);
 const before=(await query('select name from profiles where id=$1',[p]))[0].name;
 await assert.rejects(()=>query("select decide_account_content($1,$2,'edit','short','rule','Payment remains intact','Changed','Bio',false)",[u,p]));assert.equal((await query('select name from profiles where id=$1',[p]))[0].name,before);
 await query("select decide_account_content($1,$2,'edit','Correcting an inappropriate public description','guidelines','Payment remains intact','Changed','New bio',false)",[u,p]);assert.equal((await query('select name from profiles where id=$1',[p]))[0].name,'Changed');
 await assert.rejects(()=>query("select decide_account_content($1,$2,'ban_user','Account is misusing the service','guidelines','Payment claim remains available')",[u,p]),/administrator/);
});


await db.exec(await readFile(new URL('../supabase/migrations/020_oauth_automatic_promo.sql',import.meta.url),'utf8'));
await test('automatic promo uses a global 1000-account quota and trusted provider proofs',async()=>{
 await db.exec('begin');
 try {
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  const verify=(id,url)=>query("select verify_provider_connection($1,'Facebook',$2,$3,'Facebook Creator',null) id",[owner,id,url]);
  const connection=(await verify('5550001','https://facebook.com/verified.creator'))[0].id;
  assert.equal((await verify('5550001','https://facebook.com/verified.creator'))[0].id,connection);
  await db.exec('savepoint invalid_owner');await assert.rejects(()=>query("select verify_provider_connection($1,'Facebook','5550001','https://facebook.com/verified.creator','Fake owner',null)",[other]),/already connected/);await db.exec('rollback to invalid_owner');
  const profile=crypto.randomUUID();
  await query(`insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id,publication_consent,non_political_confirmed_at) values($1,$2,'Creator','creator','auto-promo','https://facebook.com/verified.creator','facebook','creators','{"public":true}',now())`,[profile,owner]);
  assert.equal((await query('select is_public_profile($1) ok',[profile]))[0].ok,true);
  assert.equal((await query('select total_paid from profiles where id=$1',[profile]))[0].total_paid,0);
  const initial=(await query('select claim_promo_placement($1,$2) value',[owner,profile]))[0].value;
  assert.equal((await query('select claim_promo_placement($1,$2) value',[owner,profile]))[0].value.slot,initial.slot);
  // A second real account belonging to the same person is eligible as requested.
  await verify('5550002','https://facebook.com/second.creator');
  const second=crypto.randomUUID();
  await query(`insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id,publication_consent,non_political_confirmed_at) values($1,$2,'Second','second','second-auto-promo','https://facebook.com/second.creator','facebook','creators','{"public":true}',now())`,[second,owner]);
  assert.equal((await query('select is_public_profile($1) ok',[second]))[0].ok,true);
  // Fill the single remaining quota across networks. The 1001st cannot enter.
  await query("insert into promo_admissions(social_platform_id,social_url,slot) select 'instagram','https://instagram.com/global.'||n,n from generate_series((select max(slot)+1 from promo_admissions),1000) n");
  await verify('5550003','https://facebook.com/last.creator');
  const last=crypto.randomUUID();
  await query(`insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id,publication_consent,non_political_confirmed_at) values($1,$2,'Last','last','last-auto-promo','https://facebook.com/last.creator','facebook','creators','{"public":true}',now())`,[last,owner]);
  assert.equal((await query('select is_public_profile($1) ok',[last]))[0].ok,false);
  await assert.rejects(()=>query('select claim_promo_placement($1,$2)',[owner,last]),/Promo is full/);
 } finally {await db.exec('rollback');}
});


await db.exec(await readFile(new URL('../supabase/migrations/021_promo_usd_credit.sql',import.meta.url),'utf8'));
await test('promo grants a fixed USD 5 non-cash score, adds payments, preserves proof and global quota',async()=>{
 await db.exec('begin');
 try {
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  const owner=crypto.randomUUID(),profile=crypto.randomUUID(),order=crypto.randomUUID();
  await query('insert into auth.users(id) values($1)',[owner]);
  await query("update users set created_at='2026-01-01' where id=$1",[owner]);
  await query(`insert into profiles(id,user_id,name,username,slug,social_url,social_platform_id,category_id,publication_consent,non_political_confirmed_at) values($1,$2,'Promo Credit','credit','credit-new','https://instagram.com/credit-new','instagram','creators','{"public":true}',now())`,[profile,owner]);
  assert.equal((await query('select is_public_profile($1) ok',[profile]))[0].ok,false);
  await prove(owner,'https://instagram.com/credit-new'); // Completing proof on an existing profile triggers admission.
  const board=async()=> (await query("select b from get_commerce_board() b where b->>'id'=$1",[profile]))[0]?.b;
  let row=await board();assert.ok(row);assert.equal(row.rank_score,4351610);assert.equal(row.today_score,4351610);assert.equal(row.week_score,4351610);assert.equal(row.month_score,4351610);
  assert.equal(row.promo_credit_minor,500);assert.equal(row.promo_credit_currency,'USD');assert.equal(row.total_paid,0);assert.deepEqual(row.paid_totals,{});assert.match(row.promo_priority_at,/^2026-01-01/);
  const initial=(await query('select claim_promo_placement($1,$2) a',[owner,profile]))[0].a;
  await query('select claim_promo_placement($1,$2)',[owner,profile]);assert.equal((await board()).rank_score,4351610);
  assert.equal(Number((await query('select count(*) n from promo_admissions where profile_id=$1',[profile]))[0].n),1);
  await db.exec('savepoint immutable');await assert.rejects(()=>query('update promo_admissions set priority_at=now() where profile_id=$1',[profile]),/Immutable promo award/);await db.exec('rollback to immutable');
  await query("insert into dodo_orders(id,request_id,user_id,profile_id,amount,currency,billing_country,product_id,documents,documents_hash,consents) values($1,$2,$3,$4,500,'USD','US','prod_credit','{}',repeat('a',64),'{}')",[order,crypto.randomUUID(),owner,profile]);
  await query("select apply_dodo_payment($1,'credit-payment','payment.succeeded','credit-pay',0,'1.1490','2026-09-21',4351610,0,false,now())",[order]);
  row=await board();assert.equal(row.rank_score,8703220);assert.equal(row.paid_totals.USD,500);assert.equal(row.promo_credit_minor,500);
  await query("select apply_dodo_payment($1,'credit-refund','refund.succeeded','credit-pay',0,'1.1490','2026-09-21',4351610,500,false,now())",[order]);
  row=await board();assert.equal(row.rank_score,4351610);assert.equal(row.paid_totals.USD,0);
  await query("update social_connections set status='unverified',method=null,verified_at=null where user_id=$1",[owner]);assert.equal(await board(),undefined);
  assert.equal(Number((await query('select count(*) n from promo_admissions where profile_id=$1',[profile]))[0].n),1);
  for(const role of ['anon','authenticated']) {await db.exec('savepoint permissions');await db.exec('set local role '+role);await assert.rejects(()=>query('select get_promo_credit($1)',[profile]),/permission denied/);await db.exec('rollback to permissions');}
  assert.ok(initial.slot<=1000);
 } finally {await db.exec('rollback');}
});

await db.exec(await readFile(new URL('../supabase/migrations/022_facebook_provider_profile_links.sql',import.meta.url),'utf8'));
await test('Facebook provider links accept opaque identifiers while preserving identity ownership and restricted execution',async()=>{
 await db.exec('begin');
 try {
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  const verify=(remote,url,user=owner)=>query("select verify_provider_connection($1,'Facebook',$2,$3,'Public Name',null) id",[user,remote,url]);
  const url='https://facebook.com/app_scoped_user_id/YXNpZADpOpaqueProfileLink';
  const id=(await verify('8880001',url))[0].id;
  assert.equal((await verify('8880001',url))[0].id,id);
  assert.equal((await verify('8880001','https://facebook.com/people/Public-Name/8880001'))[0].id,id);
  for(const [remote,badUrl,user,reason] of [
   ['8880001',url,other,/already connected/],
   ['opaque',url,owner,/Invalid provider account/],
   ['8880002',url+'/extra',owner,/Invalid provider URL/],
   ['8880002','https://facebook.com.evil.test/profile',owner,/Invalid provider URL/],
  ]) {
   await db.exec('savepoint invalid_proof');await assert.rejects(()=>verify(remote,badUrl,user),reason);await db.exec('rollback to invalid_proof');
  }
  for(const role of ['anon','authenticated']) {
   await db.exec('savepoint restricted_proof');await db.exec('set local role '+role);
   await assert.rejects(()=>verify('8880001',url),/permission denied/);await db.exec('rollback to restricted_proof');
  }
 } finally {await db.exec('rollback');}
});

await db.exec(await readFile(new URL('../supabase/migrations/023_automatic_login_placement.sql',import.meta.url),'utf8'));
await test('verified social login automatically creates one profile and USD 5 placement without fabricated consents',async()=>{
 await db.exec('begin');
 try {
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  await query("update users set created_at='2026-01-01' where id=$1",[owner]);
  const connection=(await query("select verify_provider_connection($1,'Facebook','90001','https://facebook.com/login.owner','Login Owner',null) id",[owner]))[0].id;
  const activate=()=>query('select activate_login_profile($1,$2) id',[owner,connection]);
  const profile=(await activate())[0].id;
  assert.equal((await query('select is_public_profile($1) ok',[profile]))[0].ok,false);
  await query("insert into account_acceptances(user_id,version,adult,documents,documents_hash) values($1,'2026-09-22.4',true,'{}',repeat('a',64))",[owner]);
  let row=(await query('select * from profiles where id=$1',[profile]))[0];
  assert.equal(row.status,'active');assert.equal(row.verified,true);assert.equal(row.publication_consent,null);assert.equal(row.non_political_confirmed_at,null);assert.equal(row.privacy_accepted_at,null);
  const board=(await query("select b from get_commerce_board() b where b->>'id'=$1",[profile]))[0].b;
  assert.equal(board.promo_credit_minor,500);assert.equal(board.rank_score,4351610);assert.equal(board.total_paid,0);assert.match(board.registration_at,/^2026-01-01/);
  assert.equal((await activate())[0].id,profile);assert.equal((await query('select count(*)::int n from profiles where user_id=$1',[owner]))[0].n,1);
  assert.equal((await query('select count(*)::int n from promo_admissions where profile_id=$1',[profile]))[0].n,1);
  await query("update profiles set name='Edited Name',status='hidden' where id=$1",[profile]);await activate();
  row=(await query('select * from profiles where id=$1',[profile]))[0];assert.equal(row.name,'Edited Name');assert.equal(row.status,'hidden');
  for(const role of ['anon','authenticated']){await db.exec('savepoint perms');await db.exec('set local role '+role);await assert.rejects(activate,/permission denied/);await db.exec('rollback to perms');}
  await db.exec('savepoint wrong_owner');await assert.rejects(()=>query('select activate_login_profile($1,$2)',[other,connection]),/Verified login required/);await db.exec('rollback to wrong_owner');
  await query("insert into promo_admissions(social_platform_id,social_url,slot) select 'instagram','https://instagram.com/quota.'||n,n from generate_series((select max(slot)+1 from promo_admissions),1000) n");
  const extra=(await query("select verify_provider_connection($1,'Facebook','90002','https://facebook.com/login.second','Second Owner',null) id",[owner]))[0].id;
  const extraProfile=(await query('select activate_login_profile($1,$2) id',[owner,extra]))[0].id;
  assert.equal((await query('select is_public_profile($1) ok',[extraProfile]))[0].ok,false);
  assert.equal((await query('select count(*)::int n from promo_admissions'))[0].n,1000);
 }finally{await db.exec('rollback');}
});

await db.exec(await readFile(new URL('../supabase/migrations/024_one_promo_per_owner.sql',import.meta.url),'utf8'));
await test('one owner receives one promo across personal profiles and Pages; verified extra Page awaits payment',async()=>{
 await db.exec('begin');
 try {
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  await query("insert into account_acceptances(user_id,version,adult,documents,documents_hash) values($1,'2026-09-22.5',true,'{}',repeat('a',64))",[owner]);
  const add=async(id,url,platform='Facebook')=>{
   const c=(await query("select verify_provider_connection($1,$2,$3,$4,'Verified account',null) id",[owner,platform,id,url]))[0].id;
   return (await query('select activate_login_profile($1,$2) id',[owner,c]))[0].id;
  };
  const personal=await add('901','https://facebook.com/personal.profile');
  const page=await add('902','https://facebook.com/902');
  const twitch=await add('903','https://twitch.tv/testowner','Twitch');
  assert.equal((await query('select is_public_profile($1) ok',[personal]))[0].ok,true);
  for(const profile of [page,twitch]){
   const p=(await query('select status,verified from profiles where id=$1',[profile]))[0];assert.equal(p.verified,true);assert.equal(p.status,'pending_payment');
   await db.exec('savepoint second_bonus');await assert.rejects(()=>query('select claim_promo_placement($1,$2)',[owner,profile]),/Promo already used/);await db.exec('rollback to second_bonus');
  }
  assert.equal((await query('select count(*)::int n from promo_admissions where user_id=$1',[owner]))[0].n,1);
  await query('select claim_promo_placement($1,$2)',[owner,personal]);
  const order=crypto.randomUUID();
  await query("insert into dodo_orders(id,request_id,user_id,profile_id,amount,currency,billing_country,product_id,documents,documents_hash,consents) values($1,$2,$3,$4,500,'USD','US','prod_page','{}',repeat('a',64),'{}')",[order,crypto.randomUUID(),owner,page]);
  await query("select apply_dodo_payment($1,'page-paid','payment.succeeded','page-pay',0,'1.1490','2026-09-21',4351610,0,false,now())",[order]);
  assert.equal((await query('select is_public_profile($1) ok',[page]))[0].ok,true);
  assert.equal((await query('select count(*)::int n from promo_admissions where user_id=$1',[owner]))[0].n,1);
 }finally{await db.exec('rollback');}
});

await db.exec(await readFile(new URL('../supabase/migrations/025_facebook_pages_paid_publication.sql',import.meta.url),'utf8'));
await test('Facebook Page requires explicit consent and confirmed payment, never consumes promo',async()=>{
 await db.exec('begin');
 try {
  await query(`update app_settings set value=value || '{"promo_enabled":true}'::jsonb where key='public'`);
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  await query("insert into account_acceptances(user_id,version,adult,documents,documents_hash) values($1,'2026-09-22.7',true,'{}',repeat('a',64))",[owner]);
  const prepare=(accepted=true,nonPolitical=true)=>query("select prepare_facebook_page($1,'99001','Managed Page',null,'2026-09-22.7',$2,$3) result",[owner,accepted,nonPolitical]);
  for(const args of [[false,true],[true,false]]){
   await db.exec('savepoint no_consent');await assert.rejects(()=>prepare(...args),/Publication consent required/);await db.exec('rollback to no_consent');
  }
  assert.equal((await query('select count(*)::int n from social_connections where user_id=$1',[owner]))[0].n,0);
  const result=(await prepare())[0].result,profile=result.profile_id;
  assert.deepEqual((await prepare())[0].result,result);
  const row=(await query('select * from profiles where id=$1',[profile]))[0];
  assert.equal(row.verified,true);assert.equal(row.payment_required,true);assert.equal(row.status,'pending_payment');assert.equal(row.publication_consent.public,true);
  const publicPage=async()=>(await query('select is_public_profile($1) ok',[profile]))[0].ok;
  assert.equal(await publicPage(),false);
  assert.equal((await query('select count(*)::int n from promo_admissions where user_id=$1',[owner]))[0].n,0);
  await db.exec('savepoint no_promo');await assert.rejects(()=>query('select claim_promo_placement($1,$2)',[owner,profile]),/Page payment required/);await db.exec('rollback to no_promo');
  // Generic creation and profile edits cannot bypass the trusted Page classification.
  await query('update profiles set payment_required=false where id=$1',[profile]);assert.equal((await query('select payment_required from profiles where id=$1',[profile]))[0].payment_required,true);
  const order=crypto.randomUUID();
  await query("insert into dodo_orders(id,request_id,user_id,profile_id,amount,currency,billing_country,product_id,documents,documents_hash,consents) values($1,$2,$3,$4,500,'USD','US','prod_page','{}',repeat('a',64),'{}')",[order,crypto.randomUUID(),owner,profile]);
  assert.equal(await publicPage(),false); // Pending/cancelled checkout is not a publication event.
  await query("select apply_dodo_payment($1,'page-consent-paid','payment.succeeded','page-consent-pay',0,'1.1490','2026-09-21',4351610,0,false,now())",[order]);
  assert.equal(await publicPage(),true);
  await query("update profiles set publication_consent=null where id=$1",[profile]);assert.equal(await publicPage(),false);
  await prepare();assert.equal(await publicPage(),true);
  await query("select apply_dodo_payment($1,'page-consent-refund','refund.succeeded','page-consent-pay',0,'1.1490','2026-09-21',4351610,500,false,now())",[order]);assert.equal(await publicPage(),false);
  await query("update profiles set status='hidden' where id=$1",[profile]);await db.exec('savepoint hidden');await assert.rejects(prepare,/Profile unavailable/);await db.exec('rollback to hidden');
  for(const role of ['anon','authenticated']){await db.exec('savepoint perms');await db.exec('set local role '+role);await assert.rejects(prepare,/permission denied/);await db.exec('rollback to perms');}
  // Preparing a Page does not spend the owner's personal-profile promotion.
  const c=(await query("select verify_provider_connection($1,'Facebook','99002','https://facebook.com/personal.unused','Personal Owner',null) id",[owner]))[0].id;
  const personal=(await query('select activate_login_profile($1,$2) id',[owner,c]))[0].id;
  assert.equal((await query('select is_public_profile($1) ok',[personal]))[0].ok,true);
  assert.equal((await query('select count(*)::int n from promo_admissions where user_id=$1',[owner]))[0].n,1);
 }finally{await db.exec('rollback');}
});

await db.exec(await readFile(new URL('../supabase/migrations/026_account_lifecycle.sql',import.meta.url),'utf8'));
await test('account erasure is atomic, repeatable and prevents renewed publication',async()=>{
 await db.exec('begin');
 try{
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  const c=(await query("select verify_provider_connection($1,'Facebook','99881','https://facebook.com/99881','Erasure Owner',null) id",[owner]))[0].id;
  const pid=(await query('select activate_login_profile($1,$2) id',[owner,c]))[0].id;
  // A forced failure after hiding the profile must roll back every earlier step.
  await db.exec(`create function fail_erasure_test() returns trigger language plpgsql as $$begin raise exception 'injected cleanup failure';end;$$;
   create trigger fail_erasure before delete on social_connections for each row execute function fail_erasure_test();`);
  await db.exec('savepoint attempt');await assert.rejects(()=>query('select request_account_erasure($1)',[owner]),/injected cleanup/);await db.exec('rollback to attempt');
  assert.equal((await query('select banned from users where id=$1',[owner]))[0].banned,false);
  assert.equal((await query('select count(*)::int n from deletion_requests where user_id=$1',[owner]))[0].n,0);
  assert.equal((await query('select count(*)::int n from social_connections where id=$1',[c]))[0].n,1);
  await db.exec('drop trigger fail_erasure on social_connections;drop function fail_erasure_test();');
  const first=(await query('select request_account_erasure($1) result',[owner]))[0].result;
  assert.deepEqual((await query('select request_account_erasure($1) result',[owner]))[0].result,first);
  assert.equal(first.status,'awaiting_retention_review');
  assert.equal((await query('select banned from users where id=$1',[owner]))[0].banned,true);
  assert.equal((await query('select status,verified from profiles where id=$1',[pid]))[0].status,'hidden');
  assert.equal((await query('select count(*)::int n from social_connections where user_id=$1',[owner]))[0].n,0);
  await db.exec('savepoint reconnect');await assert.rejects(()=>query("select verify_provider_connection($1,'Facebook','99881','https://facebook.com/99881','Erasure Owner',null)",[owner]),/Forbidden/);await db.exec('rollback to reconnect');
  await db.exec('savepoint late_write');await assert.rejects(()=>query("insert into social_oauth_states(state_hash,user_id,verifier) values('late-state',$1,'late')",[owner]),/erasure already requested/);await db.exec('rollback to late_write');
  await db.exec('savepoint unban');await assert.rejects(()=>query('update users set banned=false where id=$1',[owner]),/erasure already requested/);await db.exec('rollback to unban');
  for(const role of ['anon','authenticated']){await db.exec('savepoint denied');await db.exec('set local role '+role);await assert.rejects(()=>query('select request_account_erasure($1)',[owner]),/permission denied/);await db.exec('rollback to denied');}
 }finally{await db.exec('rollback');}
});
await test('Page proof expires without the worker, revocation preserves money, and stale jobs cannot replace renewed proof',async()=>{
 await db.exec('begin');
 try{
  const owner=crypto.randomUUID();await query('insert into auth.users(id) values($1)',[owner]);
  const prepare=()=>query("select prepare_monitored_facebook_page($1,'99882','Monitored Page',null,'test',true,true,repeat('x',80),now()+interval '10 days') result",[owner]);
  const {id,profile_id:pid}=(await prepare())[0].result;
  const current=async()=>(await query('select page_proof_current($1) ok',[pid]))[0].ok;
  const order=crypto.randomUUID();
  await query("insert into dodo_orders(id,request_id,user_id,profile_id,amount,currency,billing_country,product_id,documents,documents_hash,consents) values($1,$2,$3,$4,500,'USD','US','prod_page','{}',repeat('a',64),'{}')",[order,crypto.randomUUID(),owner,pid]);
  await query("select apply_dodo_payment($1,'monitored-paid','payment.succeeded','monitored-pay',0,'1.1490','2026-09-21',4351610,0,false,now())",[order]);
  assert.equal((await query('select is_public_profile($1) ok',[pid]))[0].ok,true);
  assert.equal(await current(),true);
  const oldVersion=(await query('select version from facebook_page_grants where connection_id=$1',[id]))[0].version;
  await query("update facebook_page_grants set valid_until=now()-interval '1 second' where connection_id=$1",[id]);
  assert.equal(await current(),false);
  assert.equal((await query('select is_public_profile($1) ok',[pid]))[0].ok,false);
  assert.equal((await query("select count(*)::int n from get_commerce_board() b where b->>'id'=$1",[pid]))[0].n,0);
  await query("select finish_page_check($1,$2,'provider_unavailable')",[id,oldVersion]);assert.equal(await current(),false);
  await prepare();assert.equal(await current(),true);
  assert.equal((await query("select finish_page_check($1,$2,'permission_removed') ok",[id,oldVersion]))[0].ok,false);
  const version=(await query('select version from facebook_page_grants where connection_id=$1',[id]))[0].version;
  await query("select finish_page_check($1,$2,'permission_removed')",[id,version]);
  assert.equal(await current(),false);
  assert.equal((await query('select status from social_connections where id=$1',[id]))[0].status,'unverified');
  assert.equal((await query('select encrypted_token from facebook_page_grants where connection_id=$1',[id]))[0].encrypted_token,'');
  assert.equal((await query('select amount,status from dodo_orders where id=$1',[order]))[0].amount,500);
  await prepare();assert.equal(await current(),true);
  assert.equal((await query('select is_public_profile($1) ok',[pid]))[0].ok,true);
  await query('select request_account_erasure($1)',[owner]);
  assert.equal((await query('select count(*)::int n from facebook_page_grants where connection_id=$1',[id]))[0].n,0);
  for(const role of ['anon','authenticated']){await db.exec('savepoint denied');await db.exec('set local role '+role);await assert.rejects(()=>query('select * from facebook_page_grants'),/permission denied/);await db.exec('rollback to denied');}
 }finally{await db.exec('rollback');}
});
await db.exec(await readFile(new URL('../supabase/migrations/027_page_check_schedule.sql',import.meta.url),'utf8'));
await test('scheduled checks use private, expiring, single-use worker tickets',async()=>{
 await db.exec('begin');
 try{
  const req=(await query('select schedule_page_checks(true) id'))[0].id;
  const token=(await query('select headers from net.http_request_queue where id=$1',[req]))[0].headers.Authorization.slice(7);
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await query('select consume_page_worker_ticket($1) ok',[token]))[0].ok,true);
  assert.equal((await query('select consume_page_worker_ticket($1) ok',[token]))[0].ok,false);
  assert.equal((await query('select consume_page_worker_ticket($1) ok',['x']))[0].ok,false);
  const expiredReq=(await query('select schedule_page_checks(true) id'))[0].id;
  const expiredToken=(await query('select headers from net.http_request_queue where id=$1',[expiredReq]))[0].headers.Authorization.slice(7);
  await query("update page_worker_tickets set expires_at=now()-interval '1 second'");
  assert.equal((await query('select consume_page_worker_ticket($1) ok',[expiredToken]))[0].ok,false);
  for(const role of ['anon','authenticated']){await db.exec('savepoint denied');await db.exec('set local role '+role);await assert.rejects(()=>query('select schedule_page_checks(true)'),/permission denied/);await db.exec('rollback to denied');}
 }finally{await db.exec('rollback');}
});
await db.exec(await readFile(new URL('../supabase/migrations/028_paged_leaderboard.sql',import.meta.url),'utf8'));
await test('paged board preserves public visibility, complete counts, ranking and filters',async()=>{
 const real=(await query('select count(*)::int n from get_commerce_board()'))[0].n;
 const actual=(await query("select get_board_page('{}') b"))[0].b;
 assert.equal(actual.meta.total,real);assert.ok(actual.profiles.length<=10);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(()=>query("select get_board_page('{}')"));}finally{await db.exec('reset role')}}
 await db.exec('begin');
 try{
  // Large deterministic source at the existing visibility boundary, rolled back.
  await db.exec(`create or replace function public.get_commerce_board() returns setof jsonb language sql stable security definer set search_path=public as $$
   select jsonb_build_object('id',lpad(i::text,32,'0')::uuid,'name',case when i=205 then 'Žaneta Fotografka' else 'Creator '||i end,'username','creator'||i,'slug','creator-'||i,'bio','Tvorba','platform',case when i%2=0 then 'Facebook' else 'Instagram' end,'category','Photography','country',case when i%2=0 then 'CZ' else 'US' end,'region','Praha','language','cs','status','active','verified',true,'rank_score',1000-i,'today_score',case when i<=20 then 1000-i else 0 end,'week_score',1000-i,'month_score',1000-i,'total_paid',0,'paid_totals',jsonb_build_object('USD',500),'views',i,'clicks',1,'created_at','2026-01-01T00:00:00Z','registration_at','2026-01-01T00:00:00Z') from generate_series(1,230) i;
  $$;`);
  const get=async(options)=>(await query('select get_board_page($1::jsonb) b',[JSON.stringify(options)]))[0].b;
  const top=await get({});assert.equal(top.profiles.length,10);assert.equal(top.meta.total,230);assert.equal(top.meta.summary.count,230);assert.equal(top.meta.summary.totals.USD,115000);assert.equal(top.meta.counts.Facebook,115);
  const one=await get({full:true,page:1}),two=await get({full:true,page:2}),last=await get({full:true,page:999});
  assert.equal(one.profiles.length,100);assert.equal(two.profiles.length,100);assert.equal(two.profiles[0].rank,101);assert.equal(last.meta.page,3);assert.equal(last.profiles.length,30);
  assert.equal(new Set([...one.profiles,...two.profiles,...last.profiles].map(p=>p.id)).size,230);
  const search=await get({query:'zaneta'});assert.equal(search.profiles[0].rank,205);assert.equal(search.profiles[0].name,'Žaneta Fotografka');
  assert.equal((await get({query:'fotografove'})).meta.total,230);
  assert.equal((await get({period:'today'})).meta.total,20);
  const country=await get({country:'CZ',query:'creator4'});assert.equal(country.profiles[0].rank,2);
  const network=await get({platform:'Instagram',full:true,page:2});assert.equal(network.profiles.length,15);assert.equal(network.profiles[0].rank,101);
  assert.equal((await get({query:'%_'})).meta.total,0);assert.equal((await get({language:'de'})).meta.total,0);
 }finally{await db.exec('rollback');}
});
await db.exec('alter table net._http_response add column headers jsonb');
await db.exec(await readFile(new URL('../supabase/migrations/029_mail_throughput.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/030_legacy_mail_retry_window.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/031_page_check_private_hosting.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/032_core_private_v1.sql',import.meta.url),'utf8'));
await test('mail uses a shared one-second throttle, provider cooldown and stable per-message keys',async()=>{
 await db.exec('begin');try{
  await query("update email_outbox set status='cancelled' where status<>'sent'");
  await query('update mail_settings set enabled=true,last_enqueued_at=null,paused_until=null');
  const ids=(await query("insert into email_outbox(dedupe_key,recipient,subject,body) select 'throughput-'||i,'test@example.test','Test','Message' from generate_series(1,3) i returning id")).map(r=>r.id);
  const run=async()=>(await query('select process_mail_queue() r'))[0].r;
  assert.equal((await run()).queued,1);assert.equal((await run()).queued,0);
  await query("update mail_settings set last_enqueued_at=now()-interval '2 seconds'");assert.equal((await run()).queued,1);
  const row=(await query("select * from email_outbox where id=any($1) and status='sending' order by created_at,id limit 1",[ids]))[0];
  await query("insert into net._http_response(id,status_code,content,headers) values($1,429,'{}','{\"retry-after\":\"120\"}')",[row.http_request_id]);
  await run();assert.equal((await query("select paused_until>=now()+interval '120 seconds' ok from mail_settings"))[0].ok,true);
  await query("update mail_settings set last_enqueued_at=now()-interval '2 seconds'");assert.equal((await run()).queued,0);
  await query("update email_outbox set status='cancelled' where id=any($1) and id<>$2",[ids,row.id]);await query('update mail_settings set paused_until=null');await query("update email_outbox set next_attempt_at=now()-interval '1 second' where id=$1",[row.id]);await run();
  const retried=(await query('select * from email_outbox where id=$1',[row.id]))[0];assert.equal(retried.attempts,2);
  const key=(await query('select headers from net.http_request_queue where id=$1',[retried.http_request_id]))[0].headers['Idempotency-Key'];assert.equal(key,row.id);
  await query("insert into net._http_response(id,status_code,content) values($1,200,'{\"id\":\"accepted-once\"}')",[retried.http_request_id]);await run();assert.equal((await query('select status from email_outbox where id=$1',[row.id]))[0].status,'sent');
  await query("update email_outbox set status='cancelled' where status<>'sent'");await query('update mail_settings set enabled=false,last_enqueued_at=null');
  await query("insert into email_outbox(dedupe_key,recipient,subject,body) select 'fallback-'||i,'test@example.test','Test','Message' from generate_series(1,3) i");
  const claimed=await query('select * from claim_email_batch()');assert.equal(claimed.length,1);assert.ok(claimed[0].first_attempt_at);assert.equal((await query('select * from claim_email_batch()')).length,0);
  await query("update email_outbox set status='cancelled' where status<>'sent'");await query('update mail_settings set last_enqueued_at=null');
  const legacy=(await query("insert into email_outbox(dedupe_key,recipient,subject,body,status,attempts,created_at) values('legacy-ambiguous','test@example.test','Test','Message','failed',1,now()-interval '2 days') returning id"))[0].id;
  assert.equal((await query('select * from claim_email_batch()')).length,0);assert.equal((await query('select last_error from email_outbox where id=$1',[legacy]))[0].last_error,'manual_review_required');
 }finally{await db.exec('rollback');}
});

await db.close();
