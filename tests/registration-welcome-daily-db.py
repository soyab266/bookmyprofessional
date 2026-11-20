import subprocess, pathlib, json, concurrent.futures, os
if os.environ.get("BMP_RUN_LOCAL_WELCOME_DB_TESTS") != "1":
 raise SystemExit("Local-only database test: set BMP_RUN_LOCAL_WELCOME_DB_TESTS=1 explicitly. Uses /tmp socket, port55444, dedicated welcome_daily_test database.")
ROOT=pathlib.Path(__file__).resolve().parents[1]
PSQL=['psql','-h','/tmp','-p','55444','-U','postgres','-d','welcome_daily_test','-v','ON_ERROR_STOP=1','-At']
def q(sql):
 r=subprocess.run(PSQL,input=sql,text=True,capture_output=True)
 if r.returncode: raise AssertionError(r.stderr)
 return r.stdout.strip()
def check(label,sql,expected):
 actual=q(sql); assert actual==expected,(label,actual,expected); print('PASS',label)
subprocess.run(['dropdb','-h','/tmp','-p','55444','-U','postgres','--if-exists','welcome_daily_test'],check=True,capture_output=True)
subprocess.run(['createdb','-h','/tmp','-p','55444','-U','postgres','welcome_daily_test'],check=True)
q('''create extension pgcrypto; create schema auth;
do $$begin create role anon; exception when duplicate_object then null;end$$;
do $$begin create role authenticated; exception when duplicate_object then null;end$$;
do $$begin create role service_role; exception when duplicate_object then null;end$$;
create table auth.users(id uuid primary key,created_at timestamptz not null,email_confirmed_at timestamptz);
create table public.profiles(id uuid primary key,role text,whatsapp_consent boolean,phone text,full_name text,notification_prefs jsonb);
create table public.notification_outbox(id uuid primary key default gen_random_uuid(),user_id uuid,channel text,template text,payload jsonb,status text,attempts integer default 0,created_at timestamptz default now(),updated_at timestamptz default now(),accepted_at timestamptz,last_error text);
create unique index pending_unique on notification_outbox(user_id,template) where status='pending';
create table notification_dispatch_budget(id int,total_used int,expires_at timestamptz);
insert into notification_dispatch_budget values(1,3,'2026-11-20 16:10:33.739189Z');
insert into auth.users select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,now()-interval '5 days',now() from generate_series(1,13)i;
insert into profiles select id,'customer',true,'9876543210','Old Test','{}' from auth.users;
insert into notification_outbox(user_id,channel,template,payload,status,created_at) select id,'whatsapp','bmp_customer_registration_received','{}','pending',now()-interval '1 day' from auth.users;
''')
q((ROOT/'supabase/registration_welcome_daily.sql').read_text())
check('migration inert and excludes exactly13 old tests',"select (not enabled and starts_at is null)::text||','||(select count(*) from registration_welcome_excluded) from registration_welcome_daily",'true,13')
check('disabled claim denied',"select claim_daily_welcome()->>'taken'",'false')
q("update registration_welcome_daily set starts_at=now()+interval '1 day',enabled=true")
check('future start denied',"select claim_daily_welcome()->>'taken'",'false')
q("update registration_welcome_daily set starts_at=now()-interval '2 minutes'")
check('old backlog denied and retained pending',"select (claim_daily_welcome()->>'taken')||','||(select count(*) from notification_outbox where status='pending')",'false,13')
# Add future-stage accounts with no provider involved. Triggers queue only eligible ones.
q('''insert into auth.users select ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,now()-interval '1 minute',now() from generate_series(1,30)i;
insert into profiles select id,case when right(id::text,1) in ('0','2','4','6','8') then 'professional' else 'customer' end,true,'9876543210','New Test','{}' from auth.users where id::text like '1000%';''')
check('profile ready enqueues30new',"select count(*) from notification_outbox where user_id::text like '1000%'",'30')
q("select enqueue_daily_welcome(id) from profiles where id::text like '1000%'")
check('once-per-account dedupe',"select count(*) from notification_outbox where user_id::text like '1000%'",'30')
q((ROOT/'supabase/registration_welcome_daily.sql').read_text())
check('migration reapply never excludes new stage queue',"select count(*) from registration_welcome_excluded",'13')
def claim(_): return json.loads(q('select claim_daily_welcome()'))
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: claims=list(pool.map(claim,range(40)))
taken=[x for x in claims if x['taken']]
assert len(taken)==15,len(taken)
assert len(set(x['ticket'] for x in taken))==15
assert all(x['payload']['to']=='919876543210' for x in taken)
print('PASS 40 concurrent claims stop at15 unique attempts')
check('concurrent budget exact',"select daily_used||','||total_used from registration_welcome_daily",'15,15')
t=taken[0]['ticket']
check('accepted settled',f"select finish_daily_welcome('{t}','accepted')",'t')
check('no double release after accepted',f"select finish_daily_welcome('{t}','not_attempted')",'f')
check('accepted never replayed',"select count(*) from notification_outbox where status='accepted'",'1')
t=taken[1]['ticket']
check('not-attempted releases its own slot',f"select finish_daily_welcome('{t}','not_attempted')",'t')
check('released budget exact',"select daily_used||','||total_used from registration_welcome_daily",'14,14')
check('release idempotent',f"select finish_daily_welcome('{t}','not_attempted')",'f')
# Midnight transition simulated through prior day_key; real function uses Asia/Kolkata date.
q("update registration_welcome_daily set day_key=(now() at time zone 'Asia/Kolkata')::date-1,daily_used=15")
fresh=claim(0);assert fresh['taken']
check('IST next day gives fresh daily15 without resetting total',"select daily_used||','||total_used from registration_welcome_daily",'1,15')
t=taken[2]['ticket'];q(f"update registration_welcome_daily_claims set day_key=(now() at time zone 'Asia/Kolkata')::date-1 where id='{t}'")
q(f"select finish_daily_welcome('{t}','not_attempted')")
check('late prior-day release cannot reduce new-day counter',"select daily_used||','||total_used from registration_welcome_daily",'1,14')
# Uncertain is held and never eligible again.
t=taken[3]['ticket'];q(f"select finish_daily_welcome('{t}','uncertain')")
check('uncertain held',"select count(*) from notification_outbox where status='uncertain'",'1')
q("update registration_welcome_daily set enabled=false")
check('manual stop denies next claim',"select claim_daily_welcome()->>'taken'",'false')
check('expired pilot history untouched',"select (total_used=3 and expires_at='2026-11-20 16:10:33.739189Z') from notification_dispatch_budget",'t')
check('old13 still allpending with0attempts',"select count(*)||','||sum(attempts) from notification_outbox where id in(select outbox_id from registration_welcome_excluded)",'13,0')
# Eligibility combinations after removing current-stage pending rows, preserving excluded tests.
q("update notification_outbox set status='skipped' where user_id::text like '1000%' and status='pending'; update registration_welcome_daily set enabled=true")
for i,(consent,phone,prefs,confirmed,created,role) in enumerate([
 ('false','9876543210','{}','now()',"now()-interval '1 minute'",'customer'),
 ('true','447700900123','{}','now()',"now()-interval '1 minute'",'customer'),
 ('true','9876543210','{\"whatsapp\":false}','now()',"now()-interval '1 minute'",'customer'),
 ('true','9876543210','{}','null',"now()-interval '1 minute'",'professional'),
 ('true','9876543210','{}','now()',"now()-interval '5 days'",'professional'),
 ('true','9876543210','{}','now()',"now()-interval '1 minute'",'admin')],100):
 u=f'20000000-0000-0000-0000-{i:012}'
 q(f"insert into auth.users values('{u}',{created},{confirmed}); insert into profiles values('{u}','{role}',{consent},'{phone}','No send','{prefs}');")
