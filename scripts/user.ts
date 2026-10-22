import 'dotenv/config';
import { createStore, audit, type User } from '../apps/api/src/store.js';
const [sub, role, name] = process.argv.slice(2);
if (!sub || !['employee', 'manager', 'methodologist', 'admin'].includes(role) || !name)
  throw Error('Usage: db:user -- <OIDC subject> <role> <name>');
const store = await createStore();
await store.tx((s) => {
  if (s.users.some((u) => u.sub === sub)) throw Error('Subject already exists');
  const id = crypto.randomUUID();
  s.users.push({ id, sub, role: role as User['role'], name, position: 'BI Academy' });
  audit(s, 'bootstrap', 'user.created', id);
  console.log('User created:', id);
});
await store.close();
