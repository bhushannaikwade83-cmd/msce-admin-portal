export type GuideStep = {
  title: string
  body: string
  bullets?: string[]
}

export type GuideSection = {
  id: string
  icon: string
  title: string
  summary: string
  steps: GuideStep[]
  tips?: string[]
  warnings?: string[]
}

export const guideNav = [
  { id: 'start', label: 'Start' },
  { id: 'register-login', label: 'Register & login' },
  { id: 'pin', label: 'PIN' },
  { id: 'gps', label: 'GPS lock' },
  { id: 'home', label: 'Home screen' },
  { id: 'students', label: 'Students & face' },
  { id: 'attendance', label: 'Mark attendance' },
  { id: 'staff', label: 'Instructor' },
  { id: 'app-screens', label: 'Screenshots' },
] as const

export const instituteGuideSections: GuideSection[] = [
  {
    id: 'start',
    icon: '📲',
    title: 'Install the app & permissions',
    summary:
      'Download the APK, install on an Android phone used at your institute, and allow the permissions the app asks for.',
    steps: [
      {
        title: 'Download and install',
        body: 'Use the Download APK button on this page. Open the file on the phone and complete installation. Use the official build shared by MSCE only.',
      },
      {
        title: 'Allow camera',
        body: 'Camera is required for student face registration and for every Entry / Exit attendance photo.',
        bullets: ['Used only for live capture in the app', 'Not optional for attendance marking'],
      },
      {
        title: 'Allow location',
        body: 'Location is required so attendance can be checked against your locked GPS zone.',
        bullets: ['Turn on device GPS / location services', 'Grant “While using the app” when prompted'],
      },
    ],
    tips: [
      'First-time setup usually takes about 5–15 minutes per admin device.',
      'Use good Wi‑Fi or mobile data when registering students and syncing photos.',
    ],
  },
  {
    id: 'register-login',
    icon: '🔐',
    title: 'Institute registration & admin login',
    summary:
      'Your institute is onboarded with an Institute ID and admin account. Sign in with password and CAPTCHA verification.',
    steps: [
      {
        title: 'If you received an invite',
        body: 'Open the app, find your institute (name or Institute ID), and complete registration with the email and details provided. Set a strong password (at least 8 characters).',
        bullets: [
          'Confirm email if the system asks you to verify',
          'After registration, sign in with Institute ID + password',
        ],
      },
      {
        title: 'Admin login screen',
        body: 'On the login screen enter your 5‑digit Institute ID, your password, and the CAPTCHA code shown in the box.',
        bullets: [
          'Type the CAPTCHA exactly as displayed (letters are case-sensitive)',
          'Tap refresh on the CAPTCHA if it is hard to read',
          'Use “Find Institute” if you need to search by institute name or city',
        ],
      },
      {
        title: 'After successful login',
        body: 'The app may guide you through a short welcome / onboarding flow, then PIN setup (if not done yet) and GPS lock before full use of the dashboard.',
      },
    ],
    warnings: [
      'Do not share your admin password. Each institute’s data is separate.',
      'CAPTCHA is required on login to reduce automated abuse.',
    ],
  },
  {
    id: 'pin',
    icon: '🔑',
    title: 'Set your 4‑digit PIN',
    summary:
      'After login, set a quick PIN for faster access on the same device. This is for the institute admin account on that phone.',
    steps: [
      {
        title: 'Create PIN',
        body: 'Enter a 4‑digit PIN, then confirm the same PIN on the next step.',
        bullets: [
          'Digits only (0–9)',
          'Remember the PIN — you will use it for quicker unlock on this device',
        ],
      },
      {
        title: 'Security behaviour',
        body: 'If the wrong PIN is entered too many times, the app locks PIN entry for a short period (about 10 minutes) to protect the account.',
      },
      {
        title: 'Midnight logout',
        body: 'PIN sessions are designed for daily use at the institute; the app can sign you out automatically at midnight so the device is not left logged in overnight.',
      },
    ],
    tips: ['PIN is optional on first setup in some flows, but strongly recommended for daily marking.'],
  },
  {
    id: 'gps',
    icon: '📍',
    title: 'GPS geo‑fence lock (attendance zone)',
    summary:
      'Before marking attendance, each admin must lock their attendance location. Attendance only works inside the fixed zone around that point.',
    steps: [
      {
        title: 'Open GPS Settings',
        body: 'From the bottom navigation or when the app prompts you, open GPS Settings. Stand at the place where teachers normally mark attendance (office gate, lab entrance, etc.).',
      },
      {
        title: 'Lock your point',
        body: 'Save / lock your personal attendance GPS point at that physical location. The app uses your device’s current location when you lock.',
        bullets: [
          'Radius is fixed at 15 metres in all directions from the locked point',
          'The radius cannot be widened in the app — this prevents marking from home or far away',
        ],
      },
      {
        title: 'When marking is blocked',
        body: 'If you are outside the 15 m zone, Entry / Exit and some dashboard actions will be blocked until you return inside the fence or update the lock from the correct place.',
      },
    ],
    warnings: [
      'Each admin has their own GPS lock on their phone — set it where that person actually marks attendance.',
      'Poor GPS signal indoors can sometimes delay verification; wait a few seconds and try again near a window or open area if needed.',
    ],
  },
  {
    id: 'home',
    icon: '🏠',
    title: 'Admin home screen',
    summary:
      'After login, PIN, and GPS setup, the home dashboard is your control centre for the institute.',
    steps: [
      {
        title: 'What you see',
        body: 'The home screen shows institute summary, quick stats, and shortcuts to daily work.',
        bullets: [
          'Student Management — add students, subjects, face registration',
          'Attendance / marking flows — go to students and mark Entry or Exit',
          'Reports — daily and institute reports, exports',
          'GPS Settings — view or re‑lock your attendance zone',
          'Staff / attendance users — add instructors with their own PIN (if enabled for your institute)',
        ],
      },
      {
        title: 'Before marking attendance',
        body: 'If GPS is not locked, the app will remind you to open GPS Settings from the bottom bar and complete the lock first.',
      },
    ],
  },
  {
    id: 'students',
    icon: '👤',
    title: 'Register students & face photo',
    summary:
      'Every student who will use face attendance must be added in Student Management and registered with a live face photo.',
    steps: [
      {
        title: 'Add student record',
        body: 'Open Student Management → add student with roll number, name, class/batch, and subjects as required by your institute.',
      },
      {
        title: 'Face registration (biometric scanner)',
        body: 'Open face registration for that student. The same biometric scanner used for attendance will open.',
        bullets: [
          'Only one student in the frame — no group photos',
          'Plain, clear background (wall is best) — avoid busy posters, other people, or objects covering the face',
          'Good front lighting on the face; no mask; eyes open',
          'Stand at arm’s length; position face inside the on‑screen guide circle',
          'Blink twice when asked, then hold still until capture completes',
        ],
      },
      {
        title: 'Photo quality rules (in‑app)',
        body: 'The app expects a clear close‑up: face fills most of the frame, in focus, well lit, fully visible. Registration may fail if another student’s face is already stored as a duplicate.',
      },
    ],
    tips: [
      'Register students before the first class so Entry marking is not delayed.',
      'Re‑register only when appearance changes significantly (e.g. beard, major haircut) or if verification often fails.',
    ],
    warnings: [
      'Do not register from a photo on another phone or printed ID — use live camera only.',
    ],
  },
  {
    id: 'attendance',
    icon: '✅',
    title: 'How to mark Entry & Exit attendance',
    summary:
      'Attendance is marked per student, per subject slice, with live face verification at the institute GPS zone.',
    steps: [
      {
        title: 'Prerequisites',
        body: 'You must be inside the 15 m GPS zone, logged in, and the student must already have face registration completed.',
        bullets: [
          'Entry without face registration is disabled for that student',
          'Select the correct student and subject before opening the camera',
        ],
      },
      {
        title: 'Mark Entry',
        body: 'In Student Management, find the student → tap Entry for the subject. The biometric scanner opens.',
        bullets: [
          'One student only in front of the camera',
          'Clear background, good light, face in the guide circle',
          'Blink once when prompted (attendance uses one blink; registration uses two)',
          'Hold still for capture; the app verifies the face against that student’s registration',
        ],
      },
      {
        title: 'Mark Exit',
        body: 'After Entry is recorded, use Exit for the same subject when the student leaves. The same camera and verification rules apply. Exit may be time‑limited by your institute’s attendance window settings.',
      },
      {
        title: 'If verification fails',
        body: 'Read the message on screen: move closer or farther to fit the guide, improve lighting, remove mask, or retry. If the face does not match, attendance is not saved — do not force through with another student’s account.',
      },
    ],
    warnings: [
      'Attendance is tied to the student you selected — always confirm name and roll on screen before capturing.',
      'Marking for a student who is not present is a policy violation; the app is designed to detect wrong faces and photo‑of‑photo attempts.',
    ],
  },
  {
    id: 'staff',
    icon: '👨‍🏫',
    title: 'Register & login as institute instructor',
    summary:
      'Admins add up to 4 instructor accounts. Each instructor signs in with the same Institute ID and their own 4‑digit PIN (staff login screen in the app).',
    steps: [
      {
        title: 'Admin: add an instructor',
        body: 'On the admin phone, open the bottom bar → tap the Add user tab (person with + icon).',
        bullets: [
          'Screen title: Institute instructor',
          'Note the Institute ID shown (e.g. 99099) — instructors need this number',
          'Enter first name, middle name, last name, mobile number',
          'Set PIN (4 digits) and Confirm PIN — must match',
          'Tap Create user',
        ],
      },
      {
        title: 'Share credentials with instructor',
        body: 'Give the instructor only their own PIN. They use the institute’s Institute ID (not their mobile as ID).',
        bullets: [
          'Institute ID: 5 digits (same for all staff at your institute)',
          'PIN: 4 digits (unique per instructor)',
          'Do not share admin password with instructors',
        ],
      },
      {
        title: 'Instructor: how to log in',
        body: 'On the staff / instructor login screen (separate from admin password login), enter Institute ID and PIN.',
        bullets: [
          'Must be inside the GPS attendance zone (~15 m) — same as admin',
          'Location permission required',
          'Session may end at midnight for security',
        ],
      },
      {
        title: 'What instructors can do',
        body: 'After login, instructors use Students tab to mark Entry / Exit for students (face + GPS rules same as admin). They typically cannot change institute GPS lock or add other instructors.',
      },
    ],
    tips: [
      'See the Visual guide section below for labelled screenshots of instructor registration and login.',
    ],
  },
]

export const photoDoList = [
  'One student only in the camera',
  'Plain clear background (no crowd, no posters blocking face)',
  'Face centred in the on‑screen circle',
  'Good front lighting, no mask, eyes open',
  'Live camera only — not a photo of a photo',
]

export const photoDontList = [
  'Multiple faces in frame',
  'Dark room or strong backlight',
  'Hat/mask covering face',
  'Registering someone else’s picture from a screen or printout',
]
