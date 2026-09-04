# FlashFit Closed-Browser Push Setup

Browser close hone par device notification ke liye ye 4 cheezein zaroori hain:

1. Site HTTPS par deploy honi chahiye. `localhost` testing allowed hai, normal `http` domain par Web Push nahi chalega.
2. User ko notification permission allow karni hogi. Project me auto prompt enabled hai.
3. `database-notifications.sql` Supabase SQL Editor me run karo.
4. Supabase Edge Function `send-web-push` deploy karo aur secrets set karo.

## Supabase commands

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
supabase secrets set VAPID_PUBLIC_KEY=<your-vapid-public-key>
supabase secrets set VAPID_PRIVATE_KEY=<your-vapid-private-key>
supabase secrets set VAPID_SUBJECT=mailto:flashfithelp@gmail.com
supabase functions deploy send-web-push --no-verify-jwt
```

## Important

Website band hone par browser custom MP3 sound play nahi karne deta. Device notification aayegi, sound OS/browser default notification sound se aayega. Site open/background tab me FlashFit loud custom sound bajega.
