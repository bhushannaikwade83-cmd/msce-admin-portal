/** Instructor help cards — errors and fixes (Marathi + English). Images in /public/images/guide/ */

export type TroubleshootingCard = {
  id: string
  icon: string
  titleEn: string
  titleMr: string
  summaryEn: string
  summaryMr: string
  image: string
  imageAlt: string
  stepsEn: string[]
  stepsMr: string[]
  tipsEn?: string[]
  tipsMr?: string[]
  relatedGuideId?: string
}

export const instructorTroubleshootingCards: TroubleshootingCard[] = [
  {
    id: 'usb-debugging',
    icon: '🛡️',
    titleEn: '“USB Debugging Detected” — app blocked',
    titleMr: '“USB Debugging Detected” — ॲप ब्लॉक',
    summaryEn:
      'The app blocks attendance while USB debugging or fake-location tools are active. This protects against GPS spoofing and desktop cheating tools.',
    summaryMr:
      'USB debugging किंवा खोटी लोकेशन (GPS Spoofing) साधने चालू असताना ॲप उपस्थिती थांबवते. हे सुरक्षेसाठी आहे.',
    image: '/images/guide/gps-spoofing-usb-debugging.png',
    imageAlt: 'How to turn off USB debugging and developer options for MSCE Attendance',
    relatedGuideId: 'gps',
    stepsEn: [
      'Open Settings on the Android phone.',
      'Scroll down → tap System or Additional settings.',
      'Open Developer options.',
      'Turn OFF the main Developer options toggle at the top.',
      'If USB debugging is ON, turn it OFF as well.',
      'Disconnect any desktop spoofing / fake GPS tools.',
      'Open MSCE Attendance again → tap Check again on the error screen.',
    ],
    stepsMr: [
      'मोबाईलवर Settings (सेटिंग्ज) उघडा.',
      'खाली स्क्रोल करून System किंवा Additional Settings वर टॅप करा.',
      'Developer options (डेव्हलपर पर्याय) निवडा.',
      'वरचा Developer options टॉगल बंद करा.',
      'USB debugging चालू असेल तर तो देखील बंद करा.',
      'कोणतेही desktop spoofing / fake GPS टूल बंद करा.',
      'MSCE Attendance पुन्हा उघडा → Check again वर टॅप करा.',
    ],
    tipsEn: [
      'Do not use fake location apps or GPS spoofing — attendance will not be recorded and the account may stay blocked.',
    ],
    tipsMr: [
      'खोटी लोकेशन (GPS Spoofing) वापरू नका — उपस्थिती नोंदवली जाणार नाही.',
    ],
  },
  {
    id: 'photo-edit-once',
    icon: '🔄',
    titleEn: 'Wrong student photo at registration — one-time edit',
    titleMr: 'चुकीचा विद्यार्थी फोटो — एकदाच Edit',
    summaryEn:
      'If the first registration photo was wrong, the app allows one re-capture per student using the swap icon on the student row. Install the latest APK from this website.',
    summaryMr:
      'सुरुवातीचा Photo चुकीचा झाला असेल तर प्रत्येक विद्यार्थ्यासाठी एकदाच पुन्हा Edit करता येते. या साइटवरून नवीन APK इन्स्टॉल करा.',
    image: '/images/guide/student-photo-edit-once.png',
    imageAlt: 'One-time student photo edit using refresh icon in MSCE Attendance',
    relatedGuideId: 'students',
    stepsEn: [
      'Uninstall the old MSCE Attendance app from the phone.',
      'Download and install the latest APK from this page (Download APK button).',
      'Sign in with Institute ID and admin password.',
      'Open Student Management → find the student.',
      'Tap the blue refresh / swap icon (one-time photo edit) on that student’s row.',
      'Capture a new live face photo with the same rules as registration (clear background, one face, good light).',
      'After the one edit is used, contact MSCE support if another change is needed.',
    ],
    stepsMr: [
      'जुने MSCE Attendance App uninstall करा.',
      'या पेजवरून नवीन APK डाउनलोड करून install करा.',
      'Institute Login ने साइन इन करा.',
      'Student Management → विद्यार्थी निवडा.',
      'विद्यार्थी ओळीवरील निळा refresh / swap चिन्हावर टॅप करा (एकदाच संधी).',
      'नवीन live फोटो घ्या — registration सारखेच नियम.',
      'एकदा edit झाल्यानंतर पुन्हा बदलासाठी MSCE support शी संपर्क करा.',
    ],
    tipsEn: [
      'The swap icon appears only while the one-time edit is still available for that student.',
    ],
    tipsMr: [
      'एकदाच edit संधी असतानाच swap चिन्ह दिसते.',
    ],
  },
  {
    id: 'gps-room-center',
    icon: '📍',
    titleEn: 'Setting GPS location — stand in the centre of the room',
    titleMr: 'GPS लोकेशन सेट — खोलीच्या मध्यभागी उभे राहा',
    summaryEn:
      'When locking GPS, stand in the middle of the room where attendance is marked. The fixed 15 m radius then covers the whole room. Radius cannot be changed in the app.',
    summaryMr:
      'GPS lock करताना ज्या खोलीत उपस्थिती घेतली जाते त्या खोलीच्या मध्यभागी (center) उभे राहून Use Current Location वापरा. 15 मीटर रेंज निश्चित आहे.',
    image: '/images/guide/gps-room-center-15m.png',
    imageAlt: 'Stand in centre of room for 15 metre GPS geofence',
    relatedGuideId: 'gps',
    stepsEn: [
      'Open GPS Settings in the app (Location tab in the bottom bar).',
      'Go to the physical centre of the classroom / lab where teachers mark attendance.',
      'Tap Use Current Location while standing there (not at the door or corridor).',
      'Confirm coordinates are saved — location becomes locked.',
      'Attendance works only within 15 metres of that point.',
      'To move the point: MSCE super admin clears GPS on the portal; then set again from the app.',
    ],
    stepsMr: [
      'ॲपमध्ये GPS Settings (Location टॅब) उघडा.',
      'ज्या खोलीत उपस्थिती घेतली जाते त्या खोलीच्या मध्यभागी जा.',
      'तिथे उभे राहून Use Current Location वापरा.',
      'लोकेशन lock झाल्यावर 15 मीटर आतच उपस्थिती चालेल.',
      'लोकेशन बदलण्यासाठी: super admin website वरून GPS clear करेल; मग ॲपमधून पुन्हा सेट करा.',
    ],
    tipsEn: ['Tip: 15 m range is fixed and cannot be widened in the app.'],
    tipsMr: ['टीप: 15 मीटर रेंज बदलता येत नाही.'],
  },
]

/** Drop your MP4 here: public/videos/student-registration-attendance.mp4 */
export const STUDENT_REG_ATTENDANCE_VIDEO_URL = '/videos/student-registration-attendance.mp4'