check('no consent foreign optout unconfirmed oldaccount admin never queued',"select count(*) from notification_outbox where user_id::text like '2000%'",'0')
q("insert into notification_outbox(user_id,channel,template,payload,status) select id,'whatsapp','bmp_professional_registration_received','{}','pending' from auth.users where id::text='00000000-0000-0000-0000-000000000001'")
check('fresh outbox for old account cannot bypass cutoff',"select claim_daily_welcome()->>'taken'",'false')
# Verify deferred auth confirmation path after profile existed without verified email.
u='20000000-0000-0000-0000-000000000103'
q(f"update auth.users set email_confirmed_at=now() where id='{u}'")
check('later email confirmation queues new consenting account',f"select count(*) from notification_outbox where user_id='{u}'",'1')
q("update registration_welcome_daily set enabled=false")
# Permissions: anon cannot mutate counters or call claim.
for label,sql in [('anon claim','set role anon; select claim_daily_welcome()'),('authenticated claim','set role authenticated; select claim_daily_welcome()'),('anon config','set role anon; update registration_welcome_daily set enabled=true')]:
 r=subprocess.run(PSQL,input=sql,text=True,capture_output=True);assert r.returncode!=0,label;print('PASS',label,'denied')
print('ALL LOCAL DB CHECKS PASSED. No live system or provider used.')
