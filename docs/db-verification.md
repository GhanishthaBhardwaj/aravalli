# Database verification

**Status: not run yet.**

The schema, migrations and checks are written, and 32 automated tests check the SQL as text (every foreign key is
composite and tenant-scoped, history tables are protected, the value lists match the TypeScript ones, and so on). But
nothing here has been executed on a real MySQL server, so no claim about how MySQL behaves is made on this page.

When MySQL 8 is installed and `.env` is filled in, this is the command that proves it, and it overwrites this file with
the real results (including MySQL's own error messages for every rejected statement):

```
npm run db:migrate
npm run db:seed
npm run db:verify -- --report docs/db-verification.md
```

`db:verify` builds a throwaway `<DB_NAME>_verify` database, so your own database is never touched.
