import 'dotenv/config';
import { createStore, audit, type Role } from '../apps/api/src/store.js';
// Trusted operator CLI for the first local admin; never exposed as a public API.
const [identifier, role, managerId] = process.argv.slice(2);
if (!identifier || !['employee', 'manager', 'methodologist', 'admin'].includes(role))
  throw Error('Usage: db:role -- <user ID, verified email or phone> <role> [manager ID]');
const store = await createStore();
try {
  await store.tx((s) => {
    const account = s.accounts.find(
      (a) => a.email === identifier.trim().toLowerCase() || a.phone === identifier,
    );
    const user = s.users.find((u) => u.id === (account?.userId ?? identifier));
    if (!user) throw Error('User not found. Complete registration first.');
    if (
      managerId &&
      (!s.users.some((u) => u.id === managerId && u.role === 'manager') || managerId === user.id)
    )
      throw Error('Use an existing manager ID other than the user');
    user.role = role as Role;
    user.access = 'active';
    if (managerId) user.managerId = managerId;
    audit(s, 'bootstrap', 'user.role_updated', user.id);
    console.log('Role updated:', user.id, role);
  });
} finally {
  await store.close();
}
