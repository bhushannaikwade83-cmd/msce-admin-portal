export const STRINGS = {
  config: {
    title: '⚙️ Configuration Required',
    instructions: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file (same values as the mobile app).',
  },
  loading: {
    verifyingSession: 'Verifying session…',
    checkingAccess: 'Checking portal access…',
  },
  auth: {
    accessDenied: 'Access not allowed',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    unauthorizedPortal: 'This account cannot use the MSCE admin portal.',
  },
} as const
