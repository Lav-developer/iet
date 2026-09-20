/**
 * Presentation-only replacements for exact legacy bootstrap boilerplate.
 * No database writes and no broad text filtering: newly authored content and
 * institutional facts are preserved. Remove entries after editorial updates.
 */
const legacyCopy: Record<string, string> = {
  "Not specified in the supplied IET profile. Verify the current rule in the official DSMNRU admission bulletin.": "See the current DSMNRU admission bulletin for eligibility requirements.",
  "IET publishes the academic profile; DSMNRU owns admissions infrastructure and current eligibility notices.": "Consult DSMNRU for current application dates, eligibility and admission notices.",
  "IET publishes the programme profile; DSMNRU owns admissions infrastructure and current eligibility notices.": "Consult DSMNRU for current application dates, eligibility and admission notices.",
  "Dean of the Faculty of Engineering & Technology as listed in the supplied IET profile.": "Dean of the Faculty of Engineering & Technology.",
  "The supplied department profile names a Chemistry Lab. Instructor. A full facility description and equipment inventory are awaiting official publication.": "Chemistry laboratory in the Department of Applied Sciences & Humanities. Further facility information will be added here.",
  "The supplied department profile names a Professional Communication Lab. Instructor. A full facility description and equipment inventory are awaiting official publication.": "Professional Communication laboratory in the Department of Applied Sciences & Humanities. Further facility information will be added here.",
  "The supplied department profile names a Physics Lab. Instructor. A full facility description and equipment inventory are awaiting official publication.": "Physics laboratory in the Department of Applied Sciences & Humanities. Further facility information will be added here.",
  "The CSE section includes glimpses of computer labs. Facility-level equipment, access and course mapping are awaiting official publication.": "Computer laboratories in the Department of Computer Science and Engineering. Further facility information will be added here.",
  "The Civil Engineering section includes glimpses of Civil Engineering Labs. Facility-level equipment, access and course mapping are awaiting official publication.": "Laboratories in the Department of Civil Engineering. Further facility information will be added here.",
  "The ECE section includes glimpses of Electronics & Communication Labs. Facility-level equipment, access and course mapping are awaiting official publication.": "Laboratories in the Department of Electronics & Communication Engineering. Further facility information will be added here.",
  "The Mechanical Engineering section includes glimpses of Mechanics Lab. / Workshops. Facility-level equipment, access and course mapping are awaiting official publication.": "Mechanics laboratory and workshops in the Department of Mechanical Engineering. Further facility information will be added here.",
  "The Dean profile identifies nano material, ferroelectric material, phase change material and active / smart material as research areas.": "Research in nanomaterials, ferroelectric materials, phase-change materials and active / smart materials.",
  "The Dean profile lists X-Ray Diffraction, SEM, TEM, AFM and FMR analysis among research areas.": "Research in materials analysis using X-Ray Diffraction, SEM, TEM, AFM and FMR.",
  "The Dean profile identifies thin film technology and nano drug delivery through radiation technology.": "Research in thin film technology and nano drug delivery through radiation technology.",
  "AI & ML is identified in the Dean profile and appears across the institute's CSE postgraduate and honours programme profile.": "Artificial intelligence and machine learning research, with related CSE postgraduate and honours programmes.",
  "The ECE profile names assistive and smart healthcare technologies, affordable rehabilitation devices, wearable electronics and AI-driven biomedical applications.": "Research in assistive and smart healthcare technologies, affordable rehabilitation devices, wearable electronics and AI-driven biomedical applications.",
  "The ECE profile identifies Embedded Systems and Rehabilitation Engineering as emerging domains for the department.": "Embedded Systems and Rehabilitation Engineering are emerging research domains in Electronics & Communication Engineering.",
  "IET was established in 2016 as engineering education expanded within DSMNRU. The supplied institutional profile describes a progression from five core engineering branches towards a broader Faculty of Engineering & Technology, with an emphasis on inclusive, accessible and industry-oriented technical education.": "IET was established in 2016 as engineering education expanded within DSMNRU. It has progressed from five core engineering branches towards a broader Faculty of Engineering & Technology, with an emphasis on inclusive, accessible and industry-oriented technical education.",
  "Discover IET programmes, then continue to the official DSMNRU admissions infrastructure.": "Discover IET programmes and official DSMNRU admission information.",
  "This platform is designed around semantic structure, keyboard navigation, visible focus states, readable contrast, reduced motion and adjustable text size. Institutional content editors should provide meaningful alternative text for every published image and document.": "The website supports keyboard navigation, visible focus states, high contrast, reduced motion and adjustable text size. Contact IET if you encounter an accessibility barrier.",
  "A placeholder policy page for institutional review before production launch.": "Privacy information and enquiries for the IET website.",
  "This policy is a review-ready placeholder. Before launch, DSMNRU / IET administrators should replace it with the institution's approved privacy, retention, cookie and data-subject contact terms.": "An institutional privacy policy is not available on this page yet. Please contact IET with privacy-related questions.",
  "University student services. IET does not duplicate this portal.": "Access university student services.",
  "DSMNRU notices, not an IET-specific event or content feed.": "Official university notices and announcements.",
  "Current admission process, bulletins and university-owned notices.": "Current admission process, bulletins and notices.",
  "IET source profile PDF": "IET institutional profile (PDF)",
  "The source document used for this content model and verified seed records.": "Read the IET institutional profile.",
  "Lucknow, Uttar Pradesh, India · verify the current postal address on the official DSMNRU contact page before publication.": "Lucknow, Uttar Pradesh, India. See the official DSMNRU contact page for the current postal address.",
};
export function publicCopy(value: string): string { return legacyCopy[value] ?? value; }
