# Campus Guardian — Final Live Version

A mobile-friendly campus lost-and-found web app using Supabase Auth, Postgres, Storage and Realtime.

## Student flow
- Every student creates their own account from **Create Student Account**.
- Email can be Gmail/college email.
- Student creates a **separate Campus Guardian password**. The Gmail password is never requested.
- Student role is fixed to `student`; students cannot create Manager accounts.
- Students can report lost items and found items with photos.
- Students see live found items and their smart match scores.
- Only the owner of a matching lost report can submit **CLAIM ITEM**.
- Claim status is Pending / Approved / Rejected.
- Manager approval reveals exact pickup/storage/contact details.

## Manager flow
- Manager uses a separate email/password login.
- Only a profile with `role = manager` can approve/reject claims.
- After physical handover, Manager clicks **Mark Returned & Remove**.
- The database function permanently removes the claim, lost report and found item, so it disappears from live data and there is no in-app history afterward.

## Supabase setup
1. Run `supabase-schema.sql` if the base schema has not already been created.
2. Run `supabase-final-migration.sql` **once** after the base schema. It can also be rerun because policies/functions are recreated safely.
3. In Storage, create a bucket named `campus-images`. Keep it **private** and limit images to 5 MB if desired.
4. Authentication → Sign In / Providers → Email: enable email signups. For a simple demo, you may turn email confirmation off; in production, email confirmation is recommended.
5. Put your Supabase **project root URL** (for example `https://YOURPROJECT.supabase.co`, with no `/rest/v1/`) and the publishable/anon key into `config.js`.
6. Never put a service-role/secret key in the browser or GitHub.

## Existing project warning
If you already ran the original schema and the student-registration SQL, do **not** rerun the old schema just to fix policies. Run the new `supabase-final-migration.sql` instead.

## Local test
Open this folder in VS Code, trust the folder, and use **Open with Live Server** on `index.html`.

Test in this order:
1. Create a new Student Account.
2. Login as that student.
3. Report a Lost Item with a photo.
4. Report a Found Item with a photo from the same or another student account.
5. Check **My Matches** and submit a claim.
6. Login as Manager in a separate browser/incognito window.
7. Approve the claim.
8. Student refreshes **Claim Status** and sees pickup/contact details.
9. Manager clicks **Mark Returned & Remove**. The item is removed from Live Found and the claim/history is removed from the app.

## GitHub / hosting
This is a static frontend, so it can be pushed to GitHub and hosted with GitHub Pages or another static host. Add the final deployed site URL to Supabase Auth URL configuration before production use.
