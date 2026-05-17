export type ScreenCallout = {
  marker: string
  title: string
  text: string
}

export type AppScreenshot = {
  id: string
  image: string
  title: string
  subtitle: string
  relatedSection?: string
  callouts: ScreenCallout[]
}

const base = '/images/app-screens'

export const appScreenshots: AppScreenshot[] = [
  {
    id: 'splash',
    image: `${base}/splash-msce.png`,
    title: 'App splash screen',
    subtitle: 'Official MSCE logo when the app starts.',
    relatedSection: 'start',
    callouts: [
      {
        marker: '1',
        title: 'Official app',
        text: 'Confirm you opened MSCE Attendance (Maharashtra State Council of Examinations branding).',
      },
    ],
  },
  {
    id: 'login',
    image: `${base}/login-secure.png`,
    title: 'Admin secure login',
    subtitle: 'Institute ID + password + verification code (CAPTCHA).',
    relatedSection: 'register-login',
    callouts: [
      {
        marker: '1',
        title: 'Institute ID (locked)',
        text: 'After first setup on this phone, your 5-digit Institute ID is locked — this admin signs in only for that institute.',
      },
      {
        marker: '2',
        title: 'Password',
        text: 'Enter the password set during institute admin registration. Tap the eye icon to show or hide.',
      },
      {
        marker: '3',
        title: 'Verification code',
        text: 'Type the CAPTCHA exactly as shown (English letters, case-sensitive). Refresh if unclear.',
      },
      {
        marker: '4',
        title: 'Email OTP note',
        text: 'Email OTP is only for Sign up / institute registration — not required on this daily login screen.',
      },
    ],
  },
  {
    id: 'pin-unlock',
    image: `${base}/pin-unlock.png`,
    title: 'Unlock app with PIN',
    subtitle: 'Quick access after you have set a 4-digit PIN.',
    relatedSection: 'pin',
    callouts: [
      {
        marker: '1',
        title: 'Administrator session',
        text: 'Shows your logged-in admin email. Enter the 4-digit PIN you created earlier.',
      },
      {
        marker: '2',
        title: 'Unlock',
        text: 'Tap UNLOCK to open the dashboard without typing password again.',
      },
      {
        marker: '3',
        title: 'Forgot PIN / Logout',
        text: 'Use Forgot PIN if needed, or Logout to sign out completely and return to password login.',
      },
    ],
  },
  {
    id: 'admin-home',
    image: `${base}/admin-home.png`,
    title: 'Admin home dashboard',
    subtitle: 'Daily overview after login, PIN, and GPS setup.',
    relatedSection: 'home',
    callouts: [
      {
        marker: '1',
        title: 'Institute card',
        text: 'Your institute name, city, and Institute ID (example: 99099).',
      },
      {
        marker: '2',
        title: "Today's stats",
        text: 'Present, absent, total students, and attendance rate for the current day.',
      },
      {
        marker: '3',
        title: 'Bottom navigation',
        text: 'Home · Add instructor · Students · GPS · Reports · More — use these tabs for all main tasks.',
      },
    ],
  },
  {
    id: 'instructor-add',
    image: `${base}/instructor-add-user.png`,
    title: 'Register an institute instructor',
    subtitle: 'Admin creates staff who mark attendance with their own PIN.',
    relatedSection: 'staff',
    callouts: [
      {
        marker: '1',
        title: 'Open Add user tab',
        text: 'From bottom bar, tap the person-with-plus icon (second tab).',
      },
      {
        marker: '2',
        title: 'Institute ID shown',
        text: 'Instructors will use this same Institute ID at staff login — plus their personal PIN.',
      },
      {
        marker: '3',
        title: 'Fill form',
        text: 'First / middle / last name, mobile number, 4-digit PIN, confirm PIN. Up to 4 instructor accounts per institute.',
      },
      {
        marker: '4',
        title: 'Create user',
        text: 'Tap Create user. Share the Institute ID and PIN privately with that instructor only.',
      },
    ],
  },
  {
    id: 'students',
    image: `${base}/students-photo-instructions.png`,
    title: 'Students screen & photo rules',
    subtitle: 'Student list, search, and face-photo instructions shown in the app.',
    relatedSection: 'students',
    callouts: [
      {
        marker: '1',
        title: 'Photo instructions card',
        text: 'Good closeup · clear light · no mask · face in focus — same rules as on this website.',
      },
      {
        marker: '2',
        title: 'Tip',
        text: 'Light from the front; face should fill most of the frame.',
      },
      {
        marker: '3',
        title: 'Search & stats',
        text: 'Search by name or SR number. Total / Present / Absent counts update as you mark attendance.',
      },
      {
        marker: '4',
        title: 'Entry / Exit',
        text: 'Open a student row to register face (if new) and tap Entry or Exit per subject.',
      },
    ],
  },
  {
    id: 'reports',
    image: `${base}/student-reports.png`,
    title: 'Student reports',
    subtitle: 'Date range, search, and per-student attendance summary.',
    callouts: [
      {
        marker: '1',
        title: 'Date range',
        text: 'Choose 1 Week, 1 Month, 3 Months, or custom Start / End dates.',
      },
      {
        marker: '2',
        title: 'Load students',
        text: 'Tap Load All Students, then search by name. Each card shows present, absent, days, and total hours.',
      },
    ],
  },
  {
    id: 'institute-report',
    image: `${base}/institute-report.png`,
    title: 'Institute tabular report (PDF)',
    subtitle: 'Export official attendance table for your institute.',
    callouts: [
      {
        marker: '1',
        title: 'Period',
        text: 'Select dates, then review the preview table (Sr No, Student Name, Subjects).',
      },
      {
        marker: '2',
        title: 'Export PDF',
        text: 'Tap EXPORT TABULAR PDF REPORT to save or share the institute report.',
      },
    ],
  },
]
