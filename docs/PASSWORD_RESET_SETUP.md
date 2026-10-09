# Password reset setup

The application supports password reset by email address or username. The flow is:

1. The user enters an email address or username at `/forgot-password`.
2. Firebase sends a time-limited password-reset email to the account email.
3. The link opens `/auth/action` with Firebase's `mode` and `oobCode` query parameters, then routes password resets to `/reset-password`.
4. The application verifies the code, accepts a strong new password, revokes existing refresh tokens, and redirects to `/login`.
5. The user signs in with the email address or username and the new password.

## Required Firebase console configuration

Firebase chooses the action-handler URL from the Authentication email template. Configure it once for each environment:

1. Open **Firebase Console → Authentication → Templates → Password reset**.
2. Choose **Customize action URL**.
3. Set the development URL to `http://localhost:5173/auth/action`.
4. Set the production URL to `https://YOUR_DOMAIN/auth/action` before deployment.
5. Add the same host under **Authentication → Settings → Authorized domains**.

The server's `FRONTEND_URL` must match the active frontend origin. The backend sends `/login?passwordReset=success` as the safe continue URL.

The shared `/auth/action` handler also processes Firebase email-verification links, so customizing the project action URL does not break account verification.

If no custom action URL is configured, Firebase's hosted reset page still changes the password and then returns the user to the login page, but the in-app `/reset-password` form will not be used.

## Username notes

- Usernames are unique and case-insensitive.
- They contain 3–30 letters, numbers, dots, underscores, or hyphens.
- Accounts created before username support can continue using their email address, then choose a username from the Profile page.
